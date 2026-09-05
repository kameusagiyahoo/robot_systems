export class SkillDemonstrationRecorderAdapter{
  constructor({id,label,version=1}={}){
    if(!id)throw new Error('demonstration_recorder_adapter_id_required');
    this.id=id;this.label=label||id;this.version=version;
  }
  supports(){return false}
  getRecordableActions(){return[]}
  describe(skillId){return{id:this.id,label:this.label,version:this.version,skillId,recordableActions:this.getRecordableActions(skillId)}}
  start(){throw new Error(`demo_recorder_start_not_supported:${this.id}`)}
  record(){throw new Error(`demo_recorder_record_not_supported:${this.id}`)}
  stop(){throw new Error(`demo_recorder_stop_not_supported:${this.id}`)}
  discard(){throw new Error(`demo_recorder_discard_not_supported:${this.id}`)}
  status(){return{active:false,samples:0}}
}
