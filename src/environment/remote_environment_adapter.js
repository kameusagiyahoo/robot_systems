import {EnvironmentAdapter} from './environment_adapter.js';
import {Store} from '../state/store.js';
import {RobotInterface} from '../robot/robot_interface.js';
import {HttpJsonEnvironmentTransport} from './remote_environment_transport.js';
import {ENVIRONMENT_BRIDGE_COMMANDS,mergeRemoteRuntimeState} from './environment_bridge_protocol.js';
import {validateTaskRuntimeState,TASK_RUNTIME_STATE_SCHEMA} from './task_state_contract.js';

function bodyData(body){return body?.data??body?.result??null}
function responseState(body){return body?.state??bodyData(body)?.state??null}
function responseDescriptor(body){return body?.descriptor??bodyData(body)?.descriptor??null}

class RemoteRobotProxy extends RobotInterface{
  constructor(environment){super();this.environment=environment}
  async connect(){return this.environment.connect()}
  getObservation(){return this.environment.observe()}
  async sendAction(action){return this.environment.step(action)}
  async disconnect(){return this.environment.disconnect()}
  describe(){return{id:'remote_robot_proxy',environmentId:this.environment.id,transport:this.environment.transport?.describe?.()||null}}
}

export class RemoteEnvironmentAdapter extends EnvironmentAdapter{
  constructor({transport=null,baseUrl=null,endpoint='/environment',headers={},timeoutMs=15000,id='remote_bridge',label='Remote Environment Bridge'}={}){
    super({id,label,version:1,kind:'simulation',fidelity:'remote'});
    this.transport=transport||new HttpJsonEnvironmentTransport({baseUrl,endpoint,headers,timeoutMs});
    this.store=new Store();this.robot=new RemoteRobotProxy(this);this.remoteDescriptor=null;this.remoteDomainServices=new Set();this.connected=false;this.lastMetrics={};this.lastObservation=null;this.connectPromise=null;
  }
  sync(body,{emit=true}={}){
    const state=responseState(body);if(state)mergeRemoteRuntimeState(this.store.state,state);
    const descriptor=responseDescriptor(body);if(descriptor){this.remoteDescriptor={...(this.remoteDescriptor||{}),...descriptor};this.id=descriptor.id||this.id;this.label=descriptor.label||this.label;this.version=descriptor.version??this.version;this.kind=descriptor.kind||this.kind;this.fidelity=descriptor.fidelity||this.fidelity;for(const name of descriptor.capabilities?.domainServices||descriptor.domainServices||[])this.remoteDomainServices.add(name)}
    const data=bodyData(body);if(data?.metrics)this.lastMetrics={...this.lastMetrics,...data.metrics};if(body?.metrics)this.lastMetrics={...this.lastMetrics,...body.metrics};if(data?.observation!==undefined)this.lastObservation=data.observation;if(body?.observation!==undefined)this.lastObservation=body.observation;
    if(emit)this.store.emit();return body;
  }
  async request(command,payload={},{emit=true}={}){const body=await this.transport.request(command,payload);return this.sync(body,{emit})}
  async connect(){
    if(this.connected)return{ok:true,descriptor:this.describe()};if(this.connectPromise)return this.connectPromise;
    this.connectPromise=(async()=>{await this.transport.connect();const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.HANDSHAKE,{client:{name:'robot_systems_web',stateContract:TASK_RUNTIME_STATE_SCHEMA}}, {emit:false});this.connected=true;this.store.emit();return{ok:true,descriptor:this.describe(),remote:bodyData(body)}})();
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
  async configureTrial(spec={}){await this.request(ENVIRONMENT_BRIDGE_COMMANDS.CONFIGURE_TRIAL,{spec});return this.store.state}
  async generateScenarios(seed,count){const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.GENERATE_SCENARIOS,{seed,count},{emit:false});return bodyData(body)?.scenarios||body?.scenarios||[]}
  async applyScenario(scenario){await this.request(ENVIRONMENT_BRIDGE_COMMANDS.APPLY_SCENARIO,{scenario});return this.store.state}
  async taskTextForScenario(scenario){if(typeof scenario?.taskText==='string')return scenario.taskText;const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.TASK_TEXT,{scenario},{emit:false});return bodyData(body)?.taskText||body?.taskText||null}
  hasRemoteDomainService(name){return this.remoteDomainServices.has(name)}
  async domainCall(name,...args){if(this.remoteDomainServices.size&&!this.hasRemoteDomainService(name))throw new Error(`remote_domain_service_not_available:${name}`);const body=await this.request(ENVIRONMENT_BRIDGE_COMMANDS.DOMAIN_CALL,{name,args});return bodyData(body)?.value??body?.value}
  getDomainServices(){
    const local={
      'state.get':()=>this.store.state,
      'state.emit':()=>this.store.emit(),
      'action.send':action=>this.step(action),
      'metrics.get':()=>this.getMetrics(),
      'environment.describe':()=>this.describe(),
      'scenario.configure':spec=>this.configureTrial(spec)
    };
    for(const name of this.remoteDomainServices)if(!local[name])local[name]=(...args)=>this.domainCall(name,...args);
    return local;
  }
  describe(){
    const remote=this.remoteDescriptor||{},base=super.describe(),transport=this.transport.describe?.()||null;
    return{
      ...base,...remote,
      id:remote.id||this.id,label:remote.label||this.label,version:remote.version??this.version,kind:remote.kind||this.kind,fidelity:remote.fidelity||this.fidelity,
      stateContract:remote.stateContract||TASK_RUNTIME_STATE_SCHEMA,nativeRuntime:remote.nativeRuntime||'remote_bridge',transport,
      capabilities:{...base.capabilities,...(remote.capabilities||{}),domainServices:[...new Set([...Object.keys(this.getDomainServices()),...this.remoteDomainServices])]},
      bridge:{connected:this.connected,remoteDomainServices:[...this.remoteDomainServices]},
      intendedUse:remote.intendedUse||'Adapter for external simulation or robot runtime behind robot_systems.environment_bridge.v1'
    };
  }
}
