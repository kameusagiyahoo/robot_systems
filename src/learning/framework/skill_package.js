import {getSkillDefinition,loadSkillModel,saveSkillModel,loadDatasetMeta,saveDatasetMeta,loadSkillEvaluationHistory,replaceSkillEvaluationHistory,selectedPolicy,setSelectedPolicy} from '../skill_learning_registry.js';
import {getLearningPlugin,getLearningDescriptor} from './plugin_registry.js';
import {identifySkillModel,verifySkillModelIdentity,checksumValue} from './model_identity.js';

const SCHEMA='robot_systems.skill_learning_package.v1';
function parse(input){return typeof input==='string'?JSON.parse(input):input}
function withoutIntegrity(value){const copy=JSON.parse(JSON.stringify(value));delete copy.integrity;return copy}

export async function exportSkillLearningPackage(skillId){
  const def=getSkillDefinition(skillId);if(!def)throw new Error('unknown_skill');
  const plugin=getLearningPlugin(skillId),descriptor=getLearningDescriptor(skillId),datasetAdapter=plugin.getDatasetAdapter?.(skillId)||null;
  const rawModel=loadSkillModel(skillId),model=rawModel?await identifySkillModel(skillId,rawModel):null,datasetMeta=loadDatasetMeta(skillId),manualKind=['manual_import','manual_recorded'].includes(datasetMeta?.kind);
  const datasetPayload=manualKind&&datasetAdapter?await Promise.resolve(datasetAdapter.exportDataset(skillId,{format:'portable'})):null;
  const pkg={
    schema:SCHEMA,
    packageVersion:1,
    createdAt:new Date().toISOString(),
    skill:{id:def.id,code:def.code,label:def.label,group:def.group},
    plugin:{id:descriptor.pluginId,label:descriptor.pluginLabel,version:descriptor.pluginVersion},
    descriptor:{capabilities:descriptor.capabilities,algorithms:descriptor.algorithms,datasetSchema:descriptor.datasetSchema,runtimePolicyAdapter:descriptor.runtimePolicyAdapter,evaluationScenarioAdapter:descriptor.evaluationScenarioAdapter},
    policy:selectedPolicy(skillId),
    model,
    dataset:{meta:datasetMeta,payload:datasetPayload},
    evaluationHistory:loadSkillEvaluationHistory(skillId)
  };
  const identity=await checksumValue(withoutIntegrity(pkg));
  pkg.integrity={algorithm:identity.algorithm,checksum:identity.checksum};
  return pkg;
}

export async function verifySkillLearningPackage(input){
  const pkg=parse(input);if(pkg?.schema!==SCHEMA)return{valid:false,reason:'unsupported_package_schema'};
  if(!pkg.integrity?.checksum)return{valid:false,reason:'package_checksum_missing'};
  const actual=await checksumValue(withoutIntegrity(pkg));
  if(actual.checksum!==pkg.integrity.checksum)return{valid:false,reason:'package_checksum_mismatch',expected:pkg.integrity.checksum,actual:actual.checksum};
  if(pkg.model?.checksum){const modelCheck=await verifySkillModelIdentity(pkg.model);if(!modelCheck.valid)return{valid:false,reason:'model_checksum_mismatch',model:modelCheck}}
  return{valid:true,skillId:pkg.skill?.id,pluginId:pkg.plugin?.id,checksum:pkg.integrity.checksum};
}

export async function importSkillLearningPackage(skillId,input,{allowPluginVersionMismatch=true}={}){
  const pkg=parse(input),check=await verifySkillLearningPackage(pkg);if(!check.valid)throw new Error(check.reason);
  if(pkg.skill?.id!==skillId)throw new Error(`skill_package_mismatch:${pkg.skill?.id||'unknown'}:${skillId}`);
  const plugin=getLearningPlugin(skillId),descriptor=getLearningDescriptor(skillId);
  if(pkg.plugin?.id!==descriptor.pluginId)throw new Error(`skill_package_plugin_mismatch:${pkg.plugin?.id||'unknown'}:${descriptor.pluginId}`);
  if(!allowPluginVersionMismatch&&pkg.plugin?.version!==descriptor.pluginVersion)throw new Error(`skill_package_plugin_version_mismatch:${pkg.plugin?.version}:${descriptor.pluginVersion}`);
  if(pkg.dataset?.payload){
    const adapter=plugin.getDatasetAdapter?.(skillId);if(!adapter)throw new Error('skill_package_dataset_adapter_missing');
    await adapter.importDataset(skillId,pkg.dataset.payload);
  }
  if(pkg.dataset?.meta)saveDatasetMeta(skillId,{...pkg.dataset.meta,importedFromPackageAt:new Date().toISOString(),packageChecksum:pkg.integrity.checksum});
  if(pkg.model)saveSkillModel(skillId,{...pkg.model,importedFromPackageAt:new Date().toISOString(),packageChecksum:pkg.integrity.checksum});
  replaceSkillEvaluationHistory(skillId,pkg.evaluationHistory||[]);
  const allowed=descriptor.capabilities?.policies||['classic'],requested=pkg.policy||'classic';
  setSelectedPolicy(skillId,allowed.includes(requested)&&(requested!=='learned'||!!pkg.model)?requested:'classic');
  return{skillId,pluginId:descriptor.pluginId,pluginVersion:descriptor.pluginVersion,importedModelId:pkg.model?.modelId||null,evaluations:(pkg.evaluationHistory||[]).length,packageChecksum:pkg.integrity.checksum};
}
