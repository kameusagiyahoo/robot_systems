import {SkillEvaluationScenarioAdapter} from '../framework/evaluation_scenario_adapter.js';

const wrap=d=>((d+180)%360+360)%360-180;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const range=(r,lo,hi)=>lo+r()*(hi-lo);
function poseRobot(s,x,y,yaw=0){Object.assign(s.robot,{x,y,yaw:(yaw+360)%360,speed:0,angularVelocity:0,steeringAngle:0,forkRaised:false,carrying:null,aligned:false})}

export class ForkliftSkillScenarioAdapter extends SkillEvaluationScenarioAdapter{
  constructor({id='forklift_skill_scenarios',label='Forklift Skill Scenarios',version=1,skills=[]}={}){super({id,label,version});this.skills=new Set(skills)}
  supports(skillId){return this.skills.has(skillId)}

  prepareTrial(skillId,s,r){
    if(!this.supports(skillId))throw new Error(`unsupported_scenario_skill:${skillId}`);
    const p=s.pallets.pallet_A,l=s.locations.shipping;
    switch(skillId){
      case'navigate_to_pallet':{
        p.x=range(r,230,330);p.y=range(r,120,250);poseRobot(s,range(r,70,170),range(r,300,490),range(r,-35,35));
        return{step:{name:skillId,args:{palletId:'pallet_A'}},target:{x:p.x-125,y:p.y}};
      }
      case'detect_pallet':{
        p.x=300;p.y=220;const a=range(r,-Math.PI,Math.PI),d=range(r,55,165);poseRobot(s,p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,range(r,-180,180));
        return{step:{name:skillId,args:{palletId:'pallet_A'}},target:{x:p.x,y:p.y}};
      }
      case'align_to_pallet':{
        p.x=300;p.y=220;s.perception.detectedPallets=['pallet_A'];poseRobot(s,p.x-range(r,105,155),p.y+range(r,-38,38),range(r,-38,38));
        return{step:{name:skillId,args:{palletId:'pallet_A'}},target:{x:p.x-82,y:p.y},targetYaw:0};
      }
      case'insert_forks':{
        p.x=300;p.y=220;poseRobot(s,p.x-82,p.y,range(r,-8,8));s.robot.aligned=true;
        return{step:{name:skillId,args:{palletId:'pallet_A'}},target:{x:p.x,y:p.y}};
      }
      case'lift':{
        poseRobot(s,218,220,0);s.robot.carrying='pallet_A';p.status='on_forks';
        return{step:{name:skillId,args:{}},target:null};
      }
      case'navigate_to':{
        l.x=range(r,690,820);l.y=range(r,390,500);poseRobot(s,range(r,100,350),range(r,100,360),range(r,-60,60));s.robot.carrying='pallet_A';p.status='on_forks';
        return{step:{name:skillId,args:{locationId:'shipping'}},target:{x:l.x-75,y:l.y}};
      }
      case'place':{
        l.x=760;l.y=455;poseRobot(s,l.x-75+range(r,-8,8),l.y+range(r,-8,8),range(r,-8,8));s.robot.carrying='pallet_A';s.robot.forkRaised=true;p.status='on_forks';
        return{step:{name:skillId,args:{locationId:'shipping'}},target:{x:l.x,y:l.y}};
      }
      case'retreat':{
        poseRobot(s,range(r,250,650),range(r,160,430),range(r,-30,30));const a=s.robot.yaw*Math.PI/180,start={x:s.robot.x,y:s.robot.y};
        return{step:{name:skillId,args:{}},start,target:{x:start.x-Math.cos(a)*70,y:start.y-Math.sin(a)*70}};
      }
      default:throw new Error(`unsupported_scenario_skill:${skillId}`);
    }
  }

  measureTrial(skillId,s,prepared,result){
    let finalError=null,yawError=null;
    if(prepared.target){
      if(skillId==='place')finalError=dist(s.pallets.pallet_A,prepared.target);
      else finalError=dist(s.robot,prepared.target);
    }
    if(skillId==='align_to_pallet')yawError=Math.abs(wrap(s.robot.yaw-(prepared.targetYaw||0)));
    if(skillId==='insert_forks')finalError=s.robot.carrying==='pallet_A'?0:1;
    if(skillId==='lift')finalError=s.robot.forkRaised?0:1;
    return{
      success:!!result?.ok,
      reason:result?.reason||null,
      controlTicks:s.simulation.controlTicks,
      simTimeSec:s.simulation.controlTicks*s.simulation.dt,
      collisions:s.simulation.collisions,
      finalError,
      yawError,
      pathLength:s.simulation.pathLength
    };
  }

  aggregate(skillId,runs,meta={}){
    const base=super.aggregate(skillId,runs,meta),finite=key=>runs.map(x=>Number(x[key])).filter(Number.isFinite);
    return{
      ...base,
      avgFinalError:mean(finite('finalError')),
      avgYawError:mean(finite('yawError'))
    };
  }
}

export const motionScenarioAdapter=new ForkliftSkillScenarioAdapter({id:'forklift_motion_scenarios',label:'Forklift Motion Scenarios',skills:['navigate_to_pallet','align_to_pallet','navigate_to','retreat']});
export const perceptionScenarioAdapter=new ForkliftSkillScenarioAdapter({id:'forklift_perception_scenarios',label:'Forklift Perception Scenarios',skills:['detect_pallet']});
export const manipulationScenarioAdapter=new ForkliftSkillScenarioAdapter({id:'forklift_manipulation_scenarios',label:'Forklift Manipulation Scenarios',skills:['insert_forks','lift','place']});
