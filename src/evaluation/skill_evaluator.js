import {Store} from '../state/store.js';
import {SimRobot} from '../robot/sim_robot.js';
import {RulePolicy} from '../policy/rule_policy.js';
import {SkillExecutor} from '../skills/skills.js';
import {getSkillDefinition,selectedPolicy,saveSkillEvaluation} from '../learning/skill_learning_registry.js';

const wrap=d=>((d+180)%360+360)%360-180;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function seeded(seed){let a=(Number(seed)||42)>>>0;return()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296}}
function range(r,lo,hi){return lo+r()*(hi-lo)}
function makeRuntime(controller){
  const store=new Store();
  store.state.simulation.batchMode=true;
  store.state.simulation.controller=controller||'pure_pursuit';
  store.state.obstacle.enabled=false;
  const robot=new SimRobot(store);robot.connect();
  const policy=new RulePolicy(store,robot);
  const executor=new SkillExecutor(store,policy);
  return{store,robot,policy,executor};
}
function poseRobot(s,x,y,yaw=0){Object.assign(s.robot,{x,y,yaw:(yaw+360)%360,speed:0,angularVelocity:0,steeringAngle:0,forkRaised:false,carrying:null,aligned:false})}

function prepare(skillId,s,r){
  const p=s.pallets.pallet_A,l=s.locations.shipping;
  switch(skillId){
    case'navigate_to_pallet':{
      p.x=range(r,230,330);p.y=range(r,120,250);
      poseRobot(s,range(r,70,170),range(r,300,490),range(r,-35,35));
      return{step:{name:skillId,args:{palletId:'pallet_A'}},target:{x:p.x-125,y:p.y}};
    }
    case'detect_pallet':{
      p.x=300;p.y=220;const a=range(r,-Math.PI,Math.PI),d=range(r,55,165);
      poseRobot(s,p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,range(r,-180,180));
      return{step:{name:skillId,args:{palletId:'pallet_A'}},target:{x:p.x,y:p.y}};
    }
    case'align_to_pallet':{
      p.x=300;p.y=220;s.perception.detectedPallets=['pallet_A'];
      poseRobot(s,p.x-range(r,105,155),p.y+range(r,-38,38),range(r,-38,38));
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
      l.x=range(r,690,820);l.y=range(r,390,500);
      poseRobot(s,range(r,100,350),range(r,100,360),range(r,-60,60));s.robot.carrying='pallet_A';p.status='on_forks';
      return{step:{name:skillId,args:{locationId:'shipping'}},target:{x:l.x-75,y:l.y}};
    }
    case'place':{
      l.x=760;l.y=455;poseRobot(s,l.x-75+range(r,-8,8),l.y+range(r,-8,8),range(r,-8,8));s.robot.carrying='pallet_A';s.robot.forkRaised=true;p.status='on_forks';
      return{step:{name:skillId,args:{locationId:'shipping'}},target:{x:l.x,y:l.y}};
    }
    case'retreat':{
      poseRobot(s,range(r,250,650),range(r,160,430),range(r,-30,30));
      const a=s.robot.yaw*Math.PI/180,start={x:s.robot.x,y:s.robot.y};
      return{step:{name:skillId,args:{}},start,target:{x:start.x-Math.cos(a)*70,y:start.y-Math.sin(a)*70}};
    }
    default:throw new Error(`unsupported_skill:${skillId}`);
  }
}
function trialMetrics(skillId,s,prep,result){
  let finalError=null,yawError=null;
  if(prep.target){
    if(skillId==='place')finalError=dist(s.pallets.pallet_A,prep.target);
    else if(skillId==='detect_pallet')finalError=dist(s.robot,prep.target);
    else finalError=dist(s.robot,prep.target);
  }
  if(skillId==='align_to_pallet')yawError=Math.abs(wrap(s.robot.yaw-(prep.targetYaw||0)));
  if(skillId==='insert_forks')finalError=s.robot.carrying==='pallet_A'?0:1;
  if(skillId==='lift')finalError=s.robot.forkRaised?0:1;
  const success=!!result.ok;
  return{success,reason:result.reason||null,controlTicks:s.simulation.controlTicks,simTimeSec:s.simulation.controlTicks*s.simulation.dt,collisions:s.simulation.collisions,finalError,yawError,pathLength:s.simulation.pathLength};
}
function aggregate(skillId,runs,{trials,seed,controller}){
  const successful=runs.filter(x=>x.success),failures={};
  for(const x of runs)if(!x.success){const k=x.reason||'unknown';failures[k]=(failures[k]||0)+1}
  const finite=(key,list=runs)=>list.map(x=>x[key]).filter(Number.isFinite);
  return{
    version:1,skillId,policy:selectedPolicy(skillId),controller,trials,seed:String(seed),evaluatedAt:new Date().toISOString(),
    successRate:successful.length/Math.max(runs.length,1),collisionRate:runs.filter(x=>x.collisions>0).length/Math.max(runs.length,1),
    avgControlTicks:mean(finite('controlTicks')),avgSimTimeSec:mean(finite('simTimeSec')),avgPathLength:mean(finite('pathLength')),
    avgFinalError:mean(finite('finalError')),avgYawError:mean(finite('yawError')),failures,runs
  };
}
export async function evaluateSkill(skillId,{trials=20,seed=42,controller='pure_pursuit',onProgress=null}={}){
  const def=getSkillDefinition(skillId);if(!def)throw new Error('unknown_skill');
  const n=Math.max(1,Math.min(100,Number(trials)||20)),r=seeded(seed),runs=[];
  for(let i=0;i<n;i++){
    const {store,executor}=makeRuntime(controller),s=store.state,prep=prepare(skillId,s,r);
    let result;
    try{result=await executor.execute(prep.step)}catch(e){result={ok:false,reason:`exception:${e?.message||'unknown'}`}}
    runs.push(trialMetrics(skillId,s,prep,result));
    if(onProgress)onProgress(i+1,n,runs.at(-1));
    if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const summary=aggregate(skillId,runs,{trials:n,seed,controller});
  saveSkillEvaluation(skillId,summary);
  return summary;
}
