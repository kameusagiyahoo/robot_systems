import '../learning/plugins/default_skill_plugins.js';
import '../environment/default_environments.js';
import {createEnvironmentAdapter} from '../environment/environment_registry.js';
import {selectedEnvironmentId} from '../environment/environment_selection.js';
import {environmentSupportsSkill} from '../environment/environment_capabilities.js';
import {EnvironmentRulePolicy} from '../policy/environment_rule_policy.js';
import {SkillExecutor} from '../skills/skills.js';
import {getSkillDefinition,selectedPolicy,saveSkillEvaluation,loadSkillModel} from '../learning/skill_learning_registry.js';
import {getEvaluationScenarioAdapter,getLearningPluginId} from '../learning/framework/plugin_registry.js';

function seeded(seed){let a=(Number(seed)||42)>>>0;return()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296}}

async function defaultRuntimeFactory({controller='pure_pursuit',environmentId=null}={}){
  const id=environmentId||selectedEnvironmentId(),environment=createEnvironmentAdapter(id,{canvas:null});
  await environment.connect();
  const store=environment.getStore(),state=environment.getState(),robot=environment.getRobot(),descriptor=environment.describe();
  if(!store||!state||!robot){try{await environment.disconnect()}catch{}throw new Error(`environment_runtime_contract_incomplete:${id}`)}
  if(descriptor?.capabilities?.trialConfiguration!==true){try{await environment.disconnect()}catch{}throw new Error(`environment_evaluation_trial_configuration_unsupported:${descriptor.remoteEnvironmentId||id}`)}
  const validation=environment.validateState?.();if(validation&&!validation.ok){try{await environment.disconnect()}catch{}throw new Error(`environment_state_contract_invalid:${validation.issues.join(',')}`)}
  if(state.simulation){state.simulation.batchMode=true;state.simulation.controller=controller||'pure_pursuit'}
  if(state.obstacle)state.obstacle.enabled=false;
  const policy=new EnvironmentRulePolicy(store,robot,{environment}),executor=new SkillExecutor(environment,policy);
  return{environment,environmentDescriptor:descriptor,store,robot,policy,executor};
}

export async function evaluateSkill(skillId,{trials=20,seed=42,controller='pure_pursuit',environmentId=null,onProgress=null,...pluginOptions}={}){
  const def=getSkillDefinition(skillId);if(!def)throw new Error('unknown_skill');
  const adapter=getEvaluationScenarioAdapter(skillId);if(!adapter)throw new Error(`evaluation_scenario_adapter_missing:${skillId}`);if(typeof adapter.supports==='function'&&!adapter.supports(skillId))throw new Error(`evaluation_scenario_adapter_unsupported:${adapter.id}:${skillId}`);
  const resolvedEnvironmentId=environmentId||selectedEnvironmentId(),n=Math.max(1,Math.min(100,Number(trials)||20)),rng=seeded(seed),runs=[],options={trials:n,seed,controller,environmentId:resolvedEnvironmentId,...pluginOptions};
  let environmentDescriptor=null;
  for(let i=0;i<n;i++){
    const runtime=await adapter.createRuntime({defaultRuntimeFactory,options});environmentDescriptor=runtime.environmentDescriptor||runtime.environment?.describe?.()||environmentDescriptor;
    const support=environmentSupportsSkill(environmentDescriptor,skillId);if(!support.ok){try{await runtime.environment?.disconnect?.()}catch{}throw new Error(`environment_skill_unsupported:${environmentDescriptor?.remoteEnvironmentId||environmentDescriptor?.id||resolvedEnvironmentId}:${skillId}:${support.missing.join(',')}`)}
    try{
      const s=runtime.environment?.getState?.()||runtime.store.state,prepared=await adapter.prepareTrial(skillId,s,rng,{index:i,options,runtime});let result;
      try{result=await runtime.executor.execute(prepared.step)}catch(error){result={ok:false,reason:`exception:${error?.message||'unknown'}`}}
      const measured=await adapter.measureTrial(skillId,s,prepared,result,{index:i,options,runtime});runs.push({...measured,environmentId:resolvedEnvironmentId,remoteEnvironmentId:environmentDescriptor?.remoteEnvironmentId||null});onProgress?.(i+1,n,measured);
    }finally{try{await runtime.environment?.disconnect?.()}catch{}}
    if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const policy=selectedPolicy(skillId),model=policy==='learned'?loadSkillModel(skillId):null,summary=await adapter.aggregate(skillId,runs,{trials:n,seed,controller,policy,options});
  const result={...summary,pluginId:getLearningPluginId(skillId),evaluationAdapterId:adapter.id,evaluationAdapterVersion:adapter.version,environmentId:resolvedEnvironmentId,environmentVersion:environmentDescriptor?.version??null,environmentFidelity:environmentDescriptor?.fidelity||null,remoteEnvironmentId:environmentDescriptor?.remoteEnvironmentId||null,remoteEnvironmentVersion:environmentDescriptor?.remoteEnvironmentVersion??null,stateContract:environmentDescriptor?.stateContract||null,modelId:model?.modelId||null,modelChecksum:model?.checksum||null,modelAlgorithm:model?.algorithm||null};
  saveSkillEvaluation(skillId,result);return result;
}
