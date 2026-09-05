import {SKILL_LEARNING_REGISTRY,skillLearningState} from './src/learning/skill_learning_registry.js';
const $=s=>document.querySelector(s);

function learningStateLabel(skill){
  const s=skillLearningState(skill.id);
  if(!skill.trainable)return skill.group==='perception'?'画像待ち':'固定ロジック';
  if(s.trained)return s.runtimeLearning?(s.policy==='learned'?'学習モデル使用中':'学習済み'):'学習済み・実行未接続';
  return'未学習';
}
function renderLearningList(){
  const host=$('#learningSkillList');if(!host)return;host.innerHTML='';
  SKILL_LEARNING_REGISTRY.forEach(skill=>{
    const state=skillLearningState(skill.id),row=document.createElement('a');
    row.className=`learning-skill-row ${state.trained?'trained':''} ${!skill.trainable?'disabled-learning':''}`;
    row.href=`./learn.html?skill=${encodeURIComponent(skill.id)}`;
    row.innerHTML=`<div class="learning-skill-order">${skill.order}</div><div class="learning-skill-main"><strong>${skill.label}</strong><small>${skill.code}</small></div><div class="learning-skill-state"><span>${learningStateLabel(skill)}</span><b>›</b></div>`;
    host.appendChild(row);
  });
}
function openSheet(id){const d=document.getElementById(id);if(!d)return;if(id==='learnSheet')renderLearningList();if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','')}
function closeSheet(d){if(!d)return;if(typeof d.close==='function')d.close();else d.removeAttribute('open')}
function install(){
  document.querySelectorAll('[data-open-sheet]').forEach(btn=>btn.addEventListener('click',()=>openSheet(btn.dataset.openSheet)));
  document.querySelectorAll('[data-close-sheet]').forEach(btn=>btn.addEventListener('click',()=>closeSheet(btn.closest('dialog'))));
  document.querySelectorAll('dialog.bottom-sheet').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right)closeSheet(d)}));
  window.addEventListener('pipeline:model',renderLearningList);window.addEventListener('focus',renderLearningList);window.addEventListener('storage',renderLearningList);renderLearningList();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
