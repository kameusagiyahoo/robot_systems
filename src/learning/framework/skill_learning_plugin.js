export class SkillLearningPlugin{
  constructor({id,label,version=1}={}){
    if(!id)throw new Error('learning_plugin_id_required');
    this.id=id;this.label=label||id;this.version=version;
  }
  supports(){return false}
  getCapabilities(){return{trainable:false,evaluable:true,runtimeLearning:false,policies:['classic']}}
  getAlgorithms(){return[]}
  getDatasetSchema(){return null}
  getSkillIOAdapter(){return null}
  getDatasetAdapter(){return null}
  getSensorSourceAdapter(){return null}
  getInferenceBackend(){return null}
  getDemonstrationRecorderAdapter(){return null}
  getTrainingBackend(){return null}
  getTrainingParameters(){return[]}
  getEvaluationParameters(){return[]}
  getEvaluationMetrics(){return[{key:'successRate',label:'成功率',format:'percent',primary:true,better:'higher',goodThreshold:.8}]}
  getVisualizations(){return[]}
  getRuntimePolicyAdapter(){return null}
  getEvaluationScenarioAdapter(){return null}
  getNote(){return''}
  async train(){throw new Error(`training_not_supported:${this.id}`)}
  async evaluate(skillId,{defaultEvaluator,options={}}={}){
    if(typeof defaultEvaluator!=='function')throw new Error('default_evaluator_required');
    return defaultEvaluator(skillId,options);
  }
  describe(skillId){
    const evaluationMetrics=this.getEvaluationMetrics(skillId),ioAdapter=this.getSkillIOAdapter(skillId),runtimeAdapter=this.getRuntimePolicyAdapter(skillId),scenarioAdapter=this.getEvaluationScenarioAdapter(skillId),datasetAdapter=this.getDatasetAdapter(skillId),sensorSourceAdapter=this.getSensorSourceAdapter(skillId),inferenceBackend=this.getInferenceBackend(skillId),recorderAdapter=this.getDemonstrationRecorderAdapter(skillId),trainingBackend=this.getTrainingBackend(skillId);
    return{
      pluginId:this.id,
      pluginLabel:this.label,
      pluginVersion:this.version,
      capabilities:this.getCapabilities(skillId),
      algorithms:this.getAlgorithms(skillId),
      datasetSchema:this.getDatasetSchema(skillId),
      skillIOAdapter:ioAdapter?.describe?.(skillId)||null,
      datasetAdapter:datasetAdapter?.describe?.(skillId)||null,
      sensorSourceAdapter:sensorSourceAdapter?.describe?.(skillId)||null,
      inferenceBackend:inferenceBackend?.describe?.(skillId)||null,
      demonstrationRecorderAdapter:recorderAdapter?.describe?.(skillId)||null,
      trainingBackend:trainingBackend?.describe?.(skillId)||null,
      trainingParameters:this.getTrainingParameters(skillId),
      evaluationParameters:this.getEvaluationParameters(skillId),
      evaluationMetrics,
      primaryEvaluationMetric:evaluationMetrics.find(m=>m.primary)||evaluationMetrics[0]||null,
      visualizations:this.getVisualizations(skillId),
      runtimePolicyAdapter:runtimeAdapter?.describe?.(skillId)||null,
      evaluationScenarioAdapter:scenarioAdapter?.describe?.(skillId)||null,
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
  getSkillIOAdapter(skillId){return this.value('skillIOAdapter',skillId,null)}
  getDatasetAdapter(skillId){return this.value('datasetAdapter',skillId,null)}
  getSensorSourceAdapter(skillId){return this.value('sensorSourceAdapter',skillId,null)}
  getInferenceBackend(skillId){return this.value('inferenceBackend',skillId,null)}
  getDemonstrationRecorderAdapter(skillId){return this.value('demonstrationRecorderAdapter',skillId,null)}
  getTrainingBackend(skillId){return this.value('trainingBackend',skillId,null)}
  getTrainingParameters(skillId){return this.value('trainingParameters',skillId,[])}
  getEvaluationParameters(skillId){return this.value('evaluationParameters',skillId,[])}
  getEvaluationMetrics(skillId){return this.value('evaluationMetrics',skillId,super.getEvaluationMetrics(skillId))}
  getVisualizations(skillId){return this.value('visualizations',skillId,[])}
  getRuntimePolicyAdapter(skillId){return this.value('runtimePolicyAdapter',skillId,null)}
  getEvaluationScenarioAdapter(skillId){return this.value('evaluationScenarioAdapter',skillId,null)}
  getNote(skillId){return this.value('note',skillId,'')}
}
