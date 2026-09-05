import {SkillDemonstrationRecorderAdapter} from '../framework/demonstration_recorder_adapter.js';
import {saveDatasetMeta} from '../skill_learning_registry.js';

const wrap=d=>((d+180)%360+360)%360-180;
const deg2rad=d=>d*Math.PI/180;

function targetFor(skillId,state){
  if(skillId==='navigate_to_pallet'){const p=state.pallets?.pallet_A;if(!p)throw new Error('pallet_A_not_found');return{target:{x:p.x-125,y:p.y},targetYaw:0}}
  if(skillId==='align_to_pallet'){const p=state.pallets?.pallet_A;if(!p)throw new Error('pallet_A_not_found');return{target:{x:p.x-82,y:p.y},targetYaw:0}}
  if(skillId==='navigate_to'){const l=state.locations?.shipping;if(!l)throw new Error('shipping_not_found');return{target:{x:l.x-75,y:l.y},targetYaw:null}}
  if(skillId==='retreat'){const r=state.robot,a=deg2rad(r.yaw);return{target:{x:r.x-Math.cos(a)*70,y:r.y-Math.sin(a)*70},targetYaw:r.yaw,start:{x:r.x,y:r.y},referenceYaw:r.yaw}}
  throw new Error(`unsupported_motion_demo_skill:${skillId}`);
}

function observationFor(skillId,state,session){
  const r=state.robot,t=session.target,wx=t.x-r.x,wy=t.y-r.y;
  if(skillId==='align_to_pallet')return{dx:wx,dy:wy,yawError:wrap((session.targetYaw??0)-r.yaw),speed:r.speed,steeringAngle:r.steeringAngle};
  if(skillId==='retreat'){const a=deg2rad(session.referenceYaw),traveledX=r.x-session.start.x,traveledY=r.y-session.start.y,lateral=-Math.sin(a)*traveledX+Math.cos(a)*traveledY;return{dx:Math.hypot(wx,wy),dy:lateral,yawError:wrap(session.referenceYaw-r.yaw),speed:r.speed,steeringAngle:r.steeringAngle}}
  const desired=Math.atan2(wy,wx)*180/Math.PI,a=deg2rad(r.yaw),lateral=-Math.sin(a)*wx+Math.cos(a)*wy;return{dx:Math.hypot(wx,wy),dy:lateral,yawError:wrap(desired-r.yaw),speed:r.speed,steeringAngle:r.steeringAngle};
}

export class MotionDemonstrationRecorderAdapter extends SkillDemonstrationRecorderAdapter{
  constructor(datasetAdapter){super({id:'motion_manual_demo_recorder',label:'Motion Manual Demonstration Recorder',version:4});this.datasetAdapter=datasetAdapter;this.session=null}
  supports(skillId){return['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  getRecordableActions(){return['drive']}
  start(skillId,{store,replace=false}={}){
    if(!this.supports(skillId))throw new Error(`demo_recorder_unsupported_skill:${skillId}`);if(!store?.state)throw new Error('demo_recorder_store_required');
    const context=targetFor(skillId,store.state);this.session={skillId,startedAt:new Date().toISOString(),samples:[],replace,context,startRobot:{x:store.state.robot.x,y:store.state.robot.y,yaw:store.state.robot.yaw}};Object.assign(this.session,context);return this.status();
  }
  record(skillId,action,{store}={}){
    if(!this.session?.skillId||this.session.skillId!==skillId)return null;if(action?.type!=='drive')return null;if(!Number.isFinite(Number(action.speed))||!Number.isFinite(Number(action.steeringAngle)))return null;
    const sample={obs:observationFor(skillId,store.state,this.session),action:{speed:Number(action.speed),steeringAngle:Number(action.steeringAngle)}};this.session.samples.push(sample);return{sample,count:this.session.samples.length};
  }
  stop(skillId,{save=true,outcome='unlabeled',quality='unrated',note='',store=null}={}){
    if(!this.session||this.session.skillId!==skillId)return{saved:0,total:0,active:false};const session=this.session;this.session=null;if(!save)return{saved:0,total:session.samples.length,active:false,discarded:true};if(!session.samples.length)return{saved:0,total:this.datasetAdapter.loadManualSamples(skillId).length,active:false,empty:true};
    if(session.replace)this.datasetAdapter.clearManualSamples(skillId);
    const endedAt=new Date().toISOString(),episode=this.datasetAdapter.saveEpisode(skillId,{skillId,startedAt:session.startedAt,endedAt,outcome,quality,note,context:{...session.context,startRobot:session.startRobot,endRobot:store?.state?.robot?{x:store.state.robot.x,y:store.state.robot.y,yaw:store.state.robot.yaw}:null},samples:session.samples});
    const summary=this.datasetAdapter.summarizeManualSamples(skillId),episodeSummary=this.datasetAdapter.episodeSummary(skillId);
    saveDatasetMeta(skillId,{kind:'manual_recorded',samples:summary.samples,recordedAt:endedAt,datasetAdapterId:this.datasetAdapter.id,datasetAdapterVersion:this.datasetAdapter.version,demonstrationRecorderAdapterId:this.id,demonstrationRecorderAdapterVersion:this.version,episodes:episodeSummary.episodes,episodeSummary,featureSummary:summary.featureSummary||null,preview:summary.preview||null});
    return{saved:session.samples.length,total:summary.samples,episode,episodeSummary,summary,active:false,startedAt:session.startedAt,endedAt};
  }
  discard(skillId){return this.stop(skillId,{save:false})}
  status(){return this.session?{active:true,skillId:this.session.skillId,samples:this.session.samples.length,startedAt:this.session.startedAt,target:this.session.target}:{active:false,samples:0}}
  describe(skillId){return{...super.describe(skillId),datasetAdapterId:this.datasetAdapter?.id||null,episodeStoreId:this.datasetAdapter?.episodeStore?.id||null,labels:{outcome:['unlabeled','success','failure'],quality:['unrated','good','ok','bad']},observation:['dx','dy','yawError','speed','steeringAngle'],action:['speed','steeringAngle']}}
}
