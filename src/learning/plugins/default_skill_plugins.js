import {SkillLearningPlugin,DescriptorOnlyLearningPlugin} from '../framework/skill_learning_plugin.js';
import {registerLearningPlugin} from '../framework/plugin_registry.js';
import {BehaviorCloningSkill,generateSkillDemos} from '../behavior_cloning_skill.js';
import {BehaviorCloningAlign,generateSyntheticDemos} from '../behavior_cloning_align.js';
import {saveDatasetMeta,saveSkillModel} from '../skill_learning_registry.js';

const MOTION_SKILLS=['navigate_to_pallet','align_to_pallet','navigate_to','retreat'];
const metric=(key,label,format='number',unit='')=>({key,label,format,unit});

function datasetSummary(samples){
  const keys=['dx','dy','yawError','speed','steeringAngle'],features={};
  for(const key of keys){
    const values=samples.map(s=>Number(s.obs?.[key])).filter(Number.isFinite);
    if(!values.length)continue;
    features[key]={min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length};
  }
  const step=Math.max(1,Math.floor(samples.length/120)),preview=[];
  for(let i=0;i<samples.length&&preview.length<120;i+=step){const o=samples[i].obs;preview.push({dx:o.dx,dy:o.dy,yawError:o.yawError})}
  return{features,preview};
}

class MotionBehaviorCloningPlugin extends SkillLearningPlugin{
  constructor(){super({id:'motion_bc',label:'Motion Behavior Cloning',version:1})}
  supports(skillId){return MOTION_SKILLS.includes(skillId)}
  getCapabilities(){return{trainable:true,evaluable:true,runtimeLearning:true,policies:['classic','learned']}}
  getAlgorithms(){return[{id:'behavior_cloning',label:'Behavior Cloning',kind:'imitation'}]}
  getDatasetSchema(skillId){return{type:'observation_action',skillId,observation:['dx','dy','yawError','speed','steeringAngle'],action:['speed','steeringAngle'],generator:'synthetic_expert'}}
  getTrainingParameters(){return[
    {key:'samples',label:'Samples',type:'number',default:2500,min:200,max:10000,step:100},
    {key:'seed',label:'Seed',type:'number',default:42,step:1}
  ]}
  getEvaluationParameters(){return[
    {key:'trials',label:'Trials',type:'number',default:20,min:1,max:100,step:1},
    {key:'seed',label:'Seed',type:'number',default:42,step:1},
    {key:'controller',label:'Classic Controller',type:'select',default:'pure_pursuit',options:[['pure_pursuit','Pure Pursuit'],['rule_waypoint','Rule Waypoint'],['pid_path','PID Path']]}
  ]}
  getEvaluationMetrics(skillId){
    const common=[metric('successRate','成功率','percent'),metric('collisionRate','衝突率','percent'),metric('avgControlTicks','平均制御Step','integer'),metric('avgFinalError','最終位置誤差','number','px')];
    if(skillId==='align_to_pallet')common.push(metric('avgYawError','姿勢誤差','number','°'));
    if(skillId==='navigate_to_pallet'||skillId==='navigate_to')common.push(metric('avgPathLength','平均走行距離','number','px'));
    return common;
  }
  getVisualizations(){return[
    {id:'training_loss',type:'loss_curve',title:'学習Loss',source:'model.lossHistory'},
    {id:'dataset_distribution',type:'dataset_distribution',title:'学習データ分布',source:'dataset.featureSummary'},
    {id:'policy_comparison',type:'policy_comparison',title:'Classic vs Learned',source:'evaluationHistory'}
  ]}
  getNote(skillId){return`${skillId} 用の連続制御学習Plugin。Dataset / Training / Evaluation / VisualizationはPlugin側で定義します。`}
  async train(skillId,{samples=2500,seed=42,onProgress=null}={}){
    if(!this.supports(skillId))throw new Error(`unsupported_skill_for_plugin:${skillId}`);
    const count=Math.max(200,Math.min(10000,Number(samples)||2500)),fixedSeed=Number(seed)||42;
    onProgress?.({phase:'dataset',label:'教師データ生成中'});
    const demos=skillId==='align_to_pallet'?generateSyntheticDemos(count,fixedSeed):generateSkillDemos(skillId,count,fixedSeed);
    const summary=datasetSummary(demos);
    const dataset=saveDatasetMeta(skillId,{kind:'synthetic_expert',samples:demos.length,seed:fixedSeed,generatedAt:new Date().toISOString(),pluginId:this.id,algorithm:'behavior_cloning',featureSummary:summary.features,preview:summary.preview});
    onProgress?.({phase:'training',label:'Behavior Cloning 学習中',progress:0});
    let model;
    const onEpoch=(point,meta)=>onProgress?.({phase:'training',label:'Behavior Cloning 学習中',progress:point.epoch/meta.epochs,point});
    if(skillId==='align_to_pallet'){
      const bc=new BehaviorCloningAlign();model=bc.train(demos,{onEpoch});model=saveSkillModel(skillId,{...model,algorithm:'behavior_cloning',pluginId:this.id});
    }else{const bc=new BehaviorCloningSkill(skillId);model=bc.train(demos,{onEpoch})}
    onProgress?.({phase:'done',label:'学習完了',progress:1});
    return{model,dataset,pluginId:this.id};
  }
}

const perceptionPlugin=new DescriptorOnlyLearningPlugin({
  id:'perception_future',label:'Perception Learning Adapter',skills:['detect_pallet'],
  descriptor:{
    capabilities:{trainable:false,evaluable:true,runtimeLearning:false,policies:['classic']},
    algorithms:[{id:'detector',label:'Detector / Segmentation / VLM',kind:'perception'}],
    datasetSchema:{type:'image_annotation',observation:['rgb','depth?'],target:['bbox','mask','keypoints','pose']},
    trainingParameters:[],
    evaluationParameters:[{key:'trials',label:'Trials',type:'number',default:20,min:1,max:100,step:1},{key:'seed',label:'Seed',type:'number',default:42,step:1}],
    evaluationMetrics:[metric('successRate','検出成功率','percent'),metric('avgControlTicks','処理Step','integer')],
    visualizations:[{id:'detection_examples',type:'capability_note',title:'将来の可視化',text:'検出画像 / PR Curve / Confusion Matrix / Pose Error'}],
    note:'Camera観測を追加したときに、画像Dataset・Detector/VLM学習・知覚評価をこのPluginへ実装します。'
  }
});

const manipulationPlugin=new DescriptorOnlyLearningPlugin({
  id:'manipulation_future',label:'Manipulation Learning Adapter',skills:['insert_forks','lift','place'],
  descriptor:{
    capabilities:{trainable:false,evaluable:true,runtimeLearning:false,policies:['classic']},
    algorithms:[{id:'sequence_policy',label:'BC / ACT / Diffusion Policy / RL',kind:'manipulation'}],
    datasetSchema:{type:'trajectory',observation:['robot_state','fork_state','camera?','depth?'],action:['fork','speed','steering']},
    trainingParameters:[],
    evaluationParameters:[{key:'trials',label:'Trials',type:'number',default:20,min:1,max:100,step:1},{key:'seed',label:'Seed',type:'number',default:42,step:1}],
    evaluationMetrics:[metric('successRate','成功率','percent'),metric('avgControlTicks','平均制御Step','integer')],
    visualizations:[{id:'manipulation_future',type:'capability_note',title:'将来の可視化',text:'Action系列 / 接触位置 / 3D軌跡 / 成功・失敗リプレイ'}],
    note:'現在のSimulatorでは操作が瞬時状態遷移です。物理自由度を追加後、このPluginを具体実装へ差し替えます。'
  }
});

registerLearningPlugin(new MotionBehaviorCloningPlugin(),{skills:MOTION_SKILLS});
registerLearningPlugin(perceptionPlugin,{skills:['detect_pallet']});
registerLearningPlugin(manipulationPlugin,{skills:['insert_forks','lift','place']});
