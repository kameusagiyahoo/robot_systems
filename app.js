import {Store} from './src/state/store.js';
import {SimRobot} from './src/robot/sim_robot.js';
import {WarehouseRenderer} from './src/environment/warehouse.js';
import {RulePlanner} from './src/planner/rule_planner.js';
import {Planner} from './src/planner/planner.js';
import {SkillExecutor} from './src/skills/skills.js';
import {RulePolicy} from './src/policy/rule_policy.js';
import {EpisodeLogger} from './src/logging/episode_logger.js';
import {buildObservation,buildAction,buildResult} from './src/core/schemas.js';

const $=s=>document.querySelector(s);
const store=new Store();
const robot=new SimRobot(store);robot.connect();
const renderer=new WarehouseRenderer($('#simCanvas'));
const planner=new Planner(new RulePlanner());
const policy=new RulePolicy(store,robot);
const executor=new SkillExecutor(store,policy);
const episodes=new EpisodeLogger();
let running=false;

function log(type,msg){const d=document.createElement('div');d.className=`log-line ${type}`;const t=new Date().toLocaleTimeString();d.innerHTML=`<span class="time">${t}</span> ${msg}`;$('#log').appendChild(d);$('#log').scrollTop=$('#log').scrollHeight}
function render(s){renderer.draw(s);$('#robotState').textContent=JSON.stringify(s.robot,null,2);$('#agentState').textContent=JSON.stringify({task:s.task,agent:s.agent,perception:s.perception,failures:s.failures,obstacle:s.obstacle.enabled},null,2);renderHistory(s);syncFailureControls(s);renderMetrics()}
function renderHistory(s){const q=$('#skillQueue');q.innerHTML='';if(!s.agent.history.length){q.innerHTML='<div class="hint">No decisions yet.</div>';return;}s.agent.history.slice().reverse().forEach((h,i)=>{const e=document.createElement('div');e.className='skill-item '+(i===0?'current':'done');e.innerHTML=`<span>#${h.step} ${h.skill}${h.recovery?' ↻ recovery':''}</span><code>${JSON.stringify(h.result)}</code>`;q.appendChild(e)})}
function syncFailureControls(s){$('#obstacleToggle').checked=s.obstacle.enabled;$('#detectFailToggle').checked=s.failures.forceDetectionFailure;$('#alignFailToggle').checked=s.failures.forceAlignmentFailure;$('#insertFailToggle').checked=s.failures.forceInsertionFailure}
function renderMetrics(){const ep=episodes.current||episodes.completed.at(-1);$('#episodeState').textContent=ep?JSON.stringify({id:ep.id,status:ep.status||'running',metrics:ep.metrics},null,2):'No episode yet.'}
store.subscribe(render);

async function makePlan(){
  const text=$('#taskInput').value.trim();if(!text){log('error','Task is empty');return false;}
  store.state.task=await planner.createTask(text);
  Object.assign(store.state.agent,{currentSkill:null,lastResult:null,status:store.state.task.status==='invalid'?'invalid':'ready',stepCount:0,history:[]});
  store.state.agent.memory={retreated:false,alternateRoute:false,retries:{},lastFailedSkill:null};
  store.state.perception.detectedPallets=[];store.emit();
  if(store.state.task.status==='invalid'){log('error','Task parse failed. Example: パレットAを出荷エリアへ運んで');return false;}
  episodes.start(store.state.task);renderMetrics();log('planner',`Task parsed → source=${store.state.task.source}, destination=${store.state.task.destination}`);return true;
}

function finishEpisode(success,status){const ep=episodes.finish(success,status);renderMetrics();if(ep)log(success?'success':'error',`Episode ${ep.id} → ${status}; steps=${ep.metrics.stepCount}, failures=${ep.metrics.failures}, recoveries=${ep.metrics.recoveries}`)}

async function step(){
  const s=store.state;
  if(!s.task.raw||s.task.status==='idle'){const ok=await makePlan();if(!ok)return false;}
  if(['done','failed','invalid'].includes(s.task.status))return false;

  const observation=buildObservation(s);
  const decision=await planner.next(s.task,s);
  if(decision.type==='done'){s.agent.status='done';s.task.status='done';s.agent.currentSkill=null;store.emit();log('success','Planner → DONE');finishEpisode(true,'done');return false;}
  if(decision.type==='abort'){s.agent.status='failed';s.task.status='failed';s.agent.lastResult={ok:false,reason:decision.reason};store.emit();log('error',`Planner → ABORT: ${decision.reason}`);finishEpisode(false,'aborted');return false;}

  const sk=decision.skill;s.agent.currentSkill=sk.name;s.agent.status=decision.recovery?'recovering':'running';s.agent.stepCount++;store.emit();
  log(decision.recovery?'planner':'skill',`${decision.recovery?'Replan recovery':'Planner'} → ${sk.name} ${JSON.stringify(sk.args)}`);
  const action=buildAction(s.agent.stepCount,sk.name,sk.args);
  const rawResult=await executor.execute(sk);const result=buildResult(rawResult);
  s.agent.lastResult=result;
  s.agent.history.push({step:s.agent.stepCount,skill:sk.name,args:sk.args,recovery:!!decision.recovery,result});
  if(result.ok){
    if(decision.recovery)episodes.recovery();
    s.agent.status='ready';
    log('success',`Result → success: ${result.message||''}`);
  }else{
    s.agent.status='recovering';s.agent.memory.lastFailedSkill=sk.name;s.agent.memory.retries[sk.name]=(s.agent.memory.retries[sk.name]||0)+1;
    log('error',`Result → failed: ${result.reason}; Planner will reconsider`);
  }
  store.emit();
  episodes.record(observation,action,result,buildObservation(s));renderMetrics();
  return true;
}

async function run(){if(running)return;running=true;let guard=0;while(running&&guard++<40){const keep=await step();if(!keep||['done','failed','invalid'].includes(store.state.task.status))break;await new Promise(r=>setTimeout(r,450))}if(guard>=40)log('error','Run stopped by 40-step safety guard');running=false}
function setFailure(path,value,label){if(path==='obstacle')store.state.obstacle.enabled=value;else store.state.failures[path]=value;store.emit();log('planner',`${label}: ${value?'ON':'OFF'}`)}
function downloadEpisode(){const data=episodes.exportLatest();if(!data){log('error','No episode to export');return;}const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`forklift_episode_${Date.now()}.json`;a.click();URL.revokeObjectURL(url);log('success','Episode JSON exported')}

$('#planBtn').onclick=makePlan;$('#stepBtn').onclick=step;$('#runBtn').onclick=run;
$('#resetBtn').onclick=()=>{running=false;if(episodes.current)episodes.finish(false,'reset');store.reset();renderMetrics();log('planner','System reset')};
$('#clearLogBtn').onclick=()=>$('#log').innerHTML='';$('#downloadEpisodeBtn').onclick=downloadEpisode;
$('#obstacleToggle').onchange=e=>setFailure('obstacle',e.target.checked,'Obstacle');$('#detectFailToggle').onchange=e=>setFailure('forceDetectionFailure',e.target.checked,'Detection failure');$('#alignFailToggle').onchange=e=>setFailure('forceAlignmentFailure',e.target.checked,'Alignment failure');$('#insertFailToggle').onchange=e=>setFailure('forceInsertionFailure',e.target.checked,'Insertion failure');
document.querySelectorAll('[data-manual]').forEach(b=>b.onclick=()=>{const a=b.dataset.manual;if(a==='forward')robot.sendAction({type:'move',dx:0,dy:-18});if(a==='back')robot.sendAction({type:'move',dx:0,dy:18});if(a==='left')robot.sendAction({type:'move',dx:-18,dy:0});if(a==='right')robot.sendAction({type:'move',dx:18,dy:0});if(a==='lift')robot.sendAction({type:'fork',raised:!store.state.robot.forkRaised})});
log('planner','Ready: v0.9 Planner → Skill contracts → Policy → Robot + Replanning + Episode logging');
