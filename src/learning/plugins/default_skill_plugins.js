import {SkillLearningPlugin,DescriptorOnlyLearningPlugin} from '../framework/skill_learning_plugin.js';
import {registerLearningPlugin} from '../framework/plugin_registry.js';
import {saveDatasetMeta,saveSkillModel,loadDatasetMeta} from '../skill_learning_registry.js';
import {identifySkillModel} from '../framework/model_identity.js';
import {MotionBehaviorCloningRuntimeAdapter} from './motion_bc_runtime.js';
import {motionScenarioAdapter,perceptionScenarioAdapter,manipulationScenarioAdapter} from './forklift_evaluation_scenarios.js';
import {MotionDatasetAdapter} from './motion_dataset_adapter.js';
import {MotionBcTrainingBackend} from './motion_bc_training_backend.js';
import {MotionDemonstrationRecorderAdapter} from './motion_demonstration_recorder.js';
import {motionSkillIOAdapter} from './motion_skill_io_adapter.js';

const MOTION_SKILLS=['navigate_to_pallet','align_to_pallet','navigate_to','retreat'];
const metric=(key,label,format='number',unit='',extra={})=>({key,label,format,unit,...extra});
const successMetric=()=>metric('successRate','成功率','percent','',{primary:true,better:'higher',goodThreshold:.8});
const motionDatasetAdapter=new MotionDatasetAdapter(),motionTrainingBackend=new MotionBcTrainingBackend(),motionRuntimeAdapter=new MotionBehaviorCloningRuntimeAdapter(motionSkillIOAdapter),motionDemoRecorder=new MotionDemonstrationRecorderAdapter(motionDatasetAdapter,motionSkillIOAdapter);

class MotionBehaviorCloningPlugin extends SkillLearningPlugin{
  constructor(){super({id:'motion_bc',label:'Motion Behavior Cloning',version:8})}
  supports(skillId){return MOTION_SKILLS.includes(skillId)}
  getCapabilities(){return{trainable:true,evaluable:true,runtimeLearning:true,demonstrationRecording:true,episodicDataset:true,validationSplit:true,environmentIndependentIO:true,policies:['classic','learned']}}
  getAlgorithms(){return[{id:'behavior_cloning',label:'Behavior Cloning',kind:'imitation'}]}
  getDatasetSchema(skillId){return{type:'episodic_observation_action',skillId,space:'canonical_normalized',observationSpaceId:motionSkillIOAdapter.observationSpaceId,actionSpaceId:motionSkillIOAdapter.actionSpaceId,episode:['outcome','quality','note','sourceEnvironment','skillIO'],observation:['forward','lateral','yawSin','yawCos','speed','steering'],action:['speed','steering']}}
  getSkillIOAdapter(){return motionSkillIOAdapter}
  getDatasetAdapter(){return motionDatasetAdapter}
  getDemonstrationRecorderAdapter(){return motionDemoRecorder}
  getTrainingBackend(){return motionTrainingBackend}
  getTrainingParameters(){return[
    {key:'datasetSource',label:'Dataset',type:'select',default:'synthetic_expert',options:[['synthetic_expert','Synthetic Expert (Canonical)'],['manual_import','Manual / Recorded Demo (Canonical)']]},
    {key:'demoFilter',label:'Demo Filter',type:'select',default:'all',options:[['all','All Episodes'],['success_only','Success only'],['good_or_ok','Quality: Good / OK']]},
    {key:'validationRatio',label:'Validation Ratio',type:'number',default:.2,min:0,max:.5,step:.05},
    {key:'samples',label:'Samples',type:'number',default:2500,min:200,max:10000,step:100},
    {key:'seed',label:'Seed',type:'number',default:42,step:1},
    {key:'epochs',label:'Epochs',type:'number',default:700,min:50,max:2000,step:50},
    {key:'timeoutSec',label:'Timeout (sec)',type:'number',default:60,min:10,max:300,step:10}
  ]}
  getEvaluationParameters(){return[{key:'trials',label:'Trials',type:'number',default:20,min:1,max:100,step:1},{key:'seed',label:'Seed',type:'number',default:42,step:1},{key:'controller',label:'Classic Controller',type:'select',default:'pure_pursuit',options:[['pure_pursuit','Pure Pursuit'],['rule_waypoint','Rule Waypoint'],['pid_path','PID Path']]}]}
  getEvaluationMetrics(skillId){const common=[successMetric(),metric('collisionRate','衝突率','percent','',{better:'lower'}),metric('avgControlTicks','平均制御Step','integer','',{better:'lower'}),metric('avgFinalError','最終位置誤差','number','env-unit',{better:'lower'})];if(skillId==='align_to_pallet')common.push(metric('avgYawError','姿勢誤差','number','°',{better:'lower'}));if(skillId==='navigate_to_pallet'||skillId==='navigate_to')common.push(metric('avgPathLength','平均走行距離','number','env-unit',{better:'lower'}));return common}
  getVisualizations(){return[{id:'training_loss',type:'loss_curve',title:'Train / Validation Loss',source:'model.lossHistory'},{id:'dataset_distribution',type:'dataset_distribution',title:'Canonical学習データ分布',source:'dataset.featureSummary'},{id:'policy_comparison',type:'policy_comparison',title:'Classic vs Learned',source:'evaluationHistory',metric:'successRate',format:'percent',better:'higher'}]}
  getRuntimePolicyAdapter(){return motionRuntimeAdapter}
  getEvaluationScenarioAdapter(){return motionScenarioAdapter}
  getNote(skillId){return`${skillId} 用の連続制御学習Plugin。Environment固有単位は Skill I/O Adapter で正規化し、ModelはCanonical Observation/Action Spaceのみを扱います。`}
  async train(skillId,{datasetSource='synthetic_expert',samples=2500,seed=42,epochs=null,timeoutSec=60,validationRatio=.2,demoFilter='all',onProgress=null,signal=null}={}){
    if(!this.supports(skillId))throw new Error(`unsupported_skill_for_plugin:${skillId}`);
    const previousDataset=loadDatasetMeta(skillId),datasetRequest=await motionDatasetAdapter.buildTrainingDataset(skillId,{source:datasetSource,samples,seed,validationRatio,demoFilter});onProgress?.({phase:'backend',label:'Web Workerを起動中',progress:0});
    const trained=await motionTrainingBackend.train(skillId,{samples:datasetSource==='synthetic_expert'?datasetRequest.requestedSamples:datasetRequest.samples?.length,seed:datasetRequest.seed,epochs,trainSamples:datasetRequest.trainSamples,validationSamples:datasetRequest.validationSamples,validationRatio:datasetRequest.validationRatio,splitMeta:datasetRequest.split,onProgress,signal,timeoutMs:Math.max(10000,Number(timeoutSec||60)*1000)});
    const io=motionSkillIOAdapter.describe(skillId),identified=await identifySkillModel(skillId,{...trained.model,pluginId:this.id,pluginVersion:this.version,skillIOAdapterId:io.id,skillIOAdapterVersion:io.version,observationSpaceId:io.observationSpaceId,actionSpaceId:io.actionSpaceId,normalizationFamily:io.normalizationFamily,trainingBackendId:trained.backend?.id||motionTrainingBackend.id,trainingBackendVersion:trained.backend?.version||motionTrainingBackend.version,datasetSource,datasetKind:previousDataset?.kind||datasetSource,demoFilter,validationRatio,split:trained.dataset.split||datasetRequest.split});
    const model=saveSkillModel(skillId,identified),episodeSummary=motionDatasetAdapter.episodeSummary(skillId),manualOrigin=datasetSource==='manual_import'&&['manual_recorded','manual_import'].includes(previousDataset?.kind),kind=datasetSource==='synthetic_expert'?'synthetic_expert':(manualOrigin?previousDataset.kind:'manual_import');
    const dataset=saveDatasetMeta(skillId,{...(manualOrigin?previousDataset:{}),kind,datasetSource,samples:trained.dataset.samples,trainSamples:trained.dataset.trainSamples,validationSamples:trained.dataset.validationSamples,seed:datasetRequest.seed,generatedAt:new Date().toISOString(),pluginId:this.id,skillIOAdapterId:io.id,skillIOAdapterVersion:io.version,observationSpaceId:io.observationSpaceId,actionSpaceId:io.actionSpaceId,normalizationFamily:io.normalizationFamily,datasetAdapterId:motionDatasetAdapter.id,datasetAdapterVersion:motionDatasetAdapter.version,demonstrationRecorderAdapterId:previousDataset?.demonstrationRecorderAdapterId||motionDemoRecorder.id,demonstrationRecorderAdapterVersion:previousDataset?.demonstrationRecorderAdapterVersion||motionDemoRecorder.version,algorithm:'behavior_cloning',demoFilter,validationRatio,split:trained.dataset.split||datasetRequest.split,episodes:episodeSummary.episodes,episodeSummary,featureSummary:trained.dataset.featureSummary,preview:trained.dataset.preview});
    onProgress?.({phase:'done',label:'学習完了',progress:1});return{model,dataset,pluginId:this.id,trainingBackend:trained.backend,skillIO:io};
  }
}

const perceptionPlugin=new DescriptorOnlyLearningPlugin({id:'perception_future',label:'Perception Learning Adapter',version:8,skills:['detect_pallet'],descriptor:{capabilities:{trainable:false,evaluable:true,runtimeLearning:false,demonstrationRecording:false,policies:['classic']},algorithms:[{id:'detector',label:'Detector / Segmentation / VLM',kind:'perception'}],datasetSchema:{type:'image_annotation',observation:['rgb','depth?'],target:['bbox','mask','keypoints','pose']},trainingParameters:[],evaluationParameters:[{key:'trials',label:'Trials',type:'number',default:20,min:1,max:100,step:1},{key:'seed',label:'Seed',type:'number',default:42,step:1}],evaluationMetrics:[successMetric(),metric('avgControlTicks','処理Step','integer','',{better:'lower'})],evaluationScenarioAdapter:perceptionScenarioAdapter,visualizations:[{id:'detection_examples',type:'capability_note',title:'将来の可視化',text:'検出画像 / PR Curve / Confusion Matrix / Pose Error'}],note:'Camera観測を追加したときに、画像Dataset・Annotation Recorder・Perception I/O Adapter・Detector/VLM学習・知覚Runtimeへ差し替えます。'}});
const manipulationPlugin=new DescriptorOnlyLearningPlugin({id:'manipulation_future',label:'Manipulation Learning Adapter',version:8,skills:['insert_forks','lift','place'],descriptor:{capabilities:{trainable:false,evaluable:true,runtimeLearning:false,demonstrationRecording:false,policies:['classic']},algorithms:[{id:'sequence_policy',label:'BC / ACT / Diffusion Policy / RL',kind:'manipulation'}],datasetSchema:{type:'trajectory',observation:['robot_state','fork_state','camera?','depth?'],action:['fork','speed','steering']},trainingParameters:[],evaluationParameters:[{key:'trials',label:'Trials',type:'number',default:20,min:1,max:100,step:1},{key:'seed',label:'Seed',type:'number',default:42,step:1}],evaluationMetrics:[successMetric(),metric('avgControlTicks','平均制御Step','integer','',{better:'lower'})],evaluationScenarioAdapter:manipulationScenarioAdapter,visualizations:[{id:'manipulation_future',type:'capability_note',title:'将来の可視化',text:'Action系列 / 接触位置 / 3D軌跡 / 成功・失敗リプレイ'}],note:'現在の2D Smoke Testでは操作が瞬時状態遷移です。高忠実度Environmentで物理自由度を追加後、Manipulation I/O Adapterを含め具体実装します。'}});

registerLearningPlugin(new MotionBehaviorCloningPlugin(),{skills:MOTION_SKILLS});registerLearningPlugin(perceptionPlugin,{skills:['detect_pallet']});registerLearningPlugin(manipulationPlugin,{skills:['insert_forks','lift','place']});
