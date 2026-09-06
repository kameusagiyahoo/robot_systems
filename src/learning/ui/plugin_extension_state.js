import '../plugins/default_skill_plugins.js';
import {getLearningDescriptor} from '../framework/plugin_registry.js';
import {getSkillDefinition,skillLearningState,selectedPolicy,latestEvaluationForPolicy} from '../skill_learning_registry.js';
import {selectedEnvironmentId} from '../../environment/environment_selection.js';
import {loadRemoteEnvironmentDescriptor} from '../../environment/remote_environment_config.js';

const params=new URLSearchParams(location.search);let skillId=params.get('skill')||'align_to_pallet';if(!getSkillDefinition(skillId))skillId='align_to_pallet';
const descriptor=getLearningDescriptor(skillId),sensor=descriptor.sensorSourceAdapter,inference=descriptor.inferenceBackend;
const policyLabel=policy=>({classic:'Classic',learned:'Learned',sensor_inference:'Sensor Inference'}[policy]||String(policy||'-').replaceAll('_',' '));

function renderExtensions(){
  const sensorEl=document.getElementById('sensorSourceState'),inferenceEl=document.getElementById('inferenceBackendState');
  if(sensorEl)sensorEl.textContent=sensor?`${sensor.label} v${sensor.version} · ${(sensor.requiredSensorTypes||[]).join(', ')||'plugin-defined'}`:'未定義';
  if(inferenceEl)inferenceEl.textContent=inference?`${inference.label} v${inference.version} · ${inference.kind||'inference'}`:'未定義';
  const policy=selectedPolicy(skillId),policyEl=document.getElementById('policyState');if(policyEl)policyEl.textContent=`${policyLabel(policy)} Policy`;
  document.querySelectorAll('#policyButtons button').forEach(button=>{if(button.textContent==='sensor_inference')button.textContent='Sensor Inference'});
  const state=skillLearningState(skillId),environmentId=selectedEnvironmentId(),remoteEnvironmentId=environmentId==='remote_bridge'?loadRemoteEnvironmentDescriptor()?.id||null:null,modelId=policy==='learned'?state.model?.modelId||null:null,evaluation=latestEvaluationForPolicy(skillId,policy,null,modelId,environmentId,remoteEnvironmentId),evalEl=document.getElementById('evaluationState');
  if(evalEl)evalEl.textContent=evaluation?`${policyLabel(policy)} ${Math.round((Number(evaluation.successRate)||0)*100)}% · ${evaluation.trials} trials · ${environmentId}${remoteEnvironmentId?`→${remoteEnvironmentId}`:''}${evaluation.modelId?` · ${evaluation.modelId.split(':').at(-1)}`:''}`:`${policyLabel(policy)} は現在Environmentで未評価`;
}

const policyButtons=document.getElementById('policyButtons');if(policyButtons)new MutationObserver(renderExtensions).observe(policyButtons,{childList:true,subtree:true});
window.addEventListener('storage',renderExtensions);window.addEventListener('focus',renderExtensions);queueMicrotask(renderExtensions);
