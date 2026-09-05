export const SKILL_LEARNING_REGISTRY=[
  {id:'navigate_to_pallet',order:1,label:'移動',code:'NavigateToPallet',desc:'パレット付近まで移動',group:'motion',defaultPolicy:'Pure Pursuit / PID',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:false,note:'長距離経路追従。現在は古典Controllerが実行本体。学習Policy差し替え口を用意済み。'},
  {id:'detect_pallet',order:2,label:'検出',code:'DetectPallet',desc:'パレットを検出',group:'perception',defaultPolicy:'Rule perception',learning:'Detector / VLM',trainable:false,runtimeLearning:false,note:'画像入力がまだ無いため現シミュレータでは教師データを作れません。Camera導入後に学習対象化。'},
  {id:'align_to_pallet',order:3,label:'位置合せ',code:'AlignToPallet',desc:'フォーク位置へ精密位置合わせ',group:'motion',defaultPolicy:'Rule staged docking',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:true,note:'現在の学習実装対象。学習済みBCモデルを実行時に利用できます。'},
  {id:'insert_forks',order:4,label:'差込み',code:'InsertForks',desc:'フォークを差し込む',group:'manipulation',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'現在のSimulatorでは差込みが瞬時状態遷移のため学習対象にする物理自由度がありません。'},
  {id:'lift',order:5,label:'持上げ',code:'Lift',desc:'パレットを持ち上げる',group:'manipulation',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'現在はFork ON/OFFの決定論的Skill。高さ・荷重制御を追加後に学習対象化。'},
  {id:'navigate_to',order:6,label:'搬送',code:'Transport',desc:'目的地まで搬送',group:'motion',defaultPolicy:'Pure Pursuit / PID',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:false,note:'長距離経路追従。現在は古典Controllerが実行本体。学習Policy差し替え口を用意済み。'},
  {id:'place',order:7,label:'設置',code:'Place',desc:'目的地へ設置',group:'manipulation',defaultPolicy:'Rule',learning:'BC / ACT',trainable:false,runtimeLearning:false,note:'現在は瞬時設置。フォーク降下・離脱を物理化した後に学習対象化。'},
  {id:'retreat',order:8,label:'退避',code:'Retreat',desc:'パレットから離れる',group:'motion',defaultPolicy:'Rule reverse',learning:'Behavior Cloning / SAC',trainable:true,runtimeLearning:false,note:'連続制御Skill。共通学習管理対象。実行Policy差し替えは次の段階。'}
];

const MODEL_PREFIX='forklift_skill_model_v1:';
const DATASET_PREFIX='forklift_skill_dataset_meta_v1:';
const POLICY_PREFIX='forklift_skill_policy_v1:';
const EVAL_PREFIX='forklift_skill_evaluation_v1:';
const LEGACY_ALIGN='forklift_bc_align_v1';

export function getSkillDefinition(id){return SKILL_LEARNING_REGISTRY.find(s=>s.id===id)||null}
export function modelKey(id){return `${MODEL_PREFIX}${id}`}
export function datasetKey(id){return `${DATASET_PREFIX}${id}`}
export function policyKey(id){return `${POLICY_PREFIX}${id}`}
export function evaluationKey(id){return `${EVAL_PREFIX}${id}`}
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
export function saveDatasetMeta(id,meta){return write(datasetKey(id),{...meta,skillId:id})}
export function loadSkillEvaluation(id){return read(evaluationKey(id))}
export function saveSkillEvaluation(id,result){return write(evaluationKey(id),{...result,skillId:id})}
export function clearSkillEvaluation(id){localStorage.removeItem(evaluationKey(id))}
export function selectedPolicy(id){
  const v=localStorage.getItem(policyKey(id));
  if(v)return v;
  if(id==='align_to_pallet'&&loadSkillModel(id))return 'learned';
  return 'classic';
}
export function setSelectedPolicy(id,policy){localStorage.setItem(policyKey(id),policy)}
export function skillLearningState(id){
  const def=getSkillDefinition(id),model=loadSkillModel(id),dataset=loadDatasetMeta(id),policy=selectedPolicy(id),evaluation=loadSkillEvaluation(id);
  return{definition:def,model,dataset,policy,evaluation,trained:!!model,trainable:!!def?.trainable,runtimeLearning:!!def?.runtimeLearning};
}
export function learningSummary(){return SKILL_LEARNING_REGISTRY.map(s=>skillLearningState(s.id))}
