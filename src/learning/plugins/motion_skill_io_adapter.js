import {SkillIOAdapter} from '../framework/skill_io_adapter.js';

export const MOTION_OBSERVATION_SPACE_ID='motion_relative_vehicle_normalized.v1';
export const MOTION_ACTION_SPACE_ID='motion_drive_normalized.v1';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wrap=d=>((d+180)%360+360)%360-180;
const deg2rad=d=>d*Math.PI/180;

function defaultProfile(skillId,control={}){
  const wheelbase=Math.max(1e-6,Number(control.wheelbase)||1),bodyWidth=Math.max(1e-6,Number(control.bodyWidth)||wheelbase*.7),maxForward=Math.max(1e-6,Number(control.maxLinearSpeed)||1),maxReverse=Math.max(1e-6,Number(control.maxReverseSpeed)||maxForward),maxSteering=Math.max(1e-6,Math.abs(Number(control.maxSteeringAngle)||35));
  if(skillId==='align_to_pallet')return{normalizationFamily:'vehicle_relative.v1',forwardScale:3*wheelbase,lateralScale:3*bodyWidth,speedScale:maxForward,actionSpeedScale:.3*maxForward,steeringScale:maxSteering};
  if(skillId==='retreat')return{normalizationFamily:'vehicle_relative.v1',forwardScale:3*wheelbase,lateralScale:3*bodyWidth,speedScale:maxReverse,actionSpeedScale:Math.min(maxReverse,.24*maxForward),steeringScale:maxSteering};
  return{normalizationFamily:'vehicle_relative.v1',forwardScale:10*wheelbase,lateralScale:8*bodyWidth,speedScale:maxForward,actionSpeedScale:.5*maxForward,steeringScale:maxSteering};
}

function validProfile(p){return p&&['forwardScale','lateralScale','speedScale','actionSpeedScale','steeringScale'].every(k=>Number.isFinite(Number(p[k]))&&Number(p[k])>0)}

export class MotionSkillIOAdapter extends SkillIOAdapter{
  constructor(){super({id:'motion_skill_io',label:'Motion Vehicle-relative I/O',version:2,observationSpaceId:MOTION_OBSERVATION_SPACE_ID,actionSpaceId:MOTION_ACTION_SPACE_ID})}
  supports(skillId){return['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  profile(skillId,context={}){
    if(validProfile(context.profile))return{...context.profile};
    const services=context.domainServices||context.services,environment=context.environment,control=context.controlConfig||environment?.getState?.()?.simulation||context.state?.simulation||{},base=defaultProfile(skillId,control);
    if(services?.has?.('motion.ioProfile'))return{...base,...services.call('motion.ioProfile',skillId)};
    const direct=environment?.getDomainServices?.()?.['motion.ioProfile'];if(typeof direct==='function')return{...base,...direct(skillId)};
    return base;
  }
  rawObservationFromTarget(skillId,state,{target,targetYaw=null,referenceYaw=null}={}){
    if(!state?.robot||!target)throw new Error('motion_io_target_and_robot_required');
    const r=state.robot,wx=Number(target.x)-Number(r.x),wy=Number(target.y)-Number(r.y),a=deg2rad(Number(r.yaw)||0),forward=Math.cos(a)*wx+Math.sin(a)*wy,lateral=-Math.sin(a)*wx+Math.cos(a)*wy;
    let desiredYaw;
    if(skillId==='align_to_pallet')desiredYaw=Number.isFinite(Number(targetYaw))?Number(targetYaw):Number(target.yaw)||0;
    else if(skillId==='retreat')desiredYaw=Number.isFinite(Number(referenceYaw))?Number(referenceYaw):Number(r.yaw)||0;
    else desiredYaw=Math.atan2(wy,wx)*180/Math.PI;
    return{forward,lateral,yawError:wrap(desiredYaw-(Number(r.yaw)||0)),speed:Number(r.speed)||0,steeringAngle:Number(r.steeringAngle)||0};
  }
  encodeObservation(skillId,raw,context={}){const p=this.profile(skillId,context),yaw=deg2rad(wrap(Number(raw?.yawError)||0));return{forward:clamp((Number(raw?.forward)||0)/p.forwardScale,-2,2),lateral:clamp((Number(raw?.lateral)||0)/p.lateralScale,-2,2),yawSin:Math.sin(yaw),yawCos:Math.cos(yaw),speed:clamp((Number(raw?.speed)||0)/p.speedScale,-1.5,1.5),steering:clamp((Number(raw?.steeringAngle)||0)/p.steeringScale,-1,1)}}
  encodeTargetObservation(skillId,state,targetContext={},context={}){return this.encodeObservation(skillId,this.rawObservationFromTarget(skillId,state,targetContext),context)}
  encodeAction(skillId,rawAction,context={}){const p=this.profile(skillId,context);return{speed:clamp((Number(rawAction?.speed)||0)/p.actionSpeedScale,-1,1),steering:clamp((Number(rawAction?.steeringAngle)||0)/p.steeringScale,-1,1)}}
  decodeAction(skillId,modelAction,context={}){const p=this.profile(skillId,context);return{type:'drive',speed:clamp(Number(modelAction?.speed)||0,-1,1)*p.actionSpeedScale,steeringAngle:clamp(Number(modelAction?.steering)||0,-1,1)*p.steeringScale}}
  featureVector(_skillId,o){return[clamp(Number(o?.forward)||0,-2,2),clamp(Number(o?.lateral)||0,-2,2),clamp(Number(o?.yawSin)||0,-1,1),clamp(Number(o?.yawCos)||0,-1,1),clamp(Number(o?.speed)||0,-1.5,1.5),clamp(Number(o?.steering)||0,-1,1),1]}
  describe(skillId){return{...super.describe(skillId),normalizationFamily:'vehicle_relative.v1',encodedObservation:['forward','lateral','yawSin','yawCos','speed','steering'],encodedAction:['speed','steering'],unitPolicy:'dimensionless model I/O; environment adapter provides or snapshots vehicle-relative scale profile'}}
}

export const motionSkillIOAdapter=new MotionSkillIOAdapter();
