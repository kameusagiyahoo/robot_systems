export class SkillLearningPlugin{
  constructor({id,label,version=1}={}){
    if(!id)throw new Error('learning_plugin_id_required');
    this.id=id;this.label=label||id;this.version=version;
  }
  supports(){return false}
  getCapabilities(){return{trainable:false,evaluable:true,runtimeLearning:false,policies:['classic']}}
  getAlgorithms(){return[]}
  getDatasetSchema(){return null}
  getEvaluationMetrics(){return[{key:'successRate',label:'成功率',format:'percent'}]}
  getVisualizations(){return[]}
  getNote(){return''}
  async train(){throw new Error(`training_not_supported:${this.id}`)}
  async evaluate(skillId,{defaultEvaluator,options={}}={}){
    if(typeof defaultEvaluator!=='function')throw new Error('default_evaluator_required');
    return defaultEvaluator(skillId,options);
  }
  describe(skillId){
    return{
      pluginId:this.id,
      pluginLabel:this.label,
      pluginVersion:this.version,
      capabilities:this.getCapabilities(skillId),
      algorithms:this.getAlgorithms(skillId),
      datasetSchema:this.getDatasetSchema(skillId),
      evaluationMetrics:this.getEvaluationMetrics(skillId),
      visualizations:this.getVisualizations(skillId),
      note:this.getNote(skillId)
    };
  }
}

export class DescriptorOnlyLearningPlugin extends SkillLearningPlugin{
  constructor({id,label,version=1,skills=[],descriptor={}}={}){super({id,label,version});this.skills=new Set(skills);this.descriptor=descriptor}
  supports(skillId){return this.skills.has(skillId)}
  value(name,skillId,fallback){const v=this.descriptor[name];return typeof v==='function'?v(skillId):(v??fallback)}
  getCapabilities(skillId){return this.value('capabilities',skillId,super.getCapabilities(skillId))}
  getAlgorithms(skillId){return this.value('algorithms',skillId,[])}
  getDatasetSchema(skillId){return this.value('datasetSchema',skillId,null)}
  getEvaluationMetrics(skillId){return this.value('evaluationMetrics',skillId,super.getEvaluationMetrics(skillId))}
  getVisualizations(skillId){return this.value('visualizations',skillId,[])}
  getNote(skillId){return this.value('note',skillId,'')}
}
