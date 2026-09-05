export class SkillRuntimePolicyAdapter {
  constructor({id,label,version=1}={}){
    if(!id)throw new Error('runtime_policy_adapter_id_required');
    this.id=id;
    this.label=label||id;
    this.version=version;
  }

  supports(_skillId,_policy='learned'){return false}

  describe(skillId){
    return{
      id:this.id,
      label:this.label,
      version:this.version,
      skillId,
      policies:['learned']
    };
  }

  async execute(_skillId,_args={},_context={}){
    throw new Error(`runtime_policy_not_implemented:${this.id}`);
  }
}
