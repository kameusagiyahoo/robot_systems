export class SkillTrainingBackend{
  constructor({id,label,version=1}={}){if(!id)throw new Error('training_backend_id_required');this.id=id;this.label=label||id;this.version=version}
  supports(){return false}
  describe(){return{id:this.id,label:this.label,version:this.version,kind:'custom'}}
  cancel(){return false}
  async train(){throw new Error(`training_backend_not_implemented:${this.id}`)}
}

export class TrainingBackendError extends Error{
  constructor(message,code=message){super(message);this.name='TrainingBackendError';this.code=code}
}

export class ModuleWorkerTrainingBackend extends SkillTrainingBackend{
  constructor({id,label,version=1,workerUrl,defaultTimeoutMs=60000}={}){super({id,label,version});this.workerUrl=workerUrl;this.defaultTimeoutMs=defaultTimeoutMs;this.activeJob=null}
  describe(){return{...super.describe(),kind:'web_worker',cancellable:true,defaultTimeoutMs:this.defaultTimeoutMs}}
  cancel(reason='training_cancelled'){
    const job=this.activeJob;if(!job)return false;
    job.abort(reason);return true;
  }
  async runWorker(message,{onProgress=null,signal=null,timeoutMs=this.defaultTimeoutMs}={}){
    if(typeof Worker==='undefined')throw new TrainingBackendError('web_worker_unavailable','web_worker_unavailable');
    if(this.activeJob)throw new TrainingBackendError('training_backend_busy','training_backend_busy');
    return new Promise((resolve,reject)=>{
      const worker=new Worker(this.workerUrl,{type:'module'});let settled=false,timer=null;
      const cleanup=()=>{if(timer)clearTimeout(timer);signal?.removeEventListener?.('abort',onAbort);try{worker.terminate()}catch{};if(this.activeJob?.worker===worker)this.activeJob=null};
      const done=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
      const abort=reason=>done(reject,new TrainingBackendError(reason||'training_cancelled',reason||'training_cancelled'));
      const onAbort=()=>abort(signal?.reason?.message||signal?.reason||'training_cancelled');
      this.activeJob={worker,abort,startedAt:Date.now()};
      if(signal?.aborted){onAbort();return}
      signal?.addEventListener?.('abort',onAbort,{once:true});
      const t=Math.max(1000,Number(timeoutMs)||this.defaultTimeoutMs);
      timer=setTimeout(()=>abort('training_timeout'),t);
      worker.onmessage=e=>{
        const data=e.data||{};
        if(data.type==='progress'){onProgress?.(data.payload||{});return}
        if(data.type==='result'){done(resolve,data.payload);return}
        if(data.type==='error'){done(reject,new TrainingBackendError(data.error||'worker_training_failed','worker_training_failed'))}
      };
      worker.onerror=e=>done(reject,new TrainingBackendError(e.message||'worker_training_error','worker_training_error'));
      worker.postMessage(message);
    });
  }
}
