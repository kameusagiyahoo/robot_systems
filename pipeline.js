const SKILLS=[
  {id:'navigate_to_pallet',label:'NavigateToPallet',desc:'パレット付近まで移動'},
  {id:'detect_pallet',label:'DetectPallet',desc:'パレットを検出'},
  {id:'align_to_pallet',label:'AlignToPallet',desc:'フォーク位置へ精密位置合わせ',learn:true},
  {id:'insert_forks',label:'InsertForks',desc:'フォークを差し込む'},
  {id:'lift',label:'Lift',desc:'パレットを持ち上げる'},
  {id:'navigate_to',label:'Transport',desc:'目的地まで搬送'},
  {id:'place',label:'Place',desc:'目的地へ設置'},
  {id:'retreat',label:'Retreat',desc:'パレットから離れる'}
];
const BC_KEY='forklift_bc_align_v1';
const $=s=>document.querySelector(s);

function controllerLabel(){
  const v=$('#controllerSelect')?.value||'pure_pursuit';
  return {pure_pursuit:'Pure Pursuit',rule_waypoint:'Rule Waypoint',pid_path:'PID Path'}[v]||v;
}
function learnedModel(){
  try{return JSON.parse(localStorage.getItem(BC_KEY)||'null')}catch{return null}
}
function methodFor(id){
  if(id==='navigate_to_pallet'||id==='navigate_to')return controllerLabel();
  if(id==='align_to_pallet')return learnedModel()?'Behavior Cloning':'Rule staged docking';
  if(id==='detect_pallet')return 'Rule perception';
  return 'Rule';
}
function statusText(v){return {pending:'未実行',current:'実行中',success:'成功',failed:'失敗'}[v]||v}

function parseStatuses(){
  const state=Object.fromEntries(SKILLS.map(s=>[s.id,'pending']));
  let current=null;
  document.querySelectorAll('#log .log-line').forEach(line=>{
    const text=line.innerText;
    const m=text.match(/(?:Planner|Replan recovery)\s*→\s*([a-z_]+)/i);
    if(m&&state[m[1]]!==undefined){current=m[1];state[current]='current';return}
    if(/Result\s*→\s*success/i.test(text)&&current){state[current]='success';current=null;return}
    if(/Result\s*→\s*failed/i.test(text)&&current){state[current]='failed';current=null}
  });
  return state;
}

function renderPipeline(){
  const host=$('#taskPipeline');if(!host)return;
  const states=parseStatuses();
  const model=learnedModel();
  host.innerHTML='';
  SKILLS.forEach((skill,index)=>{
    const card=document.createElement('div');
    const state=states[skill.id];
    card.className=`pipeline-skill ${state}`;
    card.dataset.skill=skill.id;
    const learned=skill.learn&&!!model;
    const modelInfo=skill.learn?(learned?`学習済み · ${model.samples||'?'} samples`:'未学習') : '固定ロジック';
    card.innerHTML=`
      <div class="skill-order">${index+1}</div>
      <div class="skill-main">
        <strong>${skill.label}</strong>
        <span class="skill-desc">${skill.desc}</span>
        <div class="skill-meta"><span>${methodFor(skill.id)}</span><span>${modelInfo}</span></div>
      </div>
      <div class="skill-side">
        <span class="pipeline-status ${state}">${statusText(state)}</span>
        ${skill.learn?'<a class="skill-learn-link" href="./learn.html">このSkillを学習</a>':''}
      </div>`;
    host.appendChild(card);
  });
  const task=$('#taskInput')?.value?.trim();
  const taskName=$('#pipelineTaskName');if(taskName)taskName.textContent=task||'パレット搬送タスク';
  const learnedCount=SKILLS.filter(s=>s.learn&&model).length;
  const learnedSummary=$('#pipelineLearnedSummary');
  if(learnedSummary)learnedSummary.textContent=`学習型Skill: ${learnedCount} / ${SKILLS.length}`;
}

function install(){
  renderPipeline();
  const log=$('#log');if(log)new MutationObserver(renderPipeline).observe(log,{childList:true,subtree:true});
  $('#controllerSelect')?.addEventListener('change',renderPipeline);
  $('#taskInput')?.addEventListener('input',renderPipeline);
  $('#resetBtn')?.addEventListener('click',()=>setTimeout(renderPipeline,0));
  window.addEventListener('storage',renderPipeline);
  window.addEventListener('focus',renderPipeline);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
