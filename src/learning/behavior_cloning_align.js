import {loadSkillModel,saveSkillModel,clearSkillModel,selectedPolicy} from './skill_learning_registry.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wrap=d=>((d+180)%360+360)%360-180;
const SKILL_ID='align_to_pallet';

function features(o){
  const yaw=wrap(o.yawError)*Math.PI/180;
  return [clamp(o.dx/160,-2,2),clamp(o.dy/120,-2,2),Math.sin(yaw),Math.cos(yaw),clamp(o.speed/70,-1.5,1.5),clamp(o.steeringAngle/35,-1,1),1];
}
function dot(w,x){let s=0;for(let i=0;i<x.length;i++)s+=(w[i]||0)*x[i];return s}

export class BehaviorCloningAlign{
  constructor(){this.model=this.load()}
  load(){this.model=loadSkillModel(SKILL_ID);return this.model}
  save(model){this.model=saveSkillModel(SKILL_ID,{...model,skillId:SKILL_ID});return this.model}
  clear(){clearSkillModel(SKILL_ID);this.model=null}
  isReady(){return selectedPolicy(SKILL_ID)!=='classic'&&!!this.model?.speedW?.length&&!!this.model?.steerW?.length}
  predict(obs){
    if(!this.isReady())return null;
    const x=features(obs),speedN=Math.tanh(dot(this.model.speedW,x)),steerN=Math.tanh(dot(this.model.steerW,x));
    return{speed:clamp(speedN*32,-32,32),steeringAngle:clamp(steerN*35,-35,35)};
  }
  train(samples,{epochs=900,lr=0.025,onEpoch=null}={}){
    const speedW=Array(7).fill(0),steerW=Array(7).fill(0),lossHistory=[];let loss=0,rate=lr;
    const every=Math.max(1,Math.floor(epochs/60));
    for(let e=0;e<epochs;e++){
      loss=0;
      for(const s of samples){
        const x=features(s.obs),ys=clamp(s.action.speed/32,-1,1),yt=clamp(s.action.steeringAngle/35,-1,1);
        const ps=Math.tanh(dot(speedW,x)),pt=Math.tanh(dot(steerW,x));
        const es=ps-ys,et=pt-yt;loss+=es*es+et*et;
        for(let j=0;j<x.length;j++){
          speedW[j]-=rate*es*(1-ps*ps)*x[j];
          steerW[j]-=rate*et*(1-pt*pt)*x[j];
        }
      }
      const avgLoss=loss/Math.max(samples.length,1);
      if(e===0||e===epochs-1||e%every===0){const point={epoch:e+1,loss:avgLoss};lossHistory.push(point);if(onEpoch)onEpoch(point,{epoch:e+1,epochs})}
      rate*=0.998;
    }
    const model={version:3,algorithm:'behavior_cloning',trainedAt:new Date().toISOString(),samples:samples.length,epochs,loss:loss/Math.max(samples.length,1),lossHistory,maxSpeed:32,speedW,steerW};
    return this.save(model);
  }
}

export function expertAction(obs){
  const yawErr=wrap(obs.yawError),lateral=obs.dy;
  const steer=clamp(-(0.72*yawErr+0.22*lateral),-35,35);
  const dist=Math.hypot(obs.dx,obs.dy);
  let speed=clamp(dist*0.28,5,26);
  if(Math.abs(yawErr)>50)speed*=0.35;
  if(obs.dx<0)speed=-Math.min(16,Math.abs(speed));
  return{speed,steeringAngle:steer};
}

export function generateSyntheticDemos(count=2500,seed=42){
  let a=(Number(seed)||42)>>>0;const rnd=()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296};
  const samples=[];
  for(let i=0;i<count;i++){
    const obs={dx:18+rnd()*145,dy:-85+rnd()*170,yawError:-100+rnd()*200,speed:-8+rnd()*28,steeringAngle:-25+rnd()*50};
    samples.push({obs,action:expertAction(obs)});
  }
  return samples;
}
