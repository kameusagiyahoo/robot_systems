import {SkillDemonstrationRecorderAdapter} from '../framework/demonstration_recorder_adapter.js';
import {saveDatasetMeta} from '../skill_learning_registry.js';
import {motionSkillIOAdapter,MOTION_OBSERVATION_SPACE_ID,MOTION_ACTION_SPACE_ID} from './motion_skill_io_adapter.js';

const deg2rad=d=>d*Math.PI/180;
function services(environment){return environment?.getDomainServices?.()||{}}
function targetFor(skillId,state,environment){
  const svc=services(environment);
  if(skillId==='navigate_to_pallet'){const p=state.pallets?.pallet_A;if(!p)throw new Error('pallet_A_not_found');const path=typeof svc['path.palletApproach']==='function'?svc['path.palletApproach'](p):[{x:p.x-125,y:p.y}];const target=path.at(-1);return{target:{x:target.x,y:target.y},targetYaw:target.yaw??null}}
  if(skillId==='align_to_pallet'){const p=state.pallets?.pallet_A;if(!p)throw new Error('pallet_A_not_found');const target=typeof svc['target.palletDock']==='function'?svc['target.palletDock'](p):{x:p.x-82,y:p.y,yaw:0};return{target:{x:target.x,y:target.y},targetYaw:target.yaw??0}}
  if(skillId==='navigate_to'){const l=state.locations?.shipping;if(!l)throw new Error('shipping_not_found');const target=typeof svc['target.locationApproach']==='function'?svc['target.locationApproach'](l):{x:l.x-75,y:l.y};return{target:{x:target.x,y:target.y},targetYaw:target.yaw??null}}
  if(skillId==='retreat'){const r=state.robot,target=typeof svc['target.retreat']==='function'?svc['target.retreat'](r,70):(()=>{const a=deg2rad(r.yaw);return{x:r.x-Math.cos(a)*70,y:r.y-Math.sin(a)*70}})();return{target:{x:target.x,y:target.y},targetYaw:r.yaw,referenceYaw:r.yaw}}
  throw new Error(`unsupported_motion_demo_skill:${skillId}`);
}

export class MotionDemonstrationRecorderAdapter extends SkillDemonstrationRecorderAdapter{
  constructor(datasetAdapter,ioAdapter=motionSkillIOAdapter){super({id:'motion_manual_demo_recorder',label:'Motion Manual Demonstration Recorder',version:7});this.datasetAdapter=datasetAdapter;this.ioAdapter=ioAdapter;this.session=null}
  supports(skillId){return['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  getRecordableActions(){return['drive']}
  start(skillId,{store,environment=null,environmentDescriptor=null,replace=false}={}){
    if(!this.supports(skillId))throw new Error(`demo_recorder_unsupported_skill:${skillId}`);const state=environment?.getState?.()||store?.state;if(!state)throw new Error('demo_recorder_state_required');
    const targetContext=targetFor(skillId,state,environment),env=environmentDescriptor||environment?.describe?.()||null,profile=this.ioAdapter.profile(skillId,{environment,state});
    this.session={skillId,startedAt:new Date().toISOString(),samples:[],replace,targetContext,store,environment,environmentDescriptor:env,ioProfile:profile,startRobot:{x:state.robot.x,y:state.robot.y,yaw:state.robot.yaw}};return this.status();
  }
  record(skillId,action,{store,environment=null}={}){
    if(!this.session?.skillId||this.session.skillId!==skillId)return null;if(action?.type!=='drive')return null;if(!Number.isFinite(Number(action.speed))||!Number.isFinite(Number(action.steeringAngle)))return null;
    const runtimeEnvironment=environment||this.session.environment,state=runtimeEnvironment?.getState?.()||(store||this.session.store)?.state;if(!state)return null;
    const ioContext={environment:runtimeEnvironment,state,profile:this.session.ioProfile},obs=this.ioAdapter.encodeTargetObservation(skillId,state,this.session.targetContext,ioContext),encodedAction=this.ioAdapter.encodeAction(skillId,action,ioContext),sample={obs,action:encodedAction,space:{observation:MOTION_OBSERVATION_SPACE_ID,action:MOTION_ACTION_SPACE_ID}};
    this.session.samples.push(sample);return{sample,count:this.session.samples.length};
  }
  stop(skillId,{save=true,outcome='unlabeled',quality='unrated',note='',store=null}={}){
    if(!this.session||this.session.skillId!==skillId)return{saved:0,total:0,active:false};const session=this.session;this.session=null;if(!save)return{saved:0,total:session.samples.length,active:false,discarded:true};if(!session.samples.length)return{saved:0,total:this.datasetAdapter.loadManualSamples(skillId).length,active:false,empty:true};
    if(session.replace)this.datasetAdapter.clearManualSamples(skillId);const runtimeState=session.environment?.getState?.()||(store||session.store)?.state,endedAt=new Date().toISOString(),env=session.environmentDescriptor,sourceEnvironment=env?{id:env.id,version:env.version,fidelity:env.fidelity,stateContract:env.stateContract,coordinateFrame:env.coordinateFrame,units:env.units}:null;
    const episode=this.datasetAdapter.saveEpisode(skillId,{skillId,startedAt:session.startedAt,endedAt,outcome,quality,note,context:{targetContext:session.targetContext,startRobot:session.startRobot,endRobot:runtimeState?.robot?{x:runtimeState.robot.x,y:runtimeState.robot.y,yaw:runtimeState.robot.yaw}:null,sourceEnvironment,skillIO:{adapterId:this.ioAdapter.id,adapterVersion:this.ioAdapter.version,observationSpaceId:this.ioAdapter.observationSpaceId,actionSpaceId:this.ioAdapter.actionSpaceId,profile:session.ioProfile}},samples:session.samples});
    const summary=this.datasetAdapter.summarizeManualSamples(skillId),episodeSummary=this.datasetAdapter.episodeSummary(skillId);saveDatasetMeta(skillId,{kind:'manual_recorded',samples:summary.samples,recordedAt:endedAt,sourceEnvironment,skillIO:{adapterId:this.ioAdapter.id,adapterVersion:this.ioAdapter.version,observationSpaceId:this.ioAdapter.observationSpaceId,actionSpaceId:this.ioAdapter.actionSpaceId},datasetAdapterId:this.datasetAdapter.id,datasetAdapterVersion:this.datasetAdapter.version,demonstrationRecorderAdapterId:this.id,demonstrationRecorderAdapterVersion:this.version,episodes:episodeSummary.episodes,episodeSummary,featureSummary:summary.featureSummary||null,preview:summary.preview||null});return{saved:session.samples.length,total:summary.samples,episode,episodeSummary,summary,sourceEnvironment,active:false,startedAt:session.startedAt,endedAt};
  }
  discard(skillId){return this.stop(skillId,{save:false})}
  status(){return this.session?{active:true,skillId:this.session.skillId,samples:this.session.samples.length,startedAt:this.session.startedAt,target:this.session.targetContext?.target,environmentId:this.session.environmentDescriptor?.id||null,observationSpaceId:this.ioAdapter.observationSpaceId}:{active:false,samples:0}}
  describe(skillId){return{...super.describe(skillId),datasetAdapterId:this.datasetAdapter?.id||null,skillIOAdapter:this.ioAdapter.describe(skillId),episodeStoreId:this.datasetAdapter?.episodeStore?.id||null,environmentAware:true,labels:{outcome:['unlabeled','success','failure'],quality:['unrated','good','ok','bad']},observationSpaceId:this.ioAdapter.observationSpaceId,actionSpaceId:this.ioAdapter.actionSpaceId}}
}
