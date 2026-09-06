export class SkillIOAdapter{
  constructor({id,label,version=1,observationSpaceId,actionSpaceId}={}){
    if(!id)throw new Error('skill_io_adapter_id_required');
    if(!observationSpaceId)throw new Error('skill_io_observation_space_required');
    if(!actionSpaceId)throw new Error('skill_io_action_space_required');
    this.id=id;this.label=label||id;this.version=version;this.observationSpaceId=observationSpaceId;this.actionSpaceId=actionSpaceId;
  }
  supports(){return false}
  encodeObservation(_skillId,_rawObservation,_context={}){throw new Error(`encode_observation_not_implemented:${this.id}`)}
  encodeAction(_skillId,_rawAction,_context={}){throw new Error(`encode_action_not_implemented:${this.id}`)}
  decodeAction(_skillId,_modelAction,_context={}){throw new Error(`decode_action_not_implemented:${this.id}`)}
  featureVector(_skillId,_encodedObservation){throw new Error(`feature_vector_not_implemented:${this.id}`)}
  compatibility(model){
    if(!model)return{ok:false,reason:'model_missing'};
    if(model.observationSpaceId!==this.observationSpaceId)return{ok:false,reason:'observation_space_mismatch',expected:this.observationSpaceId,actual:model.observationSpaceId||null};
    if(model.actionSpaceId!==this.actionSpaceId)return{ok:false,reason:'action_space_mismatch',expected:this.actionSpaceId,actual:model.actionSpaceId||null};
    return{ok:true};
  }
  describe(skillId){return{id:this.id,label:this.label,version:this.version,skillId,observationSpaceId:this.observationSpaceId,actionSpaceId:this.actionSpaceId}}
}
