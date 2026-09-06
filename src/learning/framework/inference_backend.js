export class InferenceBackend{
  constructor({id,label,version=1,kind='generic'}={}){if(!id)throw new Error('inference_backend_id_required');this.id=id;this.label=label||id;this.version=version;this.kind=kind}
  supports(_skillId){return false}
  async infer(_skillId,_input,_context={}){throw new Error(`inference_not_implemented:${this.id}`)}
  describe(skillId){return{id:this.id,label:this.label,version:this.version,kind:this.kind,skillId}}
}
