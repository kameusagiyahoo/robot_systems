import {SKILL_LEARNING_REGISTRY,skillLearningState,latestEvaluationForPolicy} from './src/learning/skill_learning_registry.js';
const $=s=>document.querySelector(s);

function ensureStyles(){if(document.querySelector('link[data-skill-learning-style]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./skill_learning.css';l.dataset.skillLearningStyle='1';document.head.appendChild(l)}
function learningStateLabel(skill){
  const s=skillLearningState(skill.id),controller=$('#controllerSelect')?.value||'pure_pursuit',evaluation=latestEvaluationForPolicy(skill.id,s.policy,controller)||latestEvaluationForPolicy(skill.id,s.policy)||s.evaluation,score=evaluation?`${Math.round((evaluation.successRate||0)*100)}%`:'未評価';
  if(!skill.trainable)return `${skill.group==='perception'?'画像待ち':'固定'} / 評価 ${score}`;
  if(s.trained)return `${s.runtimeLearning?(s.policy==='learned'?'学習使用中':'学習済'):'学習済・未接続'} / 評価 ${score}`;
  return `未学習 / 評価 ${score}`;
}
function renderLearningList(){
  const host=$('#learningSkillList');if(!host)return;host.innerHTML='';
  SKILL_LEARNING_REGISTRY.forEach(skill=>{
    const state=skillLearningState(skill.id),row=document.createElement('div');
    row.className=`learning-skill-row ${state.trained?'trained':''} ${!skill.trainable?'disabled-learning':''}`;
    row.innerHTML=`<div class="learning-skill-order">${skill.order}</div><div class="learning-skill-main"><strong>${skill.label}</strong><small>${skill.code}</small><span>${learningStateLabel(skill)}</span></div><div class="learning-skill-actions"><a href="./learn.html?skill=${encodeURIComponent(skill.id)}">${skill.trainable?'学習/管理':'詳細'}</a><a class="eval" href="./evaluate.html?skill=${encodeURIComponent(skill.id)}">評価</a></div>`;
    host.appendChild(row);
  });
}
function openSheet(id){const d=document.getElementById(id);if(!d)return;if(id==='learnSheet')renderLearningList();if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','')}
function closeSheet(d){if(!d)return;if(typeof d.close==='function')d.close();else d.removeAttribute('open')}
function install(){
  ensureStyles();document.querySelectorAll('[data-open-sheet]').forEach(btn=>btn.addEventListener('click',()=>openSheet(btn.dataset.openSheet)));document.querySelectorAll('[data-close-sheet]').forEach(btn=>btn.addEventListener('click',()=>closeSheet(btn.closest('dialog'))));document.querySelectorAll('dialog.bottom-sheet').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right)closeSheet(d)}));window.addEventListener('pipeline:model',renderLearningList);window.addEventListener('focus',renderLearningList);window.addEventListener('storage',renderLearningList);$('#controllerSelect')?.addEventListener('change',renderLearningList);renderLearningList();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
