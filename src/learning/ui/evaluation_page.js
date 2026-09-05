import '../plugins/default_skill_plugins.js';
import {SKILL_LEARNING_REGISTRY,getSkillDefinition,skillLearningState,loadSkillEvaluation,clearSkillEvaluation,latestEvaluationForPolicy,setSelectedPolicy,selectedPolicy} from '../skill_learning_registry.js';
import {getLearningPlugin,getLearningDescriptor} from '../framework/plugin_registry.js';
import {evaluateSkill} from '../../evaluation/skill_evaluator.js';

const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
let skillId=params.get('skill')||'align_to_pallet';if(!getSkillDefinition(skillId))skillId='align_to_pallet';
const def=getSkillDefinition(skillId),plugin=getLearningPlugin(skillId),descriptor=getLearningDescriptor(skillId),primaryMetric=descriptor.primaryEvaluationMetric;
const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(0)}%`:'-';

function formatMetric(spec,value){
  if(!spec||!Number.isFinite(Number(value)))return'対象外';
  if(spec.format==='percent')return pct(Number(value));
  if(spec.format==='integer')return String(Math.round(Number(value)));
  const d=spec.decimals??1;return`${Number(value).toFixed(d)}${spec.unit?` ${spec.unit}`:''}`;
}
function primaryValue(e){return e&&primaryMetric?Number(e[primaryMetric.key]):NaN}
function goodPrimary(e){
  const value=primaryValue(e),threshold=primaryMetric?.goodThreshold;if(!Number.isFinite(value)||!Number.isFinite(Number(threshold)))return null;
  return primaryMetric.better==='lower'?value<=Number(threshold):value>=Number(threshold);
}
function deltaText(classic,learned){
  const c=primaryValue(classic),l=primaryValue(learned);if(!Number.isFinite(c)||!Number.isFinite(l))return'同じPlugin評価条件で両Policyを測ると比較できます。';
  const improvement=primaryMetric?.better==='lower'?c-l:l-c;
  if(primaryMetric?.format==='percent')return`${primaryMetric.label}: Learned ${improvement>=0?'+':''}${(improvement*100).toFixed(0)} pt`;
  return`${primaryMetric?.label||'Primary'}: Learned ${improvement>=0?'+':''}${improvement.toFixed(2)}${primaryMetric?.unit?` ${primaryMetric.unit}`:''}`;
}

function renderEvaluationParameters(){
  const host=$('#evaluationParameters');host.innerHTML='';
  for(const p of descriptor.evaluationParameters||[]){
    const label=document.createElement('label');label.textContent=p.label||p.key;let input;
    if(p.type==='select'){input=document.createElement('select');for(const opt of p.options||[]){const [value,text]=Array.isArray(opt)?opt:[opt,opt],o=document.createElement('option');o.value=value;o.textContent=text;input.appendChild(o)}}
    else{input=document.createElement('input');input.type=p.type||'text';if(p.min!==undefined)input.min=p.min;if(p.max!==undefined)input.max=p.max;if(p.step!==undefined)input.step=p.step}
    input.dataset.evalParam=p.key;if(p.default!==undefined)input.value=p.default;label.appendChild(input);host.appendChild(label);
  }
  const policy=document.createElement('label');policy.textContent='現在のPolicy';const strong=document.createElement('strong');strong.id='policyState';policy.appendChild(strong);host.appendChild(policy);
}

function collectEvaluationOptions(){
  const out={};document.querySelectorAll('[data-eval-param]').forEach(el=>{const spec=(descriptor.evaluationParameters||[]).find(p=>p.key===el.dataset.evalParam),raw=el.value;out[el.dataset.evalParam]=spec?.type==='number'?Number(raw):raw});
  if(out.trials===undefined)out.trials=20;if(out.seed===undefined)out.seed=42;if(out.controller===undefined)out.controller='pure_pursuit';return out;
}

function renderMetricCards(e){
  const host=$('#metricHost');host.innerHTML='';
  for(const spec of descriptor.evaluationMetrics||[]){const card=document.createElement('div');card.className='metric';card.innerHTML=`<span>${spec.label}${spec.primary?' · PRIMARY':''}</span><strong>${e?formatMetric(spec,e[spec.key]):'-'}</strong>`;host.appendChild(card)}
  const fail=document.createElement('div');fail.className='metric full';fail.innerHTML=`<span>失敗理由</span><pre class="failure-box">${e?(Object.keys(e.failures||{}).length?JSON.stringify(e.failures,null,2):'なし'):'未評価'}</pre>`;host.appendChild(fail);
}

function renderComparison(){
  const opts=collectEvaluationOptions(),controller=opts.controller||null,classic=latestEvaluationForPolicy(skillId,'classic',controller)||latestEvaluationForPolicy(skillId,'classic'),learned=latestEvaluationForPolicy(skillId,'learned',controller)||latestEvaluationForPolicy(skillId,'learned');
  $('#classicScore').textContent=classic?formatMetric(primaryMetric,classic[primaryMetric?.key]):'-';$('#classicMeta').textContent=classic?`${classic.trials} trials${classic.controller?` · ${classic.controller}`:''}`:'未評価';
  $('#learnedScore').textContent=learned?formatMetric(primaryMetric,learned[primaryMetric?.key]):'-';$('#learnedMeta').textContent=learned?`${learned.trials} trials${learned.controller?` · ${learned.controller}`:''}`:'未評価';
  $('#compareDelta').textContent=deltaText(classic,learned);
}

function render(){
  const state=skillLearningState(skillId),opts=collectEvaluationOptions(),controller=opts.controller||null,e=latestEvaluationForPolicy(skillId,state.policy,controller)||latestEvaluationForPolicy(skillId,state.policy)||loadSkillEvaluation(skillId);
  $('#skillTitle').textContent=`${def.code} / ${def.label}`;$('#skillDesc').textContent=def.desc;$('#skillNumber').textContent=`${def.order} / ${SKILL_LEARNING_REGISTRY.length}`;$('#pluginState').textContent=`${descriptor.pluginLabel} v${descriptor.pluginVersion}`;$('#policyState').textContent=state.policy==='learned'?'Learned':'Classic';$('#learnLink').href=`./learn.html?skill=${encodeURIComponent(skillId)}`;
  const ring=$('#scoreRing'),good=goodPrimary(e);ring.className='score-ring';
  if(!e){ring.textContent='－';$('#scoreTitle').textContent='未評価';$('#scoreMessage').textContent='このPluginが定義した指標でSkill単体を評価します。'}
  else{ring.textContent=formatMetric(primaryMetric,e[primaryMetric?.key]);if(good!==null)ring.classList.add(good?'good':'bad');$('#scoreTitle').textContent=primaryMetric?.label||'評価結果';$('#scoreMessage').textContent=`${e.policy} · ${e.trials} trials / ${String(e.evaluatedAt||'').replace('T',' ').slice(0,16)}`}
  renderMetricCards(e);$('#evalNote').textContent=`Primary: ${primaryMetric?.label||'-'} / Metrics: ${(descriptor.evaluationMetrics||[]).map(m=>m.label).join(' / ')}`;$('#compareBtn').disabled=!(descriptor.capabilities.runtimeLearning&&state.trained);renderComparison();
}

async function runEvaluation(labelPrefix=''){
  const options=collectEvaluationOptions(),progress=$('#progress');progress.classList.remove('hidden');
  return plugin.evaluate(skillId,{defaultEvaluator:evaluateSkill,options:{...options,onProgress:(i,n)=>{progress.textContent=`${labelPrefix}${i}/${n}`}}});
}

renderEvaluationParameters();render();
document.querySelectorAll('[data-eval-param]').forEach(el=>el.addEventListener('change',render));

$('#runBtn').onclick=async()=>{const btn=$('#runBtn');btn.disabled=true;$('#scoreTitle').textContent='評価中...';try{await runEvaluation()}finally{btn.disabled=false;$('#progress').classList.add('hidden');render()}};
$('#compareBtn').onclick=async()=>{const state=skillLearningState(skillId);if(!(descriptor.capabilities.runtimeLearning&&state.trained))return;const btn=$('#compareBtn'),original=selectedPolicy(skillId);btn.disabled=true;try{setSelectedPolicy(skillId,'classic');$('#scoreTitle').textContent='Classic評価中...';await runEvaluation('Classic ');setSelectedPolicy(skillId,'learned');$('#scoreTitle').textContent='Learned評価中...';await runEvaluation('Learned ')}finally{setSelectedPolicy(skillId,original);btn.disabled=false;$('#progress').classList.add('hidden');render()}};
$('#clearBtn').onclick=()=>{clearSkillEvaluation(skillId);render()};
$('#nextBtn').onclick=()=>{const i=SKILL_LEARNING_REGISTRY.findIndex(s=>s.id===skillId),next=SKILL_LEARNING_REGISTRY[(i+1)%SKILL_LEARNING_REGISTRY.length];location.href=`./evaluate.html?skill=${encodeURIComponent(next.id)}`};
