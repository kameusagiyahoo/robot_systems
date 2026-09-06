import {EnvironmentAdapter} from './environment_adapter.js';
import {validateTaskRuntimeState,TASK_RUNTIME_STATE_SCHEMA} from './task_state_contract.js';
import {Store} from '../state/store.js';
import {SimRobot} from '../robot/sim_robot.js';
import {WarehouseRenderer} from './warehouse.js';
import {generateScenarios,applyScenario,taskTextForScenario} from '../benchmark/scenarios.js';

const distance=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));
const segmentHitsRect=(a,b,r)=>{const steps=40;for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return true}return false};
const deg2rad=d=>d*Math.PI/180;

const GEOMETRY={
  palletPreAlignOffset:170,
  palletStagingOffset:125,
  palletDockOffset:82,
  locationApproachOffset:75,
  retreatDistance:70,
  detectionRange:180,
  obstaclePathMargin:70,
  worldBounds:{minX:31,maxX:869,minY:31,maxY:529}
};

export class Browser2DEnvironmentAdapter extends EnvironmentAdapter{
  constructor({canvas=null,store=null,robot=null,renderer=null}={}){
    super({id:'browser_2d',label:'Browser 2D Smoke-test Environment',version:1,kind:'simulation',fidelity:'smoke_test'});
    this.store=store||new Store();
    this.robot=robot||new SimRobot(this.store);
    this.renderer=renderer||(canvas?new WarehouseRenderer(canvas):null);
    this.connected=false;
  }
  async connect(){const result=await Promise.resolve(this.robot.connect());this.connected=result?.ok!==false;return result||{ok:true}}
  async disconnect(){const result=await Promise.resolve(this.robot.disconnect?.()||{ok:true});this.connected=false;return result}
  getState(){return this.store.state}
  getStore(){return this.store}
  getRobot(){return this.robot}
  observe(){return this.robot.getObservation?.()||this.store.state}
  async step(action){return await Promise.resolve(this.robot.sendAction(action))}
  reset({scenario=null}={}){this.store.reset();if(scenario)applyScenario(this.store.state,scenario);this.store.emit();return this.store.state}
  subscribe(listener){this.store.subscribe(listener);return()=>{}}
  render(state=this.store.state){this.renderer?.draw?.(state)}
  validateState(){return validateTaskRuntimeState(this.store.state)}
  getMetrics(){const s=this.store.state,sim=s.simulation||{};return{pathLength:sim.pathLength||0,controlTicks:sim.controlTicks||0,simTimeSec:(sim.controlTicks||0)*(sim.dt||0),collisions:sim.collisions||0,vehicleModel:sim.vehicleModel||null,controller:sim.controller||null}}
  generateScenarios(seed,count){return generateScenarios(seed,count)}
  applyScenario(scenario){applyScenario(this.store.state,scenario);this.store.emit();return this.store.state}
  taskTextForScenario(scenario){return taskTextForScenario(scenario)}

  pathTo(target){
    const s=this.store.state,obstacle=s.obstacle;
    if(!obstacle?.enabled||s.agent?.memory?.alternateRoute||!segmentHitsRect(s.robot,target,obstacle))return[target];
    const margin=GEOMETRY.obstaclePathMargin,topY=Math.max(60,obstacle.y-margin),bottomY=Math.min(500,obstacle.y+obstacle.h+margin),chooseTop=Math.abs(s.robot.y-topY)+Math.abs(target.y-topY)<=Math.abs(s.robot.y-bottomY)+Math.abs(target.y-bottomY),y=chooseTop?topY:bottomY;
    return[{x:obstacle.x-margin,y},{x:obstacle.x+obstacle.w+margin,y},target];
  }
  palletApproachPath(pallet){const preAlign={x:pallet.x-GEOMETRY.palletPreAlignOffset,y:pallet.y},staging={x:pallet.x-GEOMETRY.palletStagingOffset,y:pallet.y};return[...this.pathTo(preAlign),staging]}
  palletDockTarget(pallet){return{x:pallet.x-GEOMETRY.palletDockOffset,y:pallet.y,yaw:0}}
  locationApproachTarget(location){return{x:location.x-GEOMETRY.locationApproachOffset,y:location.y}}
  retreatTarget(robot=this.store.state.robot,distanceOverride=GEOMETRY.retreatDistance){const a=deg2rad(robot.yaw);return{x:robot.x-Math.cos(a)*distanceOverride,y:robot.y-Math.sin(a)*distanceOverride}}
  palletVisible(pallet,robot=this.store.state.robot){return distance(robot,pallet)<GEOMETRY.detectionRange}

  getDomainServices(){
    return{
      'state.get':()=>this.store.state,
      'state.emit':()=>this.store.emit(),
      'action.send':action=>this.step(action),
      'metrics.get':()=>this.getMetrics(),
      'environment.describe':()=>this.describe(),
      'path.to':target=>this.pathTo(target),
      'path.palletApproach':pallet=>this.palletApproachPath(pallet),
      'target.palletDock':pallet=>this.palletDockTarget(pallet),
      'target.locationApproach':location=>this.locationApproachTarget(location),
      'target.retreat':(robot,distanceOverride)=>this.retreatTarget(robot,distanceOverride),
      'perception.palletVisible':(pallet,robot)=>this.palletVisible(pallet,robot),
      'world.distance':(a,b)=>distance(a,b),
      'control.config':()=>this.store.state.simulation
    };
  }
  describe(){
    return{
      ...super.describe(),
      stateContract:TASK_RUNTIME_STATE_SCHEMA,
      nativeRuntime:'browser-js',
      renderer:this.renderer?'canvas2d':'none',
      physics:'rear-steer kinematic smoke test',
      intendedUse:'UI / contract / integration smoke testing only; not a high-fidelity research simulator',
      coordinateFrame:{name:'browser2d_world',dimensions:2,angle:'degrees'},
      units:{length:'canvas_unit',time:'second',speed:'canvas_unit_per_second'},
      geometry:{...GEOMETRY},
      limitations:['single rectangle collision obstacle','no contact dynamics','no sensor physics','no tire/slip/load model','not suitable as final sim-to-real evidence']
    };
  }
}
