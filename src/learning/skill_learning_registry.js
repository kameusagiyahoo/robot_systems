export const SKILL_LEARNING_REGISTRY=[
  {id:'navigate_to_pallet',order:1,label:'移動',code:'NavigateToPallet',desc:'パレット付近まで移動',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Pure Pursuit / PID',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'長距離経路追従。Classic Controllerと学習済みBC Policyを切り替えて実行・評価できます。'},
  {id:'detect_pallet',order:2,label:'検出',code:'DetectPallet',desc:'パレットを検出',group:'perception',learningPlugin:'perception_future',defaultPolicy:'Rule perception',learning:'Detector / VLM',trainable:false,runtimeLearning:false,note:'画像入力がまだ無いため現シミュレータでは教師データを作れません。Camera導入後に学習対象化。'},
  {id:'align_to_pallet',order:3,label:'位置合せ',code:'AlignToPallet',desc:'フォーク位置へ精密位置合わせ',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Rule staged docking',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'精密位置合わせ。Classic staged dockingと学習済みBC Policyを切り替えて実行・評価できます。'},
  {id:'insert_forks',order:4,label:'差込み',code:'InsertForks',desc:'フォークを差し込む',group:'manipulation',learningPlugin:'manipulation_future',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'現在のSimulatorでは差込みが瞬時状態遷移のため学習対象にする物理自由度がありません。'},
  {id:'lift',order:5,label:'持上げ',code:'Lift',desc:'パレットを持ち上げる',group:'manipulation',learningPlugin:'manipulation_future',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'現在はFork ON/OFFの決定論的Skill。高さ・荷重制御を追加後に学習対象化。'},
  {id:'navigate_to',order:6,label:'搬送',code:'Transport',desc:'目的地まで搬送',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Pure Pursuit / PID',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'搬送経路追従。Classic Controllerと学習済みBC Policyを切り替えて実行・評価できます。'},
  {id:'place',order:7,label:'設置',code:'Place',desc:'目的地へ設置',group:'manipulation',learningPlugin:'manipulation_future',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'現在は瞬時設置。フォーク降下・離脱を物理化した後に学習対象化。'},
  {id:'retreat',order:8,label:'退避',code:'Retreat',desc:'パレットから離れる',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Rule reverse',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'後退の連続制御。Classic reverseと学習済みBC Policyを切り替えて実行・評価できます。'}
];

const MODEL_PREFIX='forklift_skill_model_v1:';
const DATASET_PREFIX='forklift_skill_dataset_meta_v1:';
const POLICY_PREFIX='forklift_skill_policy_v1:';
const EVAL_PREFIX='forklift_skill_evaluation_v1:';
const EVAL_HISTORY_PREFIX='forklift_skill_evaluation_history_v1:';
const LEGACY_ALIGN='forklift_bc_align_v1';

export function getSkillDefinition(id){return SKILL_LEARNING_REGISTRY.find(s=>s.id===id)||null}
export function modelKey(id){return `${MODEL_PREFIX}${id}`}
export function datasetKey(id){return `${DATASET_PREFIX}${id}`}
export function policyKey(id){return `${POLICY_PREFIX}${id}`}
export function evaluationKey(id){return `${EVAL_PREFIX}${id}`}
export function evaluationHistoryKey(id){return `${EVAL_HISTORY_PREFIX}${id}`}
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));return value}

export function loadSkillModel(id){
  const current=read(modelKey(id));
  if(current)return current;
  if(id==='align_to_pallet'){
    const legacy=read(LEGACY_ALIGN);
    if(legacy){const migrated={...legacy,skillId:id,algorithm:'behavior_cloning',migratedFrom:LEGACY_ALIGN};write(modelKey(id),migrated);return migrated}
  }
  return null;
}
export function saveSkillModel(id,model){return write(modelKey(id),{...model,skillId:id})}
export function clearSkillModel(id){localStorage.removeItem(modelKey(id));if(id==='align_to_pallet')localStorage.removeItem(LEGACY_ALIGN)}
export function loadDatasetMeta(id){return read(datasetKey(id))}
export function saveDatasetMeta(id,meta){
  const previous=read(datasetKey(id)),sameKind=previous&&previous.kind&&previous.kind===meta?.kind;
  return write(datasetKey(id),{...(sameKind?previous:{}),...meta,skillId:id});
}
export function loadSkillEvaluation(id){return read(evaluationKey(id))}
export function loadSkillEvaluationHistory(id){const v=read(evaluationHistoryKey(id));return Array.isArray(v)?v:[]}
export function saveSkillEvaluation(id,result){
  const record={...result,skillId:id};
  write(evaluationKey(id),record);
  const history=loadSkillEvaluationHistory(id);
  history.push(record);
  write(evaluationHistoryKey(id),history.slice(-100));
  return record;
}
export function replaceSkillEvaluationHistory(id,records=[]){
  const history=(Array.isArray(records)?records:[]).map(r=>({...r,skillId:id})).slice(-100);
  write(evaluationHistoryKey(id),history);
  if(history.length)write(evaluationKey(id),history[history.length-1]);else localStorage.removeItem(evaluationKey(id));
  return history;
}
export function clearSkillEvaluation(id){localStorage.removeItem(evaluationKey(id));localStorage.removeItem(evaluationHistoryKey(id))}
export function latestEvaluationForPolicy(id,policy,controller=null){
  const history=loadSkillEvaluationHistory(id);
  for(let i=history.length-1;i>=0;i--){const e=history[i];if(e.policy===policy&&(!controller||e.controller===controller))return e}
  const latest=loadSkillEvaluation(id);
  return latest?.policy===policy&&(!controller||latest.controller===controller)?latest:null;
}
export function selectedPolicy(id){
  const v=localStorage.getItem(policyKey(id));
  if(v)return v;
  if(id==='align_to_pallet'&&loadSkillModel(id))return 'learned';
  return 'classic';
}
export function setSelectedPolicy(id,policy){localStorage.setItem(policyKey(id),policy)}
export function skillLearningState(id){
  const def=getSkillDefinition(id),model=loadSkillModel(id),dataset=loadDatasetMeta(id),policy=selectedPolicy(id),evaluation=loadSkillEvaluation(id),evaluationHistory=loadSkillEvaluationHistory(id);
  return{definition:def,model,dataset,policy,evaluation,evaluationHistory,trained:!!model,trainable:!!def?.trainable,runtimeLearning:!!def?.runtimeLearning,learningPlugin:def?.learningPlugin||null};
}
export function learningSummary(){return SKILL_LEARNING_REGISTRY.map(s=>skillLearningState(s.id))}
