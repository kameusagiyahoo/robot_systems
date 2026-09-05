import {Store} from './src/state/store.js';
import {SimRobot} from './src/robot/sim_robot.js';
import {WarehouseRenderer} from './src/environment/warehouse.js';
import {RulePlanner} from './src/planner/rule_planner.js';
import {Planner} from './src/planner/planner.js';
import {SkillExecutor} from './src/skills/skills.js';
import {RulePolicy} from './src/policy/rule_policy.js';
import {EpisodeLogger} from './src/logging/episode_logger.js';
import {buildObservation,buildAction,buildResult} from './src/core/schemas.js';
import {generateScenarios,applyScenario,taskTextForScenario} from './src/benchmark/scenarios.js';
import {buildLearningEpisodeMetadata} from './src/learning/framework/episode_metadata.js';
import './src/learning/plugins/default_skill_plugins.js';
import {SKILL_LEARNING_REGISTRY,saveDatasetMeta} from './src/learning/skill_learning_registry.js';
import {getLearningDescriptor,getDemonstrationRecorderAdapter} from './src/learning/framework/plugin_registry.js';

const $=s=>document.querySelector(s);
const store=new Store();
const robot=new SimRobot(store);robot.connect();
const renderer=new WarehouseRenderer($('#simCanvas'));
const planner=new Planner(new RulePlanner());
const policy=new RulePolicy(store,robot);
const executor=new SkillExecutor(store,policy);
const episodes=new EpisodeLogger();
let running=false,batchRunning=false,lastBenchmark=null,toastTimer=null;
let demoRecorder=null,demoSkillId=null,manualTimer=null,manualButton=null;

const controllerName=v=>({pure_pursuit:'Pure Pursuit',rule_waypoint:'Rule Waypoint',pid_path:'PID Path'}[v]||v);
const statusName=v=>({idle:'待機中',ready:'実行準備',running:'実行中',recovering:'回復処理中',done:'成功',failed:'失敗',invalid:'入力エラー',aborted:'中断'}[v]||v||'待機中');

function showToast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1600)}
async function copyText(text){
  if(!text)return showToast('コピーする内容がありません');
  try{await navigator.clipboard.writeText(text);showToast('コピーしました');return}catch{}
  const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');showToast('コピーしました')}catch{showToast('コピーできませんでした')}
  ta.remove();
}

function log(type,msg){const d=document.createElement('div');d.className=`log-line ${type}`;const t=new Date().toLocaleTimeString();d.innerHTML=`<span class="time">${t}</span> ${msg}`;$('#log').appendChild(d);$('#log').scrollTop=$('#log').scrollHeight}

function recordableDemoSkills(){
  return SKILL_LEARNING_REGISTRY.filter(skill=>{
    try{return !!getLearningDescriptor(skill.id)?.capabilities?.demonstrationRecording&&!!getDemonstrationRecorderAdapter(skill.id)}catch{return false}
  });
}
function initDemoRecorderUi(){
  const select=$('#demoSkill');if(!select)return;select.innerHTML='';
  for(const skill of recordableDemoSkills()){const o=document.createElement('option');o.value=skill.id;o.textContent=`${skill.order}. ${skill.label} / ${skill.code}`;select.appendChild(o)}
  if(!select.options.length){const o=document.createElement('option');o.value='';o.textContent='Recorder対応Skillなし';select.appendChild(o);select.disabled=true}
  renderDemoRecorder();
}
function renderDemoRecorder(){
  const state=$('#demoRecordState');if(!state)return;
  const status=demoRecorder?.status?.()||{active:false,samples:0},active=!!status.active;
  state.classList.toggle('recording',active);
  state.textContent=active?`● 記録中: ${demoSkillId} / ${status.samples} samples`:'Recorder: 待機中';
  if($('#demoRecordBtn'))$('#demoRecordBtn').disabled=active||!$('#demoSkill')?.value;
  if($('#demoStopBtn'))$('#demoStopBtn').disabled=!active;
  if($('#demoDiscardBtn'))$('#demoDiscardBtn').disabled=!active;
  if($('#demoSkill'))$('#demoSkill').disabled=active||!$('#demoSkill').options.length;
  if($('#demoReplaceToggle'))$('#demoReplaceToggle').disabled=active;
}
function startDemoRecording(){
  if(running||batchRunning){showToast('Task実行中は記録を開始できません');return}
  const skillId=$('#demoSkill')?.value;if(!skillId)return;
  try{
    demoRecorder=getDemonstrationRecorderAdapter(skillId);demoSkillId=skillId;
    demoRecorder.start(skillId,{store,replace:!!$('#demoReplaceToggle')?.checked});
    renderDemoRecorder();log('skill',`Demonstration recording start → ${skillId}`);
  }catch(error){demoRecorder=null;demoSkillId=null;renderDemoRecorder();showToast(`Recorder error: ${error?.message||error}`)}
}
function stopDemoRecording(save=true){
  if(!demoRecorder||!demoSkillId)return null;
  const skillId=demoSkillId,descriptor=getLearningDescriptor(skillId);let result;
  try{result=save?demoRecorder.stop(skillId,{save:true}):demoRecorder.discard(skillId)}catch(error){showToast(`Recorder error: ${error?.message||error}`);return null}
  if(save&&result?.saved){
    saveDatasetMeta(skillId,{kind:'manual_recorded',samples:result.total,recordedAt:new Date().toISOString(),pluginId:descriptor.pluginId,datasetAdapterId:descriptor.datasetAdapter?.id||null,datasetAdapterVersion:descriptor.datasetAdapter?.version??null,demonstrationRecorderAdapterId:descriptor.demonstrationRecorderAdapter?.id||null,demonstrationRecorderAdapterVersion:descriptor.demonstrationRecorderAdapter?.version??null});
    log('success',`Demonstration saved → ${skillId}: +${result.saved} / total ${result.total} samples`);showToast(`${result.saved} samples 保存`);
  }else if(!save){log('planner',`Demonstration discarded → ${skillId}: ${result?.total||0} samples`)}
  demoRecorder=null;demoSkillId=null;renderDemoRecorder();window.dispatchEvent(new Event('storage'));return result;
}
function manualAction(name){
  if(name==='forward')return{type:'drive',speed:60,steeringAngle:0};
  if(name==='back')return{type:'drive',speed:-45,steeringAngle:0};
  if(name==='left')return{type:'drive',speed:35,steeringAngle:25};
  if(name==='right')return{type:'drive',speed:35,steeringAngle:-25};
  return null;
}
function sendManualDrive(action){
  if(!action)return;
  if(demoRecorder?.status?.().active&&demoSkillId)demoRecorder.record(demoSkillId,action,{store});
  robot.sendAction({...action,dt:store.state.simulation.dt});
  renderDemoRecorder();
}
function stopManualHold(){
  if(manualTimer){clearInterval(manualTimer);manualTimer=null}
  if(manualButton){manualButton.classList.remove('manual-active');manualButton=null}
  robot.sendAction({type:'stop'});
}
function installManualControls(){
  document.querySelectorAll('[data-manual]').forEach(button=>{
    const name=button.dataset.manual;
    button.addEventListener('contextmenu',e=>e.preventDefault());
    if(name==='lift'){
      button.addEventListener('click',()=>robot.sendAction({type:'fork',raised:!store.state.robot.forkRaised}));return;
    }
    button.addEventListener('pointerdown',e=>{
      if(running||batchRunning)return;e.preventDefault();try{button.setPointerCapture(e.pointerId)}catch{}
      stopManualHold();manualButton=button;button.classList.add('manual-active');const action=manualAction(name);sendManualDrive(action);manualTimer=setInterval(()=>sendManualDrive(action),80);
    });
    const stop=e=>{e?.preventDefault?.();stopManualHold()};button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',stop);
  });
}

function renderStatus(s){
  const taskStatus=s.task?.status||'idle';
  const agentStatus=s.agent?.status||'idle';
  const latestEp=episodes.current||episodes.completed.at(-1);
  let status=agentStatus;
  if(latestEp?.status==='aborted')status='aborted';
  if(taskStatus==='done')status='done';
  if(taskStatus==='failed')status='failed';
  if(taskStatus==='invalid')status='invalid';
  const badge=$('#statusBadge');badge.textContent=statusName(status);badge.className=`status-badge ${status}`;
  $('#statusTask').textContent=s.task?.raw||'未実行';
  $('#statusController').textContent=controllerName(s.simulation.controller);
  $('#statusStep').textContent=String(s.agent.stepCount||0);
  $('#statusCollision').textContent=String(s.simulation.collisions||0);
  const reason=s.agent?.lastResult?.ok===false?s.agent.lastResult.reason:null;
  $('#failureSummary').classList.toggle('hidden',!reason);
  $('#failureReason').textContent=reason||'-';
  const guide=$('#statusGuide');
  if(status==='done')guide.textContent='タスク完了';
  else if(['failed','aborted','invalid'].includes(status))guide.textContent='失敗しました。診断コピーで原因を共有できます。';
  else if(status==='running')guide.textContent='実行中';
  else if(status==='recovering')guide.textContent='失敗を検知。回復処理中';
  else guide.textContent='タスクを入力して実行してください。';
}

function render(s){
  renderer.draw(s);
  $('#robotState').textContent=JSON.stringify({robot:s.robot,simulation:s.simulation,path:{active:s.path.active,index:s.path.index,lookaheadTarget:s.path.lookaheadTarget},benchmark:s.benchmark||null},null,2);
  $('#agentState').textContent=JSON.stringify({task:s.task,agent:s.agent,perception:s.perception,failures:s.failures,obstacle:s.obstacle.enabled},null,2);
  renderHistory(s);syncControls(s);renderMetrics();renderStatus(s);renderDemoRecorder();
}
function renderHistory(s){const q=$('#skillQueue');q.innerHTML='';if(!s.agent.history.length){q.innerHTML='<div class="hint">まだDecisionはありません。</div>';return;}s.agent.history.slice().reverse().forEach((h,i)=>{const e=document.createElement('div');e.className='skill-item '+(i===0?'current':'done');e.innerHTML=`<span>#${h.step} ${h.skill}${h.recovery?' ↻ recovery':''}</span><code>${JSON.stringify(h.result)}</code>`;q.appendChild(e)})}
function syncControls(s){$('#obstacleToggle').checked=s.obstacle.enabled;$('#detectFailToggle').checked=s.failures.forceDetectionFailure;$('#alignFailToggle').checked=s.failures.forceAlignmentFailure;$('#insertFailToggle').checked=s.failures.forceInsertionFailure;$('#controllerSelect').value=s.simulation.controller;$('#lookaheadInput').value=s.simulation.lookaheadDistance;$('#pidKp').value=s.simulation.pid.kp;$('#pidKi').value=s.simulation.pid.ki;$('#pidKd').value=s.simulation.pid.kd;$('#pidCte').value=s.simulation.pid.cteGain}
function renderMetrics(){const ep=episodes.current||episodes.completed.at(-1);$('#episodeState').textContent=ep?JSON.stringify({id:ep.id,status:ep.status||'running',meta:ep.meta,metrics:ep.metrics},null,2):'No episode yet.'}
store.subscribe(render);

async function makePlan(){const text=$('#taskInput').value.trim();if(!text){log('error','Task is empty');return false;}store.state.task=await planner.createTask(text);Object.assign(store.state.agent,{currentSkill:null,lastResult:null,status:store.state.task.status==='invalid'?'invalid':'ready',stepCount:0,history:[]});store.state.agent.memory={retreated:false,alternateRoute:false,retries:{},lastFailedSkill:null};store.state.perception.detectedPallets=[];store.emit();if(store.state.task.status==='invalid'){log('error','Task parse failed. Example: パレットAを出荷エリアへ運んで');return false;}episodes.start(store.state.task,{appVersion:'v2.4',controller:store.state.simulation.controller,vehicleModel:store.state.simulation.vehicleModel,lookaheadDistance:store.state.simulation.lookaheadDistance,pid:{...store.state.simulation.pid},benchmark:store.state.benchmark||null,learning:buildLearningEpisodeMetadata()});renderMetrics();log('planner',`Task parsed → ${store.state.task.source} → ${store.state.task.destination}; controller=${store.state.simulation.controller}`);return true;}
function finishEpisode(success,status){const ep=episodes.finish(success,status);renderMetrics();if(ep)log(success?'success':'error',`Episode ${ep.id} → ${status}; steps=${ep.metrics.stepCount}, collisions=${ep.metrics.collisions}, cte=${ep.metrics.meanCrossTrackError??'-'}`)}
async function step(){const s=store.state;if(!s.task.raw||s.task.status==='idle'){const ok=await makePlan();if(!ok)return false;}if(['done','failed','invalid'].includes(s.task.status))return false;const observation=buildObservation(s);const decision=await planner.next(s.task,s);if(decision.type==='done'){s.agent.status='done';s.task.status='done';s.agent.currentSkill=null;store.emit();log('success','Planner → DONE');finishEpisode(true,'done');renderStatus(s);return false;}if(decision.type==='abort'){s.agent.status='failed';s.task.status='failed';s.agent.lastResult={ok:false,reason:decision.reason};store.emit();log('error',`Planner → ABORT: ${decision.reason}`);finishEpisode(false,'aborted');renderStatus(s);return false;}const sk=decision.skill;s.agent.currentSkill=sk.name;s.agent.status=decision.recovery?'recovering':'running';s.agent.stepCount++;store.emit();log(decision.recovery?'planner':'skill',`${decision.recovery?'Replan recovery':'Planner'} → ${sk.name}`);const action=buildAction(s.agent.stepCount,sk.name,sk.args);const result=buildResult(await executor.execute(sk));s.agent.lastResult=result;s.agent.history.push({step:s.agent.stepCount,skill:sk.name,args:sk.args,recovery:!!decision.recovery,result});if(result.ok){if(decision.recovery)episodes.recovery();s.agent.status='ready';log('success',`Result → success: ${result.message||''}`)}else{s.agent.status='recovering';s.agent.memory.lastFailedSkill=sk.name;s.agent.memory.retries[sk.name]=(s.agent.memory.retries[sk.name]||0)+1;log('error',`Result → failed: ${result.reason}; Planner will reconsider`)}store.emit();episodes.record(observation,action,result,buildObservation(s));renderMetrics();return true;}
async function run(){if(running||batchRunning)return;if(demoRecorder?.status?.().active)stopDemoRecording(true);running=true;let guard=0;while(running&&guard++<40){const keep=await step();if(!keep||['done','failed','invalid'].includes(store.state.task.status))break;await new Promise(r=>setTimeout(r,350))}if(guard>=40)log('error','Run stopped by 40-step safety guard');running=false;renderStatus(store.state)}

function initTaskForBatch(taskText){store.state.task=planner.adapter.parseTask(taskText);store.state.agent.currentSkill=null;store.state.agent.lastResult=null;store.state.agent.status=store.state.task.status==='invalid'?'invalid':'ready';store.state.agent.stepCount=0;store.state.agent.history=[];store.state.agent.memory={retreated:false,alternateRoute:false,retries:{},lastFailedSkill:null};store.state.perception.detectedPallets=[]}
async function runBatchTrial(taskText,controller,lookahead,pid,scenario=null){store.reset();store.state.simulation.controller=controller;store.state.simulation.lookaheadDistance=lookahead;store.state.simulation.pid={...pid};store.state.simulation.batchMode=true;if(scenario)applyScenario(store.state,scenario);initTaskForBatch(taskText);if(store.state.task.status==='invalid')return{success:false,invalid:true};let success=false,failures=0,recoveries=0,cte=[];for(let guard=0;guard<40;guard++){const s=store.state,decision=await planner.next(s.task,s);if(decision.type==='done'){success=true;break}if(decision.type==='abort')break;const sk=decision.skill;s.agent.stepCount++;const raw=await executor.execute(sk);const result=buildResult(raw);s.agent.lastResult=result;if(Number.isFinite(raw.meanCrossTrackError))cte.push(raw.meanCrossTrackError);if(result.ok){if(decision.recovery)recoveries++}else{failures++;s.agent.memory.lastFailedSkill=sk.name;s.agent.memory.retries[sk.name]=(s.agent.memory.retries[sk.name]||0)+1}}const sim=store.state.simulation;return{success,failures,recoveries,pathLength:sim.pathLength,controlTicks:sim.controlTicks,simTimeSec:sim.controlTicks*sim.dt,collisions:sim.collisions,meanCrossTrackError:cte.length?cte.reduce((a,b)=>a+b,0)/cte.length:null,scenarioId:scenario?.id||null}}
const avg=(xs,key)=>{const v=xs.map(x=>x[key]).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
function summarize(controller,runs){return{controller,trials:runs.length,successRate:runs.filter(x=>x.success).length/runs.length,collisionRate:runs.filter(x=>x.collisions>0).length/runs.length,avgPathLength:avg(runs,'pathLength'),avgSimTimeSec:avg(runs,'simTimeSec'),avgControlTicks:avg(runs,'controlTicks'),avgCTE:avg(runs,'meanCrossTrackError'),avgFailures:avg(runs,'failures'),avgRecoveries:avg(runs,'recoveries')}}
async function runBatch(){if(batchRunning||running)return;if(demoRecorder?.status?.().active)stopDemoRecording(true);batchRunning=true;$('#batchBtn').disabled=true;const scenariosN=Math.max(1,Math.min(50,Number($('#benchmarkScenarios').value)||8)),seed=$('#benchmarkSeed').value||'42',lookahead=Math.max(20,Math.min(120,Number($('#lookaheadInput').value)||55)),pid={...store.state.simulation.pid},controllers=['pure_pursuit','rule_waypoint','pid_path'],scenarios=generateScenarios(seed,scenariosN),rows=[],details=[];log('planner',`Benchmark start: seed=${seed}, scenarios=${scenariosN}, controllers=${controllers.length}`);for(const controller of controllers){const runs=[];for(let i=0;i<scenarios.length;i++){const scenario=scenarios[i],task=taskTextForScenario(scenario);const result=await runBatchTrial(task,controller,lookahead,pid,scenario);runs.push(result);details.push({controller,scenario,result});$('#batchState').textContent=`${controller}: ${i+1}/${scenarios.length} — ${scenario.id}`;await new Promise(r=>setTimeout(r,0))}rows.push(summarize(controller,runs))}lastBenchmark={version:'v2.4',seed:String(seed),scenarioCount:scenariosN,lookahead,pid,vehicleModel:store.state.simulation.vehicleModel,learning:buildLearningEpisodeMetadata(),generatedAt:new Date().toISOString(),summary:rows,details};$('#batchState').textContent=JSON.stringify(lastBenchmark.summary,null,2);store.reset();store.state.simulation.lookaheadDistance=lookahead;store.state.simulation.pid={...pid};store.emit();log('success','Benchmark complete');$('#batchBtn').disabled=false;batchRunning=false}

function downloadText(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function exportBenchmarkJson(){if(!lastBenchmark){log('error','No benchmark result');return}downloadText(JSON.stringify(lastBenchmark,null,2),`forklift_benchmark_${lastBenchmark.seed}.json`,'application/json');log('success','Benchmark JSON exported')}
function exportBenchmarkCsv(){if(!lastBenchmark){log('error','No benchmark result');return}const cols=['controller','trials','successRate','collisionRate','avgPathLength','avgSimTimeSec','avgControlTicks','avgCTE','avgFailures','avgRecoveries'];const csv=[cols.join(','),...lastBenchmark.summary.map(r=>cols.map(c=>r[c]??'').join(','))].join('\n');downloadText(csv,`forklift_benchmark_${lastBenchmark.seed}.csv`,'text/csv');log('success','Benchmark CSV exported')}
function setFailure(path,value,label){if(path==='obstacle')store.state.obstacle.enabled=value;else store.state.failures[path]=value;store.emit();log('planner',`${label}: ${value?'ON':'OFF'}`)}
function setPid(key,value){const n=Number(value);if(!Number.isFinite(n))return;store.state.simulation.pid[key]=n;store.emit();log('planner',`PID ${key} → ${n}`)}
function downloadEpisode(){const data=episodes.exportLatest();if(!data){log('error','No episode to export');return;}downloadText(data,`forklift_episode_${Date.now()}.json`,'application/json');log('success','Episode JSON exported')}
function diagnosticBundle(){const s=store.state,ep=episodes.current||episodes.completed.at(-1);return[
  'Forklift Agent Lab diagnostic',
  `version: v2.4`,
  `task_status: ${s.task.status}`,
  `agent_status: ${s.agent.status}`,
  `controller: ${s.simulation.controller}`,
  `demo_recorder: ${demoRecorder?.status?.().active?`${demoSkillId}:${demoRecorder.status().samples}`:'idle'}`,
  `last_failure: ${s.agent.lastResult?.ok===false?s.agent.lastResult.reason:'none'}`,
  '',
  '=== EPISODE ===',JSON.stringify(ep?{id:ep.id,status:ep.status||'running',meta:ep.meta,metrics:ep.metrics}:null,null,2),
  '',
  '=== AGENT LOG ===',$('#log').innerText||'(empty)',
  '',
  '=== AGENT STATE ===',$('#agentState').innerText,
  '',
  '=== ROBOT STATE ===',$('#robotState').innerText
].join('\n')}

$('#planBtn').onclick=makePlan;$('#stepBtn').onclick=step;$('#runBtn').onclick=run;$('#batchBtn').onclick=runBatch;$('#benchmarkJsonBtn').onclick=exportBenchmarkJson;$('#benchmarkCsvBtn').onclick=exportBenchmarkCsv;
$('#demoRecordBtn').onclick=startDemoRecording;$('#demoStopBtn').onclick=()=>stopDemoRecording(true);$('#demoDiscardBtn').onclick=()=>stopDemoRecording(false);
$('#resetBtn').onclick=()=>{running=false;stopManualHold();if(demoRecorder?.status?.().active)stopDemoRecording(true);if(episodes.current)episodes.finish(false,'reset');store.reset();renderMetrics();log('planner','System reset')};
$('#clearLogBtn').onclick=()=>$('#log').innerHTML='';$('#downloadEpisodeBtn').onclick=downloadEpisode;$('#copyDebugBtn').onclick=()=>copyText(diagnosticBundle());
document.querySelectorAll('[data-copy-target]').forEach(btn=>btn.onclick=()=>{const el=document.getElementById(btn.dataset.copyTarget);copyText(el?.innerText||el?.textContent||'')});
$('#controllerSelect').onchange=e=>{store.state.simulation.controller=e.target.value;store.emit();log('planner',`Controller → ${e.target.value}`)};
$('#lookaheadInput').onchange=e=>{store.state.simulation.lookaheadDistance=Math.max(20,Math.min(120,Number(e.target.value)||55));store.emit();log('planner',`Lookahead → ${store.state.simulation.lookaheadDistance}`)};
$('#pidKp').onchange=e=>setPid('kp',e.target.value);$('#pidKi').onchange=e=>setPid('ki',e.target.value);$('#pidKd').onchange=e=>setPid('kd',e.target.value);$('#pidCte').onchange=e=>setPid('cteGain',e.target.value);
$('#obstacleToggle').onchange=e=>setFailure('obstacle',e.target.checked,'Obstacle');$('#detectFailToggle').onchange=e=>setFailure('forceDetectionFailure',e.target.checked,'Detection failure');$('#alignFailToggle').onchange=e=>setFailure('forceAlignmentFailure',e.target.checked,'Alignment failure');$('#insertFailToggle').onchange=e=>setFailure('forceInsertionFailure',e.target.checked,'Insertion failure');
initDemoRecorderUi();installManualControls();
log('planner','Ready: v2.4 Skill Learning Framework + Demonstration Recorder');