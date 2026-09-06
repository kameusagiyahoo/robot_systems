import {SkillEvaluationScenarioAdapter} from '../framework/evaluation_scenario_adapter.js';

const wrap=d=>((d+180)%360+360)%360-180;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const range=(r,lo,hi)=>lo+r()*(hi-lo);

function services(runtime){return runtime?.environment?.getDomainServices?.()||{}}
function call(runtime,name,...args){const fn=services(runtime)[name];if(typeof fn!=='function')throw new Error(`evaluation_environment_service_missing:${name}`);return fn(...args)}
function worldDistance(runtime,a,b){const fn=services(runtime)['world.distance'];return typeof fn==='function'?fn(a,b):dist(a,b)}
async function configure(runtime,spec){if(runtime?.environment?.configureTrial)return await runtime.environment.configureTrial(spec);const fn=services(runtime)['scenario.configure'];if(typeof fn==='function')return await fn(spec);throw new Error('evaluation_environment_trial_configuration_missing')}

export class ForkliftSkillScenarioAdapter extends SkillEvaluationScenarioAdapter{
  constructor({id='forklift_skill_scenarios',label='Forklift Skill Scenarios',version=2,skills=[]}={}){super({id,label,version});this.skills=new Set(skills)}
  supports(skillId){return this.skills.has(skillId)}

  async prepareTrial(skillId,_state,r,{runtime}={}){
    if(!this.supports(skillId))throw new Error(`unsupported_scenario_skill:${skillId}`);
    let prepared;
    switch(skillId){
      case'navigate_to_pallet':{
        const p={x:range(r,230,330),y:range(r,120,250)},robot={x:range(r,70,170),y:range(r,300,490),yaw:range(r,-35,35)};
        await configure(runtime,{robot,pallets:{pallet_A:p}});const s=runtime.environment.getState(),path=call(runtime,'path.palletApproach',s.pallets.pallet_A);
        prepared={step:{name:skillId,args:{palletId:'pallet_A'}},target:{...path.at(-1)}};break;
      }
      case'detect_pallet':{
        const p={x:300,y:220},a=range(r,-Math.PI,Math.PI),d=range(r,55,165),robot={x:p.x+Math.cos(a)*d,y:p.y+Math.sin(a)*d,yaw:range(r,-180,180)};
        await configure(runtime,{robot,pallets:{pallet_A:p}});prepared={step:{name:skillId,args:{palletId:'pallet_A'}},target:{...p}};break;
      }
      case'align_to_pallet':{
        const p={x:300,y:220},robot={x:p.x-range(r,105,155),y:p.y+range(r,-38,38),yaw:range(r,-38,38)};
        await configure(runtime,{robot,pallets:{pallet_A:p},perception:{detectedPallets:['pallet_A']}});const s=runtime.environment.getState(),target=call(runtime,'target.palletDock',s.pallets.pallet_A);
        prepared={step:{name:skillId,args:{palletId:'pallet_A'}},target,targetYaw:Number.isFinite(Number(target.yaw))?Number(target.yaw):0};break;
      }
      case'insert_forks':{
        const p={x:300,y:220};await configure(runtime,{robot:{x:218,y:220,yaw:range(r,-8,8),aligned:true},pallets:{pallet_A:p}});
        prepared={step:{name:skillId,args:{palletId:'pallet_A'}},target:{...p}};break;
      }
      case'lift':{
        await configure(runtime,{robot:{x:218,y:220,yaw:0,carrying:'pallet_A'},pallets:{pallet_A:{status:'on_forks'}}});prepared={step:{name:skillId,args:{}},target:null};break;
      }
      case'navigate_to':{
        const l={x:range(r,690,820),y:range(r,390,500)},robot={x:range(r,100,350),y:range(r,100,360),yaw:range(r,-60,60),carrying:'pallet_A'};
        await configure(runtime,{robot,locations:{shipping:l},pallets:{pallet_A:{status:'on_forks'}}});const s=runtime.environment.getState(),target=call(runtime,'target.locationApproach',s.locations.shipping);
        prepared={step:{name:skillId,args:{locationId:'shipping'}},target};break;
      }
      case'place':{
        const l={x:760,y:455};await configure(runtime,{locations:{shipping:l},robot:{x:685+range(r,-8,8),y:455+range(r,-8,8),yaw:range(r,-8,8),carrying:'pallet_A',forkRaised:true},pallets:{pallet_A:{status:'on_forks'}}});
        prepared={step:{name:skillId,args:{locationId:'shipping'}},target:{...l}};break;
      }
      case'retreat':{
        const robot={x:range(r,250,650),y:range(r,160,430),yaw:range(r,-30,30)};await configure(runtime,{robot});const s=runtime.environment.getState(),start={x:s.robot.x,y:s.robot.y},target=call(runtime,'target.retreat',s.robot,70);
        prepared={step:{name:skillId,args:{}},start,target};break;
      }
      default:throw new Error(`unsupported_scenario_skill:${skillId}`);
    }
    return prepared;
  }

  measureTrial(skillId,s,prepared,result,{runtime}={}){
    let finalError=null,yawError=null;
    if(prepared.target){if(skillId==='place')finalError=worldDistance(runtime,s.pallets.pallet_A,prepared.target);else finalError=worldDistance(runtime,s.robot,prepared.target)}
    if(skillId==='align_to_pallet')yawError=Math.abs(wrap(s.robot.yaw-(prepared.targetYaw||0)));
    if(skillId==='insert_forks')finalError=s.robot.carrying==='pallet_A'?0:1;
    if(skillId==='lift')finalError=s.robot.forkRaised?0:1;
    const metrics=runtime?.environment?.getMetrics?.()||{};
    return{success:!!result?.ok,reason:result?.reason||null,controlTicks:metrics.controlTicks??s.simulation?.controlTicks??0,simTimeSec:metrics.simTimeSec??((s.simulation?.controlTicks||0)*(s.simulation?.dt||0)),collisions:metrics.collisions??s.simulation?.collisions??0,finalError,yawError,pathLength:metrics.pathLength??s.simulation?.pathLength??0};
  }

  aggregate(skillId,runs,meta={}){
    const base=super.aggregate(skillId,runs,meta),finite=key=>runs.map(x=>Number(x[key])).filter(Number.isFinite);
    return{...base,avgFinalError:mean(finite('finalError')),avgYawError:mean(finite('yawError'))};
  }
}

export const motionScenarioAdapter=new ForkliftSkillScenarioAdapter({id:'forklift_motion_scenarios',label:'Forklift Motion Scenarios',skills:['navigate_to_pallet','align_to_pallet','navigate_to','retreat']});
export const perceptionScenarioAdapter=new ForkliftSkillScenarioAdapter({id:'forklift_perception_scenarios',label:'Forklift Perception Scenarios',skills:['detect_pallet']});
export const manipulationScenarioAdapter=new ForkliftSkillScenarioAdapter({id:'forklift_manipulation_scenarios',label:'Forklift Manipulation Scenarios',skills:['insert_forks','lift','place']});
