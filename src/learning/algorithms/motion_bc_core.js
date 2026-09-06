import {MOTION_OBSERVATION_SPACE_ID,MOTION_ACTION_SPACE_ID} from '../plugins/motion_skill_io_adapter.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const dot=(w,x)=>x.reduce((s,v,i)=>s+(w[i]||0)*v,0);
const angleFromEncoded=o=>Math.atan2(Number(o?.yawSin)||0,Number(o?.yawCos)||1)*180/Math.PI;

function configFor(skillId){
  if(skillId==='align_to_pallet')return{forward:[-.25,1.15],lateral:[-.9,.9],yaw:[-100,100],speed:[-.25,.7],steering:[-.8,.8],epochs:900,lr:.025,expert:'align'};
  if(skillId==='retreat')return{forward:[-1.15,-.15],lateral:[-.8,.8],yaw:[-70,70],speed:[-1,.2],steering:[-.85,.85],epochs:700,lr:.022,expert:'retreat'};
  return{forward:[.12,1.5],lateral:[-1.15,1.15],yaw:[-150,150],speed:[-.2,.95],steering:[-.9,.9],epochs:700,lr:.022,expert:'nav'};
}

export function motionFeatureVector(o){return[clamp(Number(o?.forward)||0,-2,2),clamp(Number(o?.lateral)||0,-2,2),clamp(Number(o?.yawSin)||0,-1,1),clamp(Number(o?.yawCos)||0,-1,1),clamp(Number(o?.speed)||0,-1.5,1.5),clamp(Number(o?.steering)||0,-1,1),1]}

export function expertActionForMotionSkill(skillId,obs){
  const cfg=configFor(skillId),yaw=angleFromEncoded(obs),lateral=Number(obs?.lateral)||0,forward=Number(obs?.forward)||0,d=Math.hypot(forward,lateral);
  let steering,speed;
  if(cfg.expert==='align'){
    steering=clamp(-(yaw/70*.78+lateral*.38),-1,1);
    speed=clamp(d*.7,.08,.8);if(Math.abs(yaw)>55)speed*=.35;if(forward<0)speed=-Math.min(.5,Math.abs(speed));
  }else if(cfg.expert==='retreat'){
    steering=clamp(-(yaw/70*.72+lateral*.32),-1,1);
    speed=-clamp(d*.75,.18,1);if(Math.abs(yaw)>50)speed*=.45;
  }else{
    steering=clamp(-(yaw/90*.82+lateral*.3),-1,1);
    speed=clamp(d*.68,.1,1);if(Math.abs(yaw)>55)speed*=.32;
  }
  return{speed:clamp(speed,-1,1),steering};
}

export function generateMotionDemos(skillId,count=2500,seed=42){
  const cfg=configFor(skillId);let a=(Number(seed)||42)>>>0;const rnd=()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296},range=([lo,hi])=>lo+rnd()*(hi-lo),samples=[];
  for(let i=0;i<count;i++){
    const yaw=range(cfg.yaw)*Math.PI/180,obs={forward:range(cfg.forward),lateral:range(cfg.lateral),yawSin:Math.sin(yaw),yawCos:Math.cos(yaw),speed:range(cfg.speed),steering:range(cfg.steering)};
    samples.push({obs,action:expertActionForMotionSkill(skillId,obs),space:{observation:MOTION_OBSERVATION_SPACE_ID,action:MOTION_ACTION_SPACE_ID}});
  }
  return samples;
}

export function summarizeMotionDataset(samples){
  const keys=['forward','lateral','yawSin','yawCos','speed','steering'],featuresSummary={};
  for(const key of keys){const values=samples.map(s=>Number(s.obs?.[key])).filter(Number.isFinite);if(!values.length)continue;featuresSummary[key]={min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length}}
  const step=Math.max(1,Math.floor(samples.length/120)),preview=[];for(let i=0;i<samples.length&&preview.length<120;i+=step){const o=samples[i]?.obs;if(o)preview.push({forward:o.forward,lateral:o.lateral,yawError:angleFromEncoded(o)})}
  return{features:featuresSummary,preview};
}

function sampleCompatible(s){return!!s?.obs&&Number.isFinite(Number(s.obs.forward))&&Number.isFinite(Number(s.obs.lateral))&&Number.isFinite(Number(s.obs.yawSin))&&Number.isFinite(Number(s.obs.yawCos))&&Number.isFinite(Number(s.action?.speed))&&Number.isFinite(Number(s.action?.steering))}
function modelLoss(samples,speedW,steerW){if(!samples?.length)return null;let loss=0,n=0;for(const s of samples){if(!sampleCompatible(s))continue;const x=motionFeatureVector(s.obs),ys=clamp(Number(s.action.speed),-1,1),yt=clamp(Number(s.action.steering),-1,1),ps=Math.tanh(dot(speedW,x)),pt=Math.tanh(dot(steerW,x)),es=ps-ys,et=pt-yt;loss+=es*es+et*et;n++}return n?loss/n:null}

export function predictMotionModel(model,encodedObservation){
  if(!model?.speedW?.length||!model?.steerW?.length)return null;
  if(model.observationSpaceId!==MOTION_OBSERVATION_SPACE_ID||model.actionSpaceId!==MOTION_ACTION_SPACE_ID)return null;
  const x=motionFeatureVector(encodedObservation);return{speed:clamp(Math.tanh(dot(model.speedW,x)),-1,1),steering:clamp(Math.tanh(dot(model.steerW,x)),-1,1)};
}

export function trainMotionBehaviorCloning(skillId,samples,{epochs=null,lr=null,validationSamples=[],onEpoch=null}={}){
  const train=(samples||[]).filter(sampleCompatible),validation=(validationSamples||[]).filter(sampleCompatible);if(!train.length)throw new Error('no_canonical_motion_samples');
  const cfg=configFor(skillId),totalEpochs=Math.max(1,Number(epochs)||cfg.epochs),startLr=Number(lr)||cfg.lr,speedW=Array(7).fill(0),steerW=Array(7).fill(0),lossHistory=[];let loss=0,rate=startLr;const every=Math.max(1,Math.floor(totalEpochs/60));
  for(let e=0;e<totalEpochs;e++){
    loss=0;for(const s of train){const x=motionFeatureVector(s.obs),ys=clamp(Number(s.action.speed),-1,1),yt=clamp(Number(s.action.steering),-1,1),ps=Math.tanh(dot(speedW,x)),pt=Math.tanh(dot(steerW,x)),es=ps-ys,et=pt-yt;loss+=es*es+et*et;for(let j=0;j<x.length;j++){speedW[j]-=rate*es*(1-ps*ps)*x[j];steerW[j]-=rate*et*(1-pt*pt)*x[j]}}
    const avgLoss=loss/train.length;if(e===0||e===totalEpochs-1||e%every===0){const validationLoss=modelLoss(validation,speedW,steerW),point={epoch:e+1,loss:avgLoss,validationLoss};lossHistory.push(point);onEpoch?.(point,{epoch:e+1,epochs:totalEpochs})}rate*=.998;
  }
  const validationLoss=modelLoss(validation,speedW,steerW);return{version:5,algorithm:'behavior_cloning',modelSpace:'canonical_normalized',observationSpaceId:MOTION_OBSERVATION_SPACE_ID,actionSpaceId:MOTION_ACTION_SPACE_ID,trainedAt:new Date().toISOString(),samples:train.length,trainSamples:train.length,validationSamples:validation.length,epochs:totalEpochs,loss:loss/train.length,validationLoss,lossHistory,speedW,steerW};
}
