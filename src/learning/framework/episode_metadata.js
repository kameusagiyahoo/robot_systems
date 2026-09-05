import '../plugins/default_skill_plugins.js';
import {SKILL_LEARNING_REGISTRY,loadSkillModel,loadDatasetMeta,selectedPolicy} from '../skill_learning_registry.js';
import {getLearningDescriptor} from './plugin_registry.js';

function modelMeta(model){
  if(!model)return null;
  return{version:model.version??null,algorithm:model.algorithm||null,trainedAt:model.trainedAt||null,samples:model.samples??null,epochs:model.epochs??null,loss:Number.isFinite(Number(model.loss))?Number(model.loss):null,pluginId:model.pluginId||null,trainingBackendId:model.trainingBackendId||null,trainingBackendVersion:model.trainingBackendVersion??null,datasetSource:model.datasetSource||null};
}
function datasetMeta(dataset){
  if(!dataset)return null;
  return{kind:dataset.kind||null,samples:dataset.samples??null,seed:dataset.seed??null,generatedAt:dataset.generatedAt||null,recordedAt:dataset.recordedAt||null,datasetAdapterId:dataset.datasetAdapterId||null,datasetAdapterVersion:dataset.datasetAdapterVersion??null,demonstrationRecorderAdapterId:dataset.demonstrationRecorderAdapterId||null,demonstrationRecorderAdapterVersion:dataset.demonstrationRecorderAdapterVersion??null};
}

export function buildLearningEpisodeMetadata(){
  return{
    frameworkVersion:2,
    capturedAt:new Date().toISOString(),
    skills:SKILL_LEARNING_REGISTRY.map(skill=>{
      const descriptor=getLearningDescriptor(skill.id),model=loadSkillModel(skill.id),dataset=loadDatasetMeta(skill.id);
      return{skillId:skill.id,skillCode:skill.code,plugin:{id:descriptor.pluginId,label:descriptor.pluginLabel,version:descriptor.pluginVersion},policy:selectedPolicy(skill.id),runtimeAdapter:descriptor.runtimePolicyAdapter,evaluationScenarioAdapter:descriptor.evaluationScenarioAdapter,datasetAdapter:descriptor.datasetAdapter,demonstrationRecorderAdapter:descriptor.demonstrationRecorderAdapter,trainingBackend:descriptor.trainingBackend,model:modelMeta(model),dataset:datasetMeta(dataset)};
    })
  };
}

export function learningStepMetadata(skillId,result={}){
  return{skillId,policy:result.policy||null,runtimePlugin:result.runtimePlugin||null,runtimeAdapter:result.runtimeAdapter||null};
}
