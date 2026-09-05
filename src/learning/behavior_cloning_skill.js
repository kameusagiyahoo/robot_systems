import {getSkillDefinition,loadSkillModel,saveSkillModel,clearSkillModel,saveDatasetMeta} from './skill_learning_registry.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wrap=d=>((d+180)%360+360)%360-180;
function dot(w,x){let s=0;for(let i=0;i<x.length;i++)s+=(w[i]||0)*x[i];return s}
function features(o){const yaw=wrap(o.yawError)*Math.PI/180;return[clamp(o.dx/500,-2,2),clamp(o.dy/300,-2,2),Math.sin(yaw),Math.cos(yaw),clamp(o.speed/100,-1.5,1.5),clamp(o.steeringAngle/35,-1,1),1]}

function configFor(skillId){
  if(skillId==='align_to_pallet')return{dx:[18,165],dy:[-85,85],yaw:[-100,100],speed:[-8,20],maxSpeed:32,reverse:false};
  if(skillId==='retreat')return{dx:[35,140],dy:[-70,70],yaw:[-70,70],speed:[-25,20],maxSpeed:26,reverse:true};
  return{dx:[80,700],dy:[-320,320],yaw:[-150,150],speed:[-20,90],maxSpeed:55,reverse:false};
}
export function expertActionForSkill(skillId,obs){
  const cfg=configFor(skillId),yaw=wrap(obs.yawError),lateral=obs.dy;
  const steer=clamp(-(0.78*yaw+0.055*lateral),-35,35);
  const dist=Math.hypot(obs.dx,obs.dy);
  let speed=clamp(dist*0.16,5,cfg.maxSpeed);
  if(Math.abs(yaw)>55)speed*=0.32;
  if(skillId==='align_to_pallet')speed=Math.min(speed,26);
  if(skillId==='retreat')speed=-Math.min(cfg.maxSpeed,Math.max(6,dist*0.16));
  return{speed,steeringAngle:steer};
}
export function generateSkillDemos(skillId,count=2500,seed=42){
  const def=getSkillDefinition(skillId);if(!def?.trainable)throw new Error('skill_not_trainable');
  const cfg=configFor(skillId);let a=(Number(seed)||42)>>>0;const rnd=()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296};
  const range=([lo,hi])=>lo+rnd()*(hi-lo),samples=[];
  for(let i=0;i<count;i++){const obs={dx:range(cfg.dx),dy:range(cfg.dy),yawError:range(cfg.yaw),speed:range(cfg.speed),steeringAngle:-30+rnd()*60};samples.push({obs,action:expertActionForSkill(skillId,obs)})}
  saveDatasetMeta(skillId,{kind:'synthetic_expert',samples:samples.length,seed:Number(seed)||42,generatedAt:new Date().toISOString()});
  return samples;
}

export class BehaviorCloningSkill{
  constructor(skillId){this.skillId=skillId;this.model=loadSkillModel(skillId)}
  load(){this.model=loadSkillModel(this.skillId);return this.model}
  clear(){clearSkillModel(this.skillId);this.model=null}
  isReady(){return !!this.model?.speedW?.length&&!!this.model?.steerW?.length}
  predict(obs){if(!this.isReady())return null;const x=features(obs),speedN=Math.tanh(dot(this.model.speedW,x)),steerN=Math.tanh(dot(this.model.steerW,x));const max=this.model.maxSpeed||40;return{speed:clamp(speedN*max,-max,max),steeringAngle:clamp(steerN*35,-35,35)}}
  train(samples,{epochs=700,lr=0.022,onEpoch=null}={}){
    if(!samples?.length)throw new Error('no_samples');
    const speedW=Array(7).fill(0),steerW=Array(7).fill(0),maxSpeed=Math.max(20,...samples.map(s=>Math.abs(s.action.speed)||0)),lossHistory=[];let loss=0,rate=lr;
    const every=Math.max(1,Math.floor(epochs/60));
    for(let e=0;e<epochs;e++){
      loss=0;
      for(const s of samples){const x=features(s.obs),ys=clamp(s.action.speed/maxSpeed,-1,1),yt=clamp(s.action.steeringAngle/35,-1,1),ps=Math.tanh(dot(speedW,x)),pt=Math.tanh(dot(steerW,x)),es=ps-ys,et=pt-yt;loss+=es*es+et*et;for(let j=0;j<x.length;j++){speedW[j]-=rate*es*(1-ps*ps)*x[j];steerW[j]-=rate*et*(1-pt*pt)*x[j]}}
      const avgLoss=loss/Math.max(samples.length,1);
      if(e===0||e===epochs-1||e%every===0){const point={epoch:e+1,loss:avgLoss};lossHistory.push(point);if(onEpoch)onEpoch(point,{epoch:e+1,epochs})}
      rate*=0.998;
    }
    const model={version:2,algorithm:'behavior_cloning',trainedAt:new Date().toISOString(),samples:samples.length,epochs,loss:loss/Math.max(samples.length,1),lossHistory,maxSpeed,speedW,steerW};
    this.model=saveSkillModel(this.skillId,model);return this.model;
  }
}
