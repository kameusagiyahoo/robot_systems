import '../learning/plugins/default_skill_plugins.js';
import {Store} from '../state/store.js';
import {SimRobot} from '../robot/sim_robot.js';
import {RulePolicy} from '../policy/rule_policy.js';
import {SkillExecutor} from '../skills/skills.js';
import {getSkillDefinition,selectedPolicy,saveSkillEvaluation} from '../learning/skill_learning_registry.js';
import {getEvaluationScenarioAdapter,getLearningPluginId} from '../learning/framework/plugin_registry.js';

function seeded(seed){let a=(Number(seed)||42)>>>0;return()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296}}

function defaultRuntimeFactory({controller='pure_pursuit'}={}){
  const store=new Store();
  store.state.simulation.batchMode=true;
  store.state.simulation.controller=controller||'pure_pursuit';
  store.state.obstacle.enabled=false;
  const robot=new SimRobot(store);robot.connect();
  const policy=new RulePolicy(store,robot);
  const executor=new SkillExecutor(store,policy);
  return{store,robot,policy,executor};
}

export async function evaluateSkill(skillId,{trials=20,seed=42,controller='pure_pursuit',onProgress=null,...pluginOptions}={}){
  const def=getSkillDefinition(skillId);if(!def)throw new Error('unknown_skill');
  const adapter=getEvaluationScenarioAdapter(skillId);if(!adapter)throw new Error(`evaluation_scenario_adapter_missing:${skillId}`);
  if(typeof adapter.supports==='function'&&!adapter.supports(skillId))throw new Error(`evaluation_scenario_adapter_unsupported:${adapter.id}:${skillId}`);

  const n=Math.max(1,Math.min(100,Number(trials)||20)),rng=seeded(seed),runs=[];
  const options={trials:n,seed,controller,...pluginOptions};

  for(let i=0;i<n;i++){
    const runtime=await adapter.createRuntime({defaultRuntimeFactory,options}),s=runtime.store.state;
    const prepared=await adapter.prepareTrial(skillId,s,rng,{index:i,options,runtime});
    let result;
    try{result=await runtime.executor.execute(prepared.step)}catch(error){result={ok:false,reason:`exception:${error?.message||'unknown'}`}}
    const measured=await adapter.measureTrial(skillId,s,prepared,result,{index:i,options,runtime});
    runs.push(measured);
    onProgress?.(i+1,n,measured);
    if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
  }

  const policy=selectedPolicy(skillId),summary=await adapter.aggregate(skillId,runs,{trials:n,seed,controller,policy,options});
  const result={...summary,pluginId:getLearningPluginId(skillId),evaluationAdapterId:adapter.id,evaluationAdapterVersion:adapter.version};
  saveSkillEvaluation(skillId,result);
  return result;
}
