import {Store} from './src/state/store.js';
import {SimRobot} from './src/robot/sim_robot.js';
import {WarehouseRenderer} from './src/environment/warehouse.js';
import {RulePlanner} from './src/planner/rule_planner.js';
import {Planner} from './src/planner/planner.js';
import {SkillExecutor} from './src/skills/skills.js';

const $=s=>document.querySelector(s);
const store=new Store();
const robot=new SimRobot(store);
robot.connect();
const renderer=new WarehouseRenderer($('#simCanvas'));
const planner=new Planner(new RulePlanner());
const executor=new SkillExecutor(store,robot);
let running=false;

function log(type,msg){const d=document.createElement('div');d.className=`log-line ${type}`;const t=new Date().toLocaleTimeString();d.innerHTML=`<span class="time">${t}</span> ${msg}`;$('#log').appendChild(d);$('#log').scrollTop=$('#log').scrollHeight}

function render(s){renderer.draw(s);$('#robotState').textContent=JSON.stringify(s.robot,null,2);$('#agentState').textContent=JSON.stringify({task:s.task,agent:s.agent,perception:s.perception},null,2);renderHistory(s)}

function renderHistory(s){const q=$('#skillQueue');q.innerHTML='';if(!s.agent.history.length){q.innerHTML='<div class="hint">No decisions yet.</div>';return;}s.agent.history.slice().reverse().forEach((h,i)=>{const e=document.createElement('div');e.className='skill-item '+(i===0?'current':'done');e.innerHTML=`<span>#${h.step} ${h.skill}</span><code>${JSON.stringify(h.result)}</code>`;q.appendChild(e)})}

store.subscribe(render);

async function makePlan(){
  const text=$('#taskInput').value.trim();
  if(!text){log('error','Task is empty');return;}
  store.state.task=await planner.createTask(text);
  store.state.agent.currentSkill=null;
  store.state.agent.lastResult=null;
  store.state.agent.status='ready';
  store.state.agent.stepCount=0;
  store.state.agent.history=[];
  store.state.agent.memory.retreated=false;
  store.state.perception.detectedPallets=[];
  store.emit();
  log('planner',`Task parsed → source=${store.state.task.source}, destination=${store.state.task.destination}`);
}

async function step(){
  const s=store.state;
  if(!s.task.raw || s.task.status==='idle'){await makePlan();}
  if(s.task.status==='done' || s.task.status==='failed') return false;

  const decision=await planner.next(s.task,s);
  if(decision.type==='done'){
    s.agent.status='done';s.task.status='done';s.agent.currentSkill=null;store.emit();log('success','Planner → DONE: task complete');return false;
  }
  if(decision.type==='abort'){
    s.agent.status='failed';s.task.status='failed';s.agent.lastResult={ok:false,reason:decision.reason};store.emit();log('error',`Planner → ABORT: ${decision.reason}`);return false;
  }

  const sk=decision.skill;
  s.agent.currentSkill=sk.name;
  s.agent.status='running';
  s.agent.stepCount++;
  store.emit();
  log('planner',`Planner → next Skill: ${sk.name} ${JSON.stringify(sk.args)}`);

  const result=await executor.execute(sk);
  s.agent.lastResult=result;
  s.agent.history.push({step:s.agent.stepCount,skill:sk.name,args:sk.args,result});
  if(result.ok){s.agent.status='ready';log('success',`Result → success: ${result.message||''}`)}
  else{s.agent.status='failed';s.task.status='failed';log('error',`Result → failed: ${result.reason}`)}
  store.emit();
  return result.ok;
}

async function run(){if(running)return;running=true;while(running){const keep=await step();if(!keep||store.state.task.status==='done'||store.state.task.status==='failed')break;await new Promise(r=>setTimeout(r,450))}running=false}

$('#planBtn').onclick=makePlan;
$('#stepBtn').onclick=step;
$('#runBtn').onclick=run;
$('#resetBtn').onclick=()=>{running=false;store.reset();log('planner','System reset')};
$('#clearLogBtn').onclick=()=>$('#log').innerHTML='';
document.querySelectorAll('[data-manual]').forEach(b=>b.onclick=()=>{const a=b.dataset.manual;if(a==='forward')robot.sendAction({type:'move',dx:0,dy:-18});if(a==='back')robot.sendAction({type:'move',dx:0,dy:18});if(a==='left')robot.sendAction({type:'move',dx:-18,dy:0});if(a==='right')robot.sendAction({type:'move',dx:18,dy:0});if(a==='lift')robot.sendAction({type:'fork',raised:!store.state.robot.forkRaised})});

log('planner','Ready: v0.5 state-driven Agent loop / Rule Planner / SimRobot');
