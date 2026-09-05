import '../plugins/default_skill_plugins.js';
import {SKILL_LEARNING_REGISTRY,getSkillDefinition,skillLearningState,loadDatasetMeta,latestEvaluationForPolicy,clearSkillModel,setSelectedPolicy,selectedPolicy} from '../skill_learning_registry.js';
import {getLearningPlugin,getLearningDescriptor} from '../framework/plugin_registry.js';
import {renderLearningVisualizations} from '../framework/visualization_renderer.js';

const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
let skillId=params.get('skill')||'align_to_pallet';
if(!getSkillDefinition(skillId))skillId='align_to_pallet';
const def=getSkillDefinition(skillId),plugin=getLearningPlugin(skillId),descriptor=getLearningDescriptor(skillId);
const pct=v=>Number.isFinite(v)?`${(v*100).toFixed(0)}%`:'-';
const fmtLoss=v=>Number.isFinite(Number(v))?Number(v).toFixed(4):'-';

function renderParameterInputs(){
  const host=$('#trainingParameters');host.innerHTML='';
  const params=descriptor.trainingParameters||[];
  if(!params.length){host.innerHTML='<span class="parameter-empty">このPluginには現在設定項目がありません。</span>';return}
  for(const p of params){
    const label=document.createElement('label');label.textContent=p.label||p.key;
    let input;
    if(p.type==='select'){
      input=document.createElement('select');for(const option of p.options||[]){const [value,text]=Array.isArray(option)?option:[option,option],o=document.createElement('option');o.value=value;o.textContent=text;input.appendChild(o)}
    }else{input=document.createElement('input');input.type=p.type||'text';if(p.min!==undefined)input.min=p.min;if(p.max!==undefined)input.max=p.max;if(p.step!==undefined)input.step=p.step}
    input.dataset.trainingParam=p.key;if(p.default!==undefined)input.value=p.default;label.appendChild(input);host.appendChild(label);
  }
}

function collectTrainingOptions(){
  const out={};document.querySelectorAll('[data-training-param]').forEach(el=>{const spec=(descriptor.trainingParameters||[]).find(p=>p.key===el.dataset.trainingParam),raw=el.value;out[el.dataset.trainingParam]=spec?.type==='number'?Number(raw):raw});return out;
}

function renderPolicyButtons(state){
  const host=$('#policyButtons');host.innerHTML='';
  for(const policy of descriptor.capabilities.policies||['classic']){
    const b=document.createElement('button');b.textContent=policy==='classic'?'Classic':policy==='learned'?'Learned':policy;b.className=state.policy===policy?'active':'';
    if(policy==='learned')b.disabled=!state.model||!descriptor.capabilities.runtimeLearning;
    b.onclick=()=>{setSelectedPolicy(skillId,policy);render()};host.appendChild(b);
  }
}

function renderVisualizations(state,dataset){
  renderLearningVisualizations($('#visualizationHost'),descriptor.visualizations,{skillId,model:state.model,dataset,classicEvaluation:latestEvaluationForPolicy(skillId,'classic'),learnedEvaluation:latestEvaluationForPolicy(skillId,'learned'),evaluationHistory:state.evaluationHistory});
}

function render(){
  const state=skillLearningState(skillId),dataset=loadDatasetMeta(skillId),policy=selectedPolicy(skillId),evaluation=latestEvaluationForPolicy(skillId,policy)||state.evaluation;
  $('#skillTitle').textContent=`${def.code} / ${def.label}`;$('#skillDesc').textContent=def.desc;$('#skillNumber').textContent=`${def.order} / ${SKILL_LEARNING_REGISTRY.length}`;
  $('#pluginState').textContent=`${descriptor.pluginLabel} v${descriptor.pluginVersion}`;
  $('#policyState').textContent=policy==='learned'?'Learned Policy':'Classic Policy';
  $('#algorithmState').textContent=(descriptor.algorithms||[]).map(a=>a.label).join(' / ')||'なし';
  const schema=descriptor.datasetSchema;$('#datasetSchema').textContent=schema?`${schema.type} · ${(schema.observation||[]).join(', ')}`:'未定義';
  $('#datasetState').textContent=dataset?`${dataset.samples||'?'} samples · ${dataset.kind||'dataset'}`:(descriptor.capabilities.trainable?'未生成':'対象外');
  $('#modelState').textContent=state.model?`${state.model.algorithm||'model'} · ${state.model.samples||'?'} samples`:(descriptor.capabilities.trainable?'未学習':'なし');
  $('#trainingState').textContent=state.model?`loss ${fmtLoss(state.model.loss)} · ${String(state.model.trainedAt||'').slice(0,10)}`:(descriptor.capabilities.trainable?'未学習':'対象外');
  $('#evaluationState').textContent=evaluation?`${policy} ${pct(evaluation.successRate)} · ${evaluation.trials} trials`:'現在Policyは未評価';
  $('#skillNote').textContent=`${def.note} ${descriptor.note||''}`;
  $('#evalLink').href=`./evaluate.html?skill=${encodeURIComponent(skillId)}`;
  const indicator=$('#learnIndicator');indicator.className='learn-indicator';
  if(!descriptor.capabilities.trainable){indicator.textContent='×';indicator.classList.add('blocked');$('#learnTitle').textContent='このPluginでは現在学習不可';$('#learnMessage').textContent='評価と将来の拡張点はPlugin定義から表示しています。';$('#trainBtn').disabled=true;$('#trainBtn').textContent='現在は学習できません'}
  else if(state.model){indicator.textContent='✓';indicator.classList.add('ready');$('#learnTitle').textContent='学習済み';$('#learnMessage').textContent=descriptor.capabilities.runtimeLearning?'Classic / Learnedを切り替えて実行・比較できます。':'モデル保存済み。Runtime接続は未対応です。';$('#trainBtn').disabled=false;$('#trainBtn').textContent='もう一度学習'}
  else{indicator.textContent='－';$('#learnTitle').textContent='未学習';$('#learnMessage').textContent=`${descriptor.pluginLabel} が学習処理を提供します。`;$('#trainBtn').disabled=false;$('#trainBtn').textContent='このSkillを学習'}
  renderPolicyButtons(state);renderVisualizations(state,dataset);
}

renderParameterInputs();render();

$('#trainBtn').onclick=()=>{
  if(!descriptor.capabilities.trainable)return;
  const btn=$('#trainBtn'),note=$('#trainingNote');btn.disabled=true;note.classList.remove('hidden');
  const options=collectTrainingOptions();
  requestAnimationFrame(()=>setTimeout(async()=>{
    try{
      await plugin.train(skillId,{...options,onProgress:e=>{note.textContent=e.label||'学習中...';if(Number.isFinite(e.progress))note.textContent+=` ${Math.round(e.progress*100)}%`}});
      if(descriptor.capabilities.runtimeLearning)setSelectedPolicy(skillId,'learned');
    }catch(error){note.textContent=`学習エラー: ${error?.message||error}`;return}
    finally{btn.disabled=false}
    note.classList.add('hidden');render();
  },30));
};

$('#clearBtn').onclick=()=>{clearSkillModel(skillId);setSelectedPolicy(skillId,'classic');render()};
$('#nextBtn').onclick=()=>{const i=SKILL_LEARNING_REGISTRY.findIndex(s=>s.id===skillId),next=SKILL_LEARNING_REGISTRY[(i+1)%SKILL_LEARNING_REGISTRY.length];location.href=`./learn.html?skill=${encodeURIComponent(next.id)}`};
