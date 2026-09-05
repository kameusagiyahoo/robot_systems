import {generateMotionDemos,summarizeMotionDataset,trainMotionBehaviorCloning} from '../algorithms/motion_bc_core.js';
import {splitSamplesDeterministic} from '../framework/dataset_split.js';

self.onmessage=e=>{
  const msg=e.data||{};if(msg.type!=='train_motion_bc')return;
  try{
    const {skillId,count=2500,seed=42,epochs=null,lr=null,trainSamples=null,validationSamples=null,validationRatio=.2,splitMeta=null}=msg.payload||{};
    self.postMessage({type:'progress',payload:{phase:'dataset',label:trainSamples?'Dataset読み込み':'教師データ生成中',progress:0.02}});
    let train,validation,split=splitMeta;
    if(Array.isArray(trainSamples)&&trainSamples.length){train=trainSamples;validation=Array.isArray(validationSamples)?validationSamples:[]}
    else{const demos=generateMotionDemos(skillId,count,seed),s=splitSamplesDeterministic(demos,{validationRatio,seed});train=s.train;validation=s.validation;split=s.meta}
    const all=[...train,...validation],summary=summarizeMotionDataset(all);
    self.postMessage({type:'progress',payload:{phase:'training',label:'Behavior Cloning 学習中',progress:0.05}});
    const model=trainMotionBehaviorCloning(skillId,train,{epochs,lr,validationSamples:validation,onEpoch:(point,meta)=>self.postMessage({type:'progress',payload:{phase:'training',label:'Behavior Cloning 学習中',progress:point.epoch/meta.epochs,point}})});
    self.postMessage({type:'result',payload:{model,dataset:{kind:trainSamples?'manual_import':'synthetic_expert',samples:all.length,trainSamples:train.length,validationSamples:validation.length,seed:Number(seed)||42,split,featureSummary:summary.features,preview:summary.preview}}});
  }catch(error){self.postMessage({type:'error',error:error?.message||String(error)})}
};
