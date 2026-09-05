export class SkillTrainingBackend{
  constructor({id,label,version=1}={}){if(!id)throw new Error('training_backend_id_required');this.id=id;this.label=label||id;this.version=version}
  supports(){return false}
  describe(){return{id:this.id,label:this.label,version:this.version,kind:'custom'}}
  async train(){throw new Error(`training_backend_not_implemented:${this.id}`)}
}

export class ModuleWorkerTrainingBackend extends SkillTrainingBackend{
  constructor({id,label,version=1,workerUrl}={}){super({id,label,version});this.workerUrl=workerUrl}
  describe(){return{...super.describe(),kind:'web_worker'}}
  async runWorker(message,{onProgress=null}={}){
    if(typeof Worker==='undefined')throw new Error('web_worker_unavailable');
    return new Promise((resolve,reject)=>{
      const worker=new Worker(this.workerUrl,{type:'module'});
      const finish=()=>worker.terminate();
      worker.onmessage=e=>{
        const data=e.data||{};
        if(data.type==='progress'){onProgress?.(data.payload||{});return}
        if(data.type==='result'){finish();resolve(data.payload);return}
        if(data.type==='error'){finish();reject(new Error(data.error||'worker_training_failed'))}
      };
      worker.onerror=e=>{finish();reject(new Error(e.message||'worker_training_error'))};
      worker.postMessage(message);
    });
  }
}
