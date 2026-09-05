import {ModuleWorkerTrainingBackend} from '../framework/training_backend.js';
import {generateMotionDemos,summarizeMotionDataset,trainMotionBehaviorCloning} from '../algorithms/motion_bc_core.js';

const NO_FALLBACK_CODES=new Set(['training_cancelled','training_timeout','training_backend_busy']);

export class MotionBcTrainingBackend extends ModuleWorkerTrainingBackend{
  constructor(){super({id:'motion_bc_worker',label:'Motion BC Web Worker',version:2,workerUrl:new URL('../workers/motion_bc_training_worker.js',import.meta.url),defaultTimeoutMs:60000})}
  supports(skillId){return['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  async train(skillId,{samples=2500,seed=42,epochs=null,lr=null,datasetSamples=null,onProgress=null,signal=null,timeoutMs=null}={}){
    const count=Math.max(200,Math.min(10000,Number(samples)||2500));
    try{
      const result=await this.runWorker({type:'train_motion_bc',payload:{skillId,count,seed,epochs,lr,samples:datasetSamples}},{onProgress,signal,timeoutMs:timeoutMs||this.defaultTimeoutMs});
      return{...result,backend:this.describe()};
    }catch(error){
      if(NO_FALLBACK_CODES.has(error?.code||error?.message))throw error;
      onProgress?.({phase:'fallback',label:'Web Worker unavailable: main thread fallback',progress:0});
      if(signal?.aborted)throw new Error('training_cancelled');
      const demos=Array.isArray(datasetSamples)&&datasetSamples.length?datasetSamples:generateMotionDemos(skillId,count,seed),summary=summarizeMotionDataset(demos);
      const model=trainMotionBehaviorCloning(skillId,demos,{epochs,lr,onEpoch:(point,meta)=>{
        if(signal?.aborted)throw new Error('training_cancelled');
        onProgress?.({phase:'training',label:'Behavior Cloning 学習中',progress:point.epoch/meta.epochs,point});
      }});
      return{model,dataset:{kind:datasetSamples?'manual_import':'synthetic_expert',samples:demos.length,seed:Number(seed)||42,featureSummary:summary.features,preview:summary.preview},backend:{...this.describe(),fallback:'main_thread',error:error?.message||String(error)}};
    }
  }
}
