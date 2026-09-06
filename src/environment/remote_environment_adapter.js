import {EnvironmentAdapter} from './environment_adapter.js';
import {Store} from '../state/store.js';
import {RobotInterface} from '../robot/robot_interface.js';
import {HttpJsonEnvironmentTransport} from './remote_environment_transport.js';
import {ENVIRONMENT_BRIDGE_COMMANDS,mergeRemoteRuntimeState} from './environment_bridge_protocol.js';
import {validateTaskRuntimeState,TASK_RUNTIME_STATE_SCHEMA} from './task_state_contract.js';
import {validateSensorPacket} from './spatial_sensor_contract.js';

function bodyData(body){return body?.data??body?.result??null}
function responseState(body){return body?.state??bodyData(body)?.state??null}
function responseDescriptor(body){return body?.descriptor??bodyData(body)?.descriptor??null}
const distance=(a,b)=>Math.hypot((Number(a?.x)||0)-(Number(b?.x)||0),(Number(a?.y)||0)-(Number(b?.y)||0));
const deg2rad=d=>Number(d||0)*Math.PI/180;

class RemoteRobotProxy extends RobotInterface{
  constructor(environment){super();this.environment=environment}
  async connect(){return this.environment.connect()}
  getObservation(){return this.environment.observe()}
  async sendAction(action){return this.environment.step(action)}
  async disconnect(){return this.environment.disconnect()}
  describe(){const d=this.environment.describe();return{id:'remote_robot_proxy',environmentAdapterId:this.environment.id,remoteEnvironmentId:d.remoteEnvironmentId||null,transport:this.environment.transport?.describe?.()||null}}
}

export class RemoteEnvironmentAdapter extends EnvironmentAdapter{
  constructor({transport=null,baseUrl=null,endpoint='/environment',headers={},timeoutMs=15000,id='remote_bridge',label='Remote Environment Bridge'}={}){
    super({id,label,version:3,kind:'external',fidelity:'remote'});
    this.transport=transport||new HttpJsonEnvironmentTransport({baseUrl,endpoint,headers,timeoutMs});
    this.store=new Store();this.robot=new RemoteRobotProxy(this);this.remoteDescriptor=null;this.remoteDomainServices=new Set();this.connected=false;this.lastMetrics={};this.lastObservation=null;this.sensorManifestCache=[];this.connectPromise=null;
  }
  sync(body,{emit=true}={}){
    const state=responseState(body);if(state)mergeRemoteRuntimeState(this.store.state,state);
    const descriptor=responseDescriptor(body);if(descriptor){this.remoteDescriptor={...(this.remoteDescriptor||{}),...descriptor};for(const name of descriptor.capabilities?.domainServices||descriptor.domainServices||[])this.remoteDomainServices.add(name)}
    const data=bodyData(body);if(data?.metrics)this.lastMetrics={...this.lastMetrics,...data.metrics};if(body?.metrics)this.lastMetrics={...this.lastMetrics,...body.metrics};if(data?.observation!==undefined)this.lastObservation=data.observation;if(body?.observation!==undefined)this.lastObservation=body.observation;
    if(emit)this.store.emit();return body;
  }
  async request(command,payload={},{emit=true}={}){const body=await this.transport.request(command,payload);return this.sync(body,{emit})}
  async connect(){
    if(this.connected)return{ok:true,descriptor:this.describe()};if(this.connectPromise)return this.connectPromise;
    this.connectPromise=(async()=>{await this.transport.connect();const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.HANDSHAKE,{client:{name:'robot_systems_web',stateContract:TASK_RUNTIME_STATE_SCHEMA}}, {emit:false});this.connected=true;if(this.remoteDescriptor?.capabilities?.sensorRead){try{await this.sensorManifest({refresh:true})}catch{}}this.store.emit();return{ok:true,descriptor:this.describe(),remote:bodyData(body)}})();
    try{return await this.connectPromise}finally{this.connectPromise=null}
  }
  async disconnect(){try{if(this.connected)await this.transport.disconnect()}finally{this.connected=false}return{ok:true}}
  getState(){return this.store.state}
  getStore(){return this.store}
  getRobot(){return this.robot}
  observe(){return this.lastObservation??this.store.state}
  async refresh(){const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.OBSERVE);return bodyData(body)?.observation??body?.observation??this.observe()}
  async step(action){const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.STEP,{action});const data=bodyData(body);return data?.actionResult??data?.result??body?.actionResult??{ok:true}}
  async reset(options={}){await this.request(ENVIRONMENT_BRIDGE_COMMANDS.RESET,{options});return this.store.state}
  subscribe(listener){return this.store.subscribe(listener)}
  render(_state=this.store.state){}
  validateState(){return validateTaskRuntimeState(this.store.state)}
  async fetchMetrics(){const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.METRICS,{}, {emit:false});const data=bodyData(body);this.lastMetrics={...this.lastMetrics,...(data?.metrics||body?.metrics||{})};return this.lastMetrics}
  getMetrics(){const sim=this.store.state.simulation||{};return{pathLength:sim.pathLength||0,controlTicks:sim.controlTicks||0,simTimeSec:(sim.controlTicks||0)*(sim.dt||0),collisions:sim.collisions||0,...this.lastMetrics}}
  async sensorManifest({refresh=false}={}){if(!refresh&&this.sensorManifestCache.length)return this.sensorManifestCache.map(x=>({...x}));const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.SENSOR_MANIFEST,{}, {emit:false}),items=bodyData(body)?.sensors||body?.sensors||[];this.sensorManifestCache=Array.isArray(items)?items.map(x=>({...x})):[];return this.sensorManifestCache.map(x=>({...x}))}
  async readSensor(sensorId,options={}){const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.SENSOR_READ,{sensorId,options},{emit:false}),packet=bodyData(body)?.packet||body?.packet;if(!packet)throw new Error(`remote_sensor_packet_missing:${sensorId}`);const validation=validateSensorPacket(packet);if(!validation.ok)throw new Error(`remote_sensor_packet_invalid:${sensorId}:${validation.issues.join(',')}`);return packet}
  async configureTrial(spec={}){await this.request(ENVIRONMENT_BRIDGE_COMMANDS.CONFIGURE_TRIAL,{spec});return this.store.state}
  async generateScenarios(seed,count){const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.GENERATE_SCENARIOS,{seed,count},{emit:false});return bodyData(body)?.scenarios||body?.scenarios||[]}
  async applyScenario(scenario){await this.request(ENVIRONMENT_BRIDGE_COMMANDS.APPLY_SCENARIO,{scenario});return this.store.state}
  async taskTextForScenario(scenario){if(typeof scenario?.taskText==='string')return scenario.taskText;const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.TASK_TEXT,{scenario},{emit:false});return bodyData(body)?.taskText||body?.taskText||null}
  hasRemoteDomainService(name){return this.remoteDomainServices.has(name)}
  async domainCall(name,...args){if(this.remoteDomainServices.size&&!this.hasRemoteDomainService(name))throw new Error(`remote_domain_service_not_available:${name}`);const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.DOMAIN_CALL,{name,args});return bodyData(body)?.value??body?.value}

  semanticGeometry(){
    const sim=this.store.state.simulation||{},remote=this.remoteDescriptor||{},g=remote.semanticGeometry||{},wheelbase=Math.max(.001,Number(sim.wheelbase)||1),bodyWidth=Math.max(.001,Number(sim.bodyWidth)||wheelbase*.7);
    return{
      palletPreAlign:Number(g.palletPreAlign)||2.4*wheelbase,
      palletStaging:Number(g.palletStaging)||1.8*wheelbase,
      palletDock:Number(g.palletDock)||1.25*wheelbase,
      locationApproach:Number(g.locationApproach)||1.2*wheelbase,
      retreatDistance:Number(g.retreatDistance)||1.2*wheelbase,
      detectionRange:Number(g.detectionRange)||3*wheelbase,
      wheelbase,bodyWidth
    };
  }
  pathTo(target){return[target]}
  palletApproachPath(pallet){const g=this.semanticGeometry();return[{x:Number(pallet.x)-g.palletPreAlign,y:Number(pallet.y)},{x:Number(pallet.x)-g.palletStaging,y:Number(pallet.y)}]}
  palletDockTarget(pallet){const g=this.semanticGeometry();return{x:Number(pallet.x)-g.palletDock,y:Number(pallet.y),yaw:Number(pallet.yaw)||0}}
  locationApproachTarget(location){const g=this.semanticGeometry();return{x:Number(location.x)-g.locationApproach,y:Number(location.y)}}
  retreatTarget(robot=this.store.state.robot,distanceOverride=null){const g=this.semanticGeometry(),d=Number(distanceOverride)||g.retreatDistance,a=deg2rad(robot.yaw);return{x:Number(robot.x)-Math.cos(a)*d,y:Number(robot.y)-Math.sin(a)*d}}
  palletVisible(pallet,robot=this.store.state.robot){return distance(robot,pallet)<=this.semanticGeometry().detectionRange}
  markDetected(palletId){const list=this.store.state.perception?.detectedPallets||(this.store.state.perception={detectedPallets:[]}).detectedPallets;if(!list.includes(palletId))list.push(palletId);this.store.emit();return{ok:true}}
  setAligned(value){this.store.state.robot.aligned=!!value;this.store.emit();return{ok:true}}
  markRetreated(value=true){this.store.state.agent.memory.retreated=!!value;this.store.emit();return{ok:true}}
  setAlternateRoute(value=true){this.store.state.agent.memory.alternateRoute=!!value;this.store.emit();return{ok:true}}
  motionIOProfile(skillId){const sim=this.store.state.simulation||{},g=this.semanticGeometry(),maxForward=Math.max(.001,Number(sim.maxLinearSpeed)||1),maxReverse=Math.max(.001,Number(sim.maxReverseSpeed)||maxForward),steering=Math.max(.001,Math.abs(Number(sim.maxSteeringAngle)||35));return{normalizationFamily:'vehicle_relative.v1',forwardScale:skillId==='align_to_pallet'||skillId==='retreat'?3*g.wheelbase:10*g.wheelbase,lateralScale:skillId==='align_to_pallet'||skillId==='retreat'?3*g.bodyWidth:8*g.bodyWidth,speedScale:skillId==='retreat'?maxReverse:maxForward,actionSpeedScale:skillId==='retreat'?maxReverse:maxForward,steeringScale:steering}}

  getDomainServices(){
    const local={
      'state.get':()=>this.store.state,'state.emit':()=>this.store.emit(),'action.send':action=>this.step(action),'metrics.get':()=>this.getMetrics(),'environment.describe':()=>this.describe(),'scenario.configure':spec=>this.configureTrial(spec),'sensor.manifest':()=>this.sensorManifest(),'sensor.read':(id,options)=>this.readSensor(id,options),'world.distance':(a,b)=>distance(a,b),'control.config':()=>this.store.state.simulation,
      'path.to':target=>this.pathTo(target),'path.palletApproach':pallet=>this.palletApproachPath(pallet),'target.palletDock':pallet=>this.palletDockTarget(pallet),'target.locationApproach':location=>this.locationApproachTarget(location),'target.retreat':(robot,d)=>this.retreatTarget(robot,d),
      'perception.palletVisible':(pallet,robot)=>this.palletVisible(pallet,robot),'perception.markDetected':id=>this.markDetected(id),'robot.setAligned':v=>this.setAligned(v),'agent.markRetreated':v=>this.markRetreated(v),'agent.setAlternateRoute':v=>this.setAlternateRoute(v),'motion.ioProfile':skillId=>this.motionIOProfile(skillId)
    };
    for(const name of this.remoteDomainServices)if(!local[name])local[name]=(...args)=>this.domainCall(name,...args);
    return local;
  }
  describe(){
    const remote=this.remoteDescriptor||{},base=super.describe(),transport=this.transport.describe?.()||null;
    return{
      ...base,id:this.id,label:remote.label?`${this.label} → ${remote.label}`:this.label,version:this.version,kind:remote.kind||this.kind,fidelity:remote.fidelity||this.fidelity,
      remoteEnvironmentId:remote.id||null,remoteEnvironmentLabel:remote.label||null,remoteEnvironmentVersion:remote.version??null,stateContract:remote.stateContract||TASK_RUNTIME_STATE_SCHEMA,nativeRuntime:remote.nativeRuntime||'remote_bridge',coordinateFrame:remote.coordinateFrame||null,units:remote.units||null,semanticGeometry:this.semanticGeometry(),transport,
      capabilities:{...base.capabilities,...(remote.capabilities||{}),sensorRead:remote.capabilities?.sensorRead===true||this.sensorManifestCache.length>0,domainServices:[...new Set([...Object.keys(this.getDomainServices()),...this.remoteDomainServices])]},sensorManifest:this.sensorManifestCache.map(x=>({...x})),bridge:{connected:this.connected,remoteDomainServices:[...this.remoteDomainServices]},intendedUse:remote.intendedUse||'Adapter for external simulation or robot runtime behind robot_systems.environment_bridge.v1',limitations:remote.limitations||[]
    };
  }
}
