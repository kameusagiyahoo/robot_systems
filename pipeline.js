const SKILLS=[
  {id:'navigate_to_pallet',label:'移動',code:'Navigate',desc:'パレット付近まで移動'},
  {id:'detect_pallet',label:'検出',code:'Detect',desc:'パレットを検出'},
  {id:'align_to_pallet',label:'位置合せ',code:'Align',desc:'フォーク位置へ精密位置合わせ',learn:true},
  {id:'insert_forks',label:'差込み',code:'Insert',desc:'フォークを差し込む'},
  {id:'lift',label:'持上げ',code:'Lift',desc:'パレットを持ち上げる'},
  {id:'navigate_to',label:'搬送',code:'Transport',desc:'目的地まで搬送'},
  {id:'place',label:'設置',code:'Place',desc:'目的地へ設置'},
  {id:'retreat',label:'退避',code:'Retreat',desc:'パレットから離れる'}
];
const BC_KEY='forklift_bc_align_v1';
const $=s=>document.querySelector(s);
function controllerLabel(){const v=$('#controllerSelect')?.value||'pure_pursuit';return{pure_pursuit:'PurePursuit',rule_waypoint:'Rule',pid_path:'PID'}[v]||v}
function learnedModel(){try{return JSON.parse(localStorage.getItem(BC_KEY)||'null')}catch{return null}}
function methodFor(id){if(id==='navigate_to_pallet'||id==='navigate_to')return controllerLabel();if(id==='align_to_pallet')return learnedModel()?'BC':'Rule';if(id==='detect_pallet')return'Rule';return'Rule'}
function statusText(v){return{pending:'未',current:'実行',success:'OK',failed:'NG'}[v]||v}
function parseStatuses(){const state=Object.fromEntries(SKILLS.map(s=>[s.id,'pending']));let current=null;document.querySelectorAll('#log .log-line').forEach(line=>{const text=line.innerText;const m=text.match(/(?:Planner|Replan recovery)\s*→\s*([a-z_]+)/i);if(m&&state[m[1]]!==undefined){current=m[1];state[current]='current';return}if(/Result\s*→\s*success/i.test(text)&&current){state[current]='success';current=null;return}if(/Result\s*→\s*failed/i.test(text)&&current){state[current]='failed';current=null}});return state}
function renderPipeline(){const host=$('#taskPipeline');if(!host)return;const states=parseStatuses(),model=learnedModel();host.innerHTML='';SKILLS.forEach((skill,index)=>{const state=states[skill.id],card=document.createElement('div'),learned=skill.learn&&!!model;card.className=`pipeline-skill ${state}`;card.dataset.skill=skill.id;card.title=`${index+1}. ${skill.label} / ${skill.desc}`;card.innerHTML=`<div class="skill-order">${index+1}</div><div class="skill-main"><strong>${index+1}. ${skill.label}</strong><span class="skill-desc">${skill.desc}</span><div class="skill-meta"><span>${methodFor(skill.id)}</span><span>${skill.learn?(learned?'学習済':'未学習'):'固定'}</span></div></div><div class="skill-side"><span class="pipeline-status ${state}">${statusText(state)}</span>${skill.learn?'<a class="skill-learn-link" href="./learn.html">学習</a>':''}</div>`;host.appendChild(card)});const task=$('#taskInput')?.value?.trim();if($('#pipelineTaskName'))$('#pipelineTaskName').textContent=task||'パレット搬送';const learnedCount=SKILLS.filter(s=>s.learn&&model).length;if($('#pipelineLearnedSummary'))$('#pipelineLearnedSummary').textContent=`学習 ${learnedCount}/${SKILLS.length}`;window.dispatchEvent(new CustomEvent('pipeline:model',{detail:{model}}))}
function install(){renderPipeline();const log=$('#log');if(log)new MutationObserver(renderPipeline).observe(log,{childList:true,subtree:true});$('#controllerSelect')?.addEventListener('change',renderPipeline);$('#taskInput')?.addEventListener('input',renderPipeline);$('#resetBtn')?.addEventListener('click',()=>setTimeout(renderPipeline,0));window.addEventListener('storage',renderPipeline);window.addEventListener('focus',renderPipeline)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();