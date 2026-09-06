export const SKILL_LEARNING_REGISTRY=[
  {id:'navigate_to_pallet',order:1,label:'移動',code:'NavigateToPallet',desc:'パレット付近まで移動',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Pure Pursuit / PID',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'長距離経路追従。Classic Controllerと学習済みPolicyを切り替えてEnvironment別に実行・評価できます。'},
  {id:'detect_pallet',order:2,label:'検出',code:'DetectPallet',desc:'パレットを検出',group:'perception',learningPlugin:'perception_future',defaultPolicy:'Rule perception',learning:'Detector / VLM',trainable:false,runtimeLearning:false,note:'高忠実度EnvironmentのCamera導入後に学習対象化。'},
  {id:'align_to_pallet',order:3,label:'位置合せ',code:'AlignToPallet',desc:'フォーク位置へ精密位置合わせ',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Rule staged docking',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'精密位置合わせ。Environment-independent I/Oを介してClassic/Learnedを比較します。'},
  {id:'insert_forks',order:4,label:'差込み',code:'InsertForks',desc:'フォークを差し込む',group:'manipulation',learningPlugin:'manipulation_future',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'Browser2Dは瞬時状態遷移。高忠実度Environmentで物理自由度を追加後に学習対象化。'},
  {id:'lift',order:5,label:'持上げ',code:'Lift',desc:'パレットを持ち上げる',group:'manipulation',learningPlugin:'manipulation_future',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'Browser2Dでは決定論的状態遷移。荷重・高さ制御があるEnvironmentで学習対象化。'},
  {id:'navigate_to',order:6,label:'搬送',code:'Transport',desc:'目的地まで搬送',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Pure Pursuit / PID',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'搬送経路追従。Environment-independent I/Oを介して実行・評価します。'},
  {id:'place',order:7,label:'設置',code:'Place',desc:'目的地へ設置',group:'manipulation',learningPlugin:'manipulation_future',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'Browser2Dでは瞬時設置。高忠実度Environmentで降下・接触・離脱を物理化後に学習対象化。'},
  {id:'retreat',order:8,label:'退避',code:'Retreat',desc:'パレットから離れる',group:'motion',learningPlugin:'motion_bc',defaultPolicy:'Rule reverse',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'後退の連続制御。Environment-independent I/Oを介して実行・評価します。'}
];

const MODEL_PREFIX='forklift_skill_model_v1:',DATASET_PREFIX='forklift_skill_dataset_meta_v1:',POLICY_PREFIX='forklift_skill_policy_v1:',EVAL_PREFIX='forklift_skill_evaluation_v1:',EVAL_HISTORY_PREFIX='forklift_skill_evaluation_history_v1:',LEGACY_ALIGN='forklift_bc_align_v1';
export function getSkillDefinition(id){return SKILL_LEARNING_REGISTRY.find(s=>s.id===id)||null}
export function modelKey(id){return`${MODEL_PREFIX}${id}`}
export function datasetKey(id){return`${DATASET_PREFIX}${id}`}
export function policyKey(id){return`${POLICY_PREFIX}${id}`}
export function evaluationKey(id){return`${EVAL_PREFIX}${id}`}
export function evaluationHistoryKey(id){return`${EVAL_HISTORY_PREFIX}${id}`}
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));return value}
export function loadSkillModel(id){const current=read(modelKey(id));if(current)return current;if(id==='align_to_pallet'){const legacy=read(LEGACY_ALIGN);if(legacy){const migrated={...legacy,skillId:id,algorithm:'behavior_cloning',migratedFrom:LEGACY_ALIGN};write(modelKey(id),migrated);return migrated}}return null}
export function saveSkillModel(id,model){return write(modelKey(id),{...model,skillId:id})}
export function clearSkillModel(id){localStorage.removeItem(modelKey(id));if(id==='align_to_pallet')localStorage.removeItem(LEGACY_ALIGN)}
export function loadDatasetMeta(id){return read(datasetKey(id))}
export function saveDatasetMeta(id,meta){const previous=read(datasetKey(id)),sameKind=previous&&previous.kind&&previous.kind===meta?.kind;return write(datasetKey(id),{...(sameKind?previous:{}),...meta,skillId:id})}
export function loadSkillEvaluation(id){return read(evaluationKey(id))}
export function loadSkillEvaluationHistory(id){const v=read(evaluationHistoryKey(id));return Array.isArray(v)?v:[]}
export function saveSkillEvaluation(id,result){const record={...result,skillId:id};write(evaluationKey(id),record);const history=loadSkillEvaluationHistory(id);history.push(record);write(evaluationHistoryKey(id),history.slice(-100));return record}
export function replaceSkillEvaluationHistory(id,records=[]){const history=(Array.isArray(records)?records:[]).map(r=>({...r,skillId:id})).slice(-100);write(evaluationHistoryKey(id),history);if(history.length)write(evaluationKey(id),history[history.length-1]);else localStorage.removeItem(evaluationKey(id));return history}
export function clearSkillEvaluation(id){localStorage.removeItem(evaluationKey(id));localStorage.removeItem(evaluationHistoryKey(id))}
export function latestEvaluationForPolicy(id,policy,controller=null,modelId=null,environmentId=null){
  const match=e=>e?.policy===policy&&(!controller||e.controller===controller)&&(!modelId||e.modelId===modelId)&&(!environmentId||e.environmentId===environmentId),history=loadSkillEvaluationHistory(id);for(let i=history.length-1;i>=0;i--)if(match(history[i]))return history[i];const latest=loadSkillEvaluation(id);return match(latest)?latest:null;
}
export function selectedPolicy(id){const v=localStorage.getItem(policyKey(id));if(v)return v;if(id==='align_to_pallet'&&loadSkillModel(id))return'learned';return'classic'}
export function setSelectedPolicy(id,policy){localStorage.setItem(policyKey(id),policy)}
export function skillLearningState(id){const def=getSkillDefinition(id),model=loadSkillModel(id),dataset=loadDatasetMeta(id),policy=selectedPolicy(id),evaluation=loadSkillEvaluation(id),evaluationHistory=loadSkillEvaluationHistory(id);return{definition:def,model,dataset,policy,evaluation,evaluationHistory,trained:!!model,trainable:!!def?.trainable,runtimeLearning:!!def?.runtimeLearning,learningPlugin:def?.learningPlugin||null}}
export function learningSummary(){return SKILL_LEARNING_REGISTRY.map(s=>skillLearningState(s.id))}
