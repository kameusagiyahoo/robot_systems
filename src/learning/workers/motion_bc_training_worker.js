import {generateMotionDemos,summarizeMotionDataset,trainMotionBehaviorCloning} from '../algorithms/motion_bc_core.js';

self.onmessage=e=>{
  const msg=e.data||{};
  if(msg.type!=='train_motion_bc')return;
  try{
    const {skillId,count=2500,seed=42,epochs=null,lr=null,samples=null}=msg.payload||{};
    self.postMessage({type:'progress',payload:{phase:'dataset',label:samples?'Dataset読み込み':'教師データ生成中',progress:0.02}});
    const demos=Array.isArray(samples)&&samples.length?samples:generateMotionDemos(skillId,count,seed);
    const summary=summarizeMotionDataset(demos);
    self.postMessage({type:'progress',payload:{phase:'training',label:'Behavior Cloning 学習中',progress:0.05}});
    const model=trainMotionBehaviorCloning(skillId,demos,{epochs,lr,onEpoch:(point,meta)=>self.postMessage({type:'progress',payload:{phase:'training',label:'Behavior Cloning 学習中',progress:point.epoch/meta.epochs,point}})});
    self.postMessage({type:'result',payload:{model,dataset:{kind:samples?'manual_import':'synthetic_expert',samples:demos.length,seed:Number(seed)||42,featureSummary:summary.features,preview:summary.preview}}});
  }catch(error){self.postMessage({type:'error',error:error?.message||String(error)})}
};
