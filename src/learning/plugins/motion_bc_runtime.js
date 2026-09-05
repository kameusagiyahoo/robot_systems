import {SkillRuntimePolicyAdapter} from '../framework/runtime_policy_adapter.js';
import {BehaviorCloningSkill} from '../behavior_cloning_skill.js';
import {BehaviorCloningAlign} from '../behavior_cloning_align.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wrap=d=>((d+180)%360+360)%360-180;
const deg2rad=d=>d*Math.PI/180;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class MotionBehaviorCloningRuntimeAdapter extends SkillRuntimePolicyAdapter{
  constructor(){super({id:'motion_bc_runtime',label:'Motion BC Runtime',version:1});this.models=new Map();this.alignModel=null}
  supports(skillId,policy='learned'){return policy==='learned'&&['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}

  modelFor(skillId){
    if(skillId==='align_to_pallet'){
      if(!this.alignModel)this.alignModel=new BehaviorCloningAlign();
      this.alignModel.model=this.alignModel.load();
      return this.alignModel;
    }
    if(!this.models.has(skillId))this.models.set(skillId,new BehaviorCloningSkill(skillId));
    const model=this.models.get(skillId);model.load();return model;
  }

  async learnedDriveTo(skillId,target,{store,robot,tolerance=12,maxTicks=900,maxSpeedOverride=null}={}){
    const bc=this.modelFor(skillId),s=store.state;
    if(!bc?.isReady())return{ok:false,reason:'learned_model_unavailable'};
    for(let i=0;i<maxTicks;i++){
      const r=s.robot,wx=target.x-r.x,wy=target.y-r.y,d=Math.hypot(wx,wy);
      if(d<=tolerance){robot.sendAction({type:'stop'});return{ok:true,ticks:i,distance:d,policy:'learned_bc'}}
      const desired=Math.atan2(wy,wx)*180/Math.PI,yawError=wrap(desired-r.yaw),a=deg2rad(r.yaw),lateral=-Math.sin(a)*wx+Math.cos(a)*wy;
      const cmd=bc.predict({dx:d,dy:lateral,yawError,speed:r.speed,steeringAngle:r.steeringAngle});
      if(!cmd){robot.sendAction({type:'stop'});return{ok:false,reason:'learned_model_unavailable'}}
      const limit=Math.min(maxSpeedOverride||s.simulation.maxLinearSpeed,s.simulation.maxLinearSpeed),speed=clamp(cmd.speed,0,limit),steer=clamp(cmd.steeringAngle,-s.simulation.maxSteeringAngle,s.simulation.maxSteeringAngle);
      const res=robot.sendAction({type:'drive',speed,steeringAngle:steer,dt:s.simulation.dt});
      if(!res.ok){robot.sendAction({type:'stop'});return{ok:false,reason:res.reason||'drive_failed'}}
      if(!s.simulation.batchMode)await wait(16);
    }
    robot.sendAction({type:'stop'});return{ok:false,reason:'learned_motion_timeout'};
  }

  async learnedFollowPath(skillId,waypoints,{store,robot,tolerance=12,maxTicks=900,maxSpeedOverride=null}={}){
    const s=store.state;s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:[],lookaheadTarget:null};store.emit();let ticks=0;
    for(let i=0;i<waypoints.length;i++){
      s.path.index=i;s.path.lookaheadTarget={...waypoints[i]};store.emit();
      const m=await this.learnedDriveTo(skillId,waypoints[i],{store,robot,tolerance,maxTicks,maxSpeedOverride});ticks+=m.ticks||0;
      if(!m.ok){s.path.active=false;s.path.lookaheadTarget=null;store.emit();return m}
    }
    s.path.active=false;s.path.lookaheadTarget=null;s.path.index=waypoints.length;store.emit();return{ok:true,ticks,policy:'learned_bc'};
  }

  async learnedAlign(args,{store,robot}){
    const s=store.state,p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
    if(s.failures.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};
    const bc=this.modelFor('align_to_pallet');if(!bc?.isReady())return{ok:false,reason:'learned_model_unavailable'};
    const final={x:p.x-82,y:p.y};
    for(let i=0;i<520;i++){
      const r=s.robot,dx=final.x-r.x,dy=final.y-r.y,yawError=wrap(-r.yaw),d=Math.hypot(dx,dy);
      if(d<11&&Math.abs(yawError)<24){robot.sendAction({type:'stop'});s.robot.aligned=true;store.emit();return{ok:true,message:`aligned by learned_bc (yaw error ${Math.abs(yawError).toFixed(1)}°)`,ticks:i,yawError:Math.abs(yawError),policy:'learned_bc'}}
      const cmd=bc.predict({dx,dy,yawError,speed:r.speed,steeringAngle:r.steeringAngle});
      if(!cmd){robot.sendAction({type:'stop'});return{ok:false,reason:'learned_model_unavailable'}}
      const res=robot.sendAction({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:s.simulation.dt});
      if(!res.ok){robot.sendAction({type:'stop'});return{ok:false,reason:res.reason||'drive_failed'}}
      if(!s.simulation.batchMode)await wait(16);
    }
    robot.sendAction({type:'stop'});return{ok:false,reason:'learned_alignment_timeout'};
  }

  async learnedRetreat({store,robot}){
    const s=store.state,bc=this.modelFor('retreat');if(!bc?.isReady())return{ok:false,reason:'learned_model_unavailable'};
    const start={x:s.robot.x,y:s.robot.y},referenceYaw=s.robot.yaw,a=deg2rad(referenceYaw),target={x:start.x-Math.cos(a)*70,y:start.y-Math.sin(a)*70};
    for(let i=0;i<420;i++){
      const r=s.robot,d=distance(r,target);if(d<=10){robot.sendAction({type:'stop'});s.agent.memory.retreated=true;store.emit();return{ok:true,message:'retreated (learned_bc)',ticks:i,policy:'learned_bc'}}
      const traveledX=r.x-start.x,traveledY=r.y-start.y,lateral=-Math.sin(a)*traveledX+Math.cos(a)*traveledY,yawError=wrap(referenceYaw-r.yaw),cmd=bc.predict({dx:d,dy:lateral,yawError,speed:r.speed,steeringAngle:r.steeringAngle});
      if(!cmd){robot.sendAction({type:'stop'});return{ok:false,reason:'learned_model_unavailable'}}
      const speed=clamp(Math.min(cmd.speed,-2),-Math.min(30,s.simulation.maxReverseSpeed),-2),steer=clamp(cmd.steeringAngle,-s.simulation.maxSteeringAngle,s.simulation.maxSteeringAngle),res=robot.sendAction({type:'drive',speed,steeringAngle:steer,dt:s.simulation.dt});
      if(!res.ok){robot.sendAction({type:'stop'});return{ok:false,reason:res.reason||'drive_failed'}}
      if(!s.simulation.batchMode)await wait(16);
    }
    robot.sendAction({type:'stop'});return{ok:false,reason:'learned_retreat_timeout'};
  }

  async execute(skillId,args={},context={}){
    const {store,robot,services={}}=context,s=store.state;
    if(skillId==='align_to_pallet')return this.learnedAlign(args,{store,robot});
    if(skillId==='retreat')return this.learnedRetreat({store,robot});
    if(skillId==='navigate_to_pallet'){
      const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
      const path=services.palletApproachPath?services.palletApproachPath(p):[{x:p.x-170,y:p.y},{x:p.x-125,y:p.y}],m=await this.learnedFollowPath(skillId,path,{store,robot,tolerance:12,maxTicks:900,maxSpeedOverride:55});
      return m.ok?{ok:true,message:`approached ${p.label} (learned_bc)`,ticks:m.ticks,policy:'learned_bc'}:{ok:false,reason:m.reason};
    }
    if(skillId==='navigate_to'){
      const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};
      const target={x:l.x-75,y:l.y},path=services.pathTo?services.pathTo(target):[target],m=await this.learnedFollowPath(skillId,path,{store,robot,tolerance:12,maxTicks:900,maxSpeedOverride:55});
      return m.ok?{ok:true,message:`followed path to ${l.label} (learned_bc)`,ticks:m.ticks,policy:'learned_bc'}:{ok:false,reason:m.reason};
    }
    return{ok:false,reason:`unsupported_learned_runtime_skill:${skillId}`};
  }
}
