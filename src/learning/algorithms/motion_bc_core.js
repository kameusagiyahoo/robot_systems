const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wrap=d=>((d+180)%360+360)%360-180;
const dot=(w,x)=>x.reduce((s,v,i)=>s+(w[i]||0)*v,0);

function configFor(skillId){
  if(skillId==='align_to_pallet')return{dx:[18,165],dy:[-85,85],yaw:[-100,100],speed:[-8,20],maxSpeed:32,epochs:900,lr:0.025,featureScale:[160,120,70],expert:'align'};
  if(skillId==='retreat')return{dx:[35,140],dy:[-70,70],yaw:[-70,70],speed:[-25,20],maxSpeed:26,epochs:700,lr:0.022,featureScale:[500,300,100],expert:'motion'};
  return{dx:[80,700],dy:[-320,320],yaw:[-150,150],speed:[-20,90],maxSpeed:55,epochs:700,lr:0.022,featureScale:[500,300,100],expert:'motion'};
}

function features(skillId,o){const cfg=configFor(skillId),yaw=wrap(o.yawError)*Math.PI/180,[dxScale,dyScale,speedScale]=cfg.featureScale;return[clamp(o.dx/dxScale,-2,2),clamp(o.dy/dyScale,-2,2),Math.sin(yaw),Math.cos(yaw),clamp(o.speed/speedScale,-1.5,1.5),clamp(o.steeringAngle/35,-1,1),1]}

export function expertActionForMotionSkill(skillId,obs){
  const cfg=configFor(skillId),yaw=wrap(obs.yawError),lateral=obs.dy,steer=cfg.expert==='align'?clamp(-(0.72*yaw+0.22*lateral),-35,35):clamp(-(0.78*yaw+0.055*lateral),-35,35),dist=Math.hypot(obs.dx,obs.dy);let speed=cfg.expert==='align'?clamp(dist*0.28,5,26):clamp(dist*0.16,5,cfg.maxSpeed);if(Math.abs(yaw)>55)speed*=cfg.expert==='align'?0.35:0.32;if(skillId==='align_to_pallet'&&obs.dx<0)speed=-Math.min(16,Math.abs(speed));if(skillId==='retreat')speed=-Math.min(cfg.maxSpeed,Math.max(6,dist*0.16));return{speed,steeringAngle:steer};
}

export function generateMotionDemos(skillId,count=2500,seed=42){const cfg=configFor(skillId);let a=(Number(seed)||42)>>>0;const rnd=()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296},range=([lo,hi])=>lo+rnd()*(hi-lo),samples=[];for(let i=0;i<count;i++){const obs={dx:range(cfg.dx),dy:range(cfg.dy),yawError:range(cfg.yaw),speed:range(cfg.speed),steeringAngle:skillId==='align_to_pallet'?-25+rnd()*50:-30+rnd()*60};samples.push({obs,action:expertActionForMotionSkill(skillId,obs)})}return samples}

export function summarizeMotionDataset(samples){const keys=['dx','dy','yawError','speed','steeringAngle'],featuresSummary={};for(const key of keys){const values=samples.map(s=>Number(s.obs?.[key])).filter(Number.isFinite);if(!values.length)continue;featuresSummary[key]={min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length}}const step=Math.max(1,Math.floor(samples.length/120)),preview=[];for(let i=0;i<samples.length&&preview.length<120;i+=step){const o=samples[i]?.obs;if(o)preview.push({dx:o.dx,dy:o.dy,yawError:o.yawError})}return{features:featuresSummary,preview}}

function modelLoss(skillId,samples,speedW,steerW,maxSpeed){if(!samples?.length)return null;let loss=0;for(const s of samples){const x=features(skillId,s.obs),ys=clamp((s.action?.speed||0)/maxSpeed,-1,1),yt=clamp((s.action?.steeringAngle||0)/35,-1,1),ps=Math.tanh(dot(speedW,x)),pt=Math.tanh(dot(steerW,x)),es=ps-ys,et=pt-yt;loss+=es*es+et*et}return loss/samples.length}

export function trainMotionBehaviorCloning(skillId,samples,{epochs=null,lr=null,validationSamples=[],onEpoch=null}={}){
  if(!samples?.length)throw new Error('no_samples');const cfg=configFor(skillId),totalEpochs=Math.max(1,Number(epochs)||cfg.epochs),startLr=Number(lr)||cfg.lr,speedW=Array(7).fill(0),steerW=Array(7).fill(0),maxSpeed=skillId==='align_to_pallet'?32:Math.max(20,...samples.map(s=>Math.abs(s.action?.speed)||0)),lossHistory=[];let loss=0,rate=startLr;const every=Math.max(1,Math.floor(totalEpochs/60));
  for(let e=0;e<totalEpochs;e++){
    loss=0;for(const s of samples){const x=features(skillId,s.obs),ys=clamp((s.action?.speed||0)/maxSpeed,-1,1),yt=clamp((s.action?.steeringAngle||0)/35,-1,1),ps=Math.tanh(dot(speedW,x)),pt=Math.tanh(dot(steerW,x)),es=ps-ys,et=pt-yt;loss+=es*es+et*et;for(let j=0;j<x.length;j++){speedW[j]-=rate*es*(1-ps*ps)*x[j];steerW[j]-=rate*et*(1-pt*pt)*x[j]}}
    const avgLoss=loss/Math.max(samples.length,1);if(e===0||e===totalEpochs-1||e%every===0){const validationLoss=modelLoss(skillId,validationSamples,speedW,steerW,maxSpeed),point={epoch:e+1,loss:avgLoss,validationLoss};lossHistory.push(point);onEpoch?.(point,{epoch:e+1,epochs:totalEpochs})}rate*=0.998;
  }
  const validationLoss=modelLoss(skillId,validationSamples,speedW,steerW,maxSpeed);return{version:4,algorithm:'behavior_cloning',trainedAt:new Date().toISOString(),samples:samples.length,trainSamples:samples.length,validationSamples:validationSamples?.length||0,epochs:totalEpochs,loss:loss/Math.max(samples.length,1),validationLoss,lossHistory,maxSpeed,speedW,steerW};
}
