import {SkillRuntimePolicyAdapter} from '../framework/runtime_policy_adapter.js';
import {BehaviorCloningSkill} from '../behavior_cloning_skill.js';
import {BehaviorCloningAlign} from '../behavior_cloning_align.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wrap=d=>((d+180)%360+360)%360-180;
const deg2rad=d=>d*Math.PI/180;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class MotionBehaviorCloningRuntimeAdapter extends SkillRuntimePolicyAdapter{
  constructor(){super({id:'motion_bc_runtime',label:'Motion BC Runtime',version:3});this.models=new Map();this.alignModel=null}
  supports(skillId,policy='learned'){return policy==='learned'&&['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  getRequiredDomainServices(skillId){
    const common=['state.get','action.send','control.config'];
    if(skillId==='navigate_to_pallet')return[...common,'path.palletApproach'];
    if(skillId==='navigate_to')return[...common,'path.to','target.locationApproach'];
    if(skillId==='align_to_pallet')return[...common,'target.palletDock'];
    if(skillId==='retreat')return[...common,'target.retreat'];
    return common;
  }
  describe(skillId){return{...super.describe(skillId),requiredDomainServices:this.getRequiredDomainServices(skillId)}}

  state(context){return context.environment?.getState?.()||context.domainServices?.call?.('state.get')||context.store?.state}
  control(context){return context.domainServices?.has?.('control.config')?context.domainServices.call('control.config'):this.state(context)?.simulation||{}}
  async act(context,action){if(context.domainServices?.has?.('action.send'))return await Promise.resolve(context.domainServices.call('action.send',action));if(context.environment?.step)return await context.environment.step(action);return await Promise.resolve(context.robot?.sendAction?.(action))}
  emit(context){if(context.domainServices?.has?.('state.emit'))return context.domainServices.call('state.emit');return context.store?.emit?.()}
  service(context,name,...args){if(!context.domainServices?.has?.(name))throw new Error(`domain_service_missing:${name}`);return context.domainServices.call(name,...args)}

  modelFor(skillId){
    if(skillId==='align_to_pallet'){
      if(!this.alignModel)this.alignModel=new BehaviorCloningAlign();
      this.alignModel.model=this.alignModel.load();
      return this.alignModel;
    }
    if(!this.models.has(skillId))this.models.set(skillId,new BehaviorCloningSkill(skillId));
    const model=this.models.get(skillId);model.load();return model;
  }

  async learnedDriveTo(skillId,target,context,{tolerance=12,maxTicks=900,maxSpeedOverride=null}={}){
    const bc=this.modelFor(skillId),s=this.state(context);if(!bc?.isReady())return{ok:false,reason:'learned_model_unavailable'};
    for(let i=0;i<maxTicks;i++){
      const sim=this.control(context),r=s.robot,wx=target.x-r.x,wy=target.y-r.y,d=Math.hypot(wx,wy);
      if(d<=tolerance){await this.act(context,{type:'stop'});return{ok:true,ticks:i,distance:d,policy:'learned_bc'}}
      const desired=Math.atan2(wy,wx)*180/Math.PI,yawError=wrap(desired-r.yaw),a=deg2rad(r.yaw),lateral=-Math.sin(a)*wx+Math.cos(a)*wy;
      const cmd=bc.predict({dx:d,dy:lateral,yawError,speed:r.speed,steeringAngle:r.steeringAngle});
      if(!cmd){await this.act(context,{type:'stop'});return{ok:false,reason:'learned_model_unavailable'}}
      const limit=Math.min(maxSpeedOverride||sim.maxLinearSpeed,sim.maxLinearSpeed),speed=clamp(cmd.speed,0,limit),steer=clamp(cmd.steeringAngle,-sim.maxSteeringAngle,sim.maxSteeringAngle);
      const res=await this.act(context,{type:'drive',speed,steeringAngle:steer,dt:sim.dt});
      if(!res?.ok){await this.act(context,{type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}
      if(!sim.batchMode)await wait(16);
    }
    await this.act(context,{type:'stop'});return{ok:false,reason:'learned_motion_timeout'};
  }

  async learnedFollowPath(skillId,waypoints,context,{tolerance=12,maxTicks=900,maxSpeedOverride=null}={}){
    const s=this.state(context);s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:[],lookaheadTarget:null};this.emit(context);let ticks=0;
    for(let i=0;i<waypoints.length;i++){
      s.path.index=i;s.path.lookaheadTarget={...waypoints[i]};this.emit(context);
      const m=await this.learnedDriveTo(skillId,waypoints[i],context,{tolerance,maxTicks,maxSpeedOverride});ticks+=m.ticks||0;
      if(!m.ok){s.path.active=false;s.path.lookaheadTarget=null;this.emit(context);return m}
    }
    s.path.active=false;s.path.lookaheadTarget=null;s.path.index=waypoints.length;this.emit(context);return{ok:true,ticks,policy:'learned_bc'};
  }

  async learnedAlign(args,context){
    const s=this.state(context),p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
    if(s.failures?.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};
    const bc=this.modelFor('align_to_pallet');if(!bc?.isReady())return{ok:false,reason:'learned_model_unavailable'};
    const final=this.service(context,'target.palletDock',p),targetYaw=Number.isFinite(Number(final.yaw))?Number(final.yaw):0;
    for(let i=0;i<520;i++){
      const sim=this.control(context),r=s.robot,dx=final.x-r.x,dy=final.y-r.y,yawError=wrap(targetYaw-r.yaw),d=Math.hypot(dx,dy);
      if(d<11&&Math.abs(yawError)<24){await this.act(context,{type:'stop'});if(context.domainServices?.has?.('robot.setAligned'))context.domainServices.call('robot.setAligned',true);else{s.robot.aligned=true;this.emit(context)}return{ok:true,message:`aligned by learned_bc (yaw error ${Math.abs(yawError).toFixed(1)}°)`,ticks:i,yawError:Math.abs(yawError),policy:'learned_bc'}}
      const cmd=bc.predict({dx,dy,yawError,speed:r.speed,steeringAngle:r.steeringAngle});if(!cmd){await this.act(context,{type:'stop'});return{ok:false,reason:'learned_model_unavailable'}}
      const res=await this.act(context,{type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:sim.dt});if(!res?.ok){await this.act(context,{type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}
      if(!sim.batchMode)await wait(16);
    }
    await this.act(context,{type:'stop'});return{ok:false,reason:'learned_alignment_timeout'};
  }

  async learnedRetreat(context){
    const s=this.state(context),bc=this.modelFor('retreat');if(!bc?.isReady())return{ok:false,reason:'learned_model_unavailable'};
    const start={x:s.robot.x,y:s.robot.y},referenceYaw=s.robot.yaw,a=deg2rad(referenceYaw),target=this.service(context,'target.retreat',s.robot,70);
    for(let i=0;i<420;i++){
      const sim=this.control(context),r=s.robot,d=context.domainServices?.has?.('world.distance')?context.domainServices.call('world.distance',r,target):distance(r,target);
      if(d<=10){await this.act(context,{type:'stop'});if(context.domainServices?.has?.('agent.markRetreated'))context.domainServices.call('agent.markRetreated',true);else{s.agent.memory.retreated=true;this.emit(context)}return{ok:true,message:'retreated (learned_bc)',ticks:i,policy:'learned_bc'}}
      const traveledX=r.x-start.x,traveledY=r.y-start.y,lateral=-Math.sin(a)*traveledX+Math.cos(a)*traveledY,yawError=wrap(referenceYaw-r.yaw),cmd=bc.predict({dx:d,dy:lateral,yawError,speed:r.speed,steeringAngle:r.steeringAngle});
      if(!cmd){await this.act(context,{type:'stop'});return{ok:false,reason:'learned_model_unavailable'}}
      const speed=clamp(Math.min(cmd.speed,-2),-Math.min(30,sim.maxReverseSpeed),-2),steer=clamp(cmd.steeringAngle,-sim.maxSteeringAngle,sim.maxSteeringAngle),res=await this.act(context,{type:'drive',speed,steeringAngle:steer,dt:sim.dt});
      if(!res?.ok){await this.act(context,{type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}
      if(!sim.batchMode)await wait(16);
    }
    await this.act(context,{type:'stop'});return{ok:false,reason:'learned_retreat_timeout'};
  }

  async execute(skillId,args={},context={}){
    const s=this.state(context),required=this.getRequiredDomainServices(skillId),missing=required.filter(name=>!context.domainServices?.has?.(name));if(missing.length)return{ok:false,reason:`domain_service_missing:${missing.join(',')}`};
    if(skillId==='align_to_pallet')return this.learnedAlign(args,context);
    if(skillId==='retreat')return this.learnedRetreat(context);
    if(skillId==='navigate_to_pallet'){
      const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
      const path=this.service(context,'path.palletApproach',p),m=await this.learnedFollowPath(skillId,path,context,{tolerance:12,maxTicks:900,maxSpeedOverride:55});
      return m.ok?{ok:true,message:`approached ${p.label} (learned_bc)`,ticks:m.ticks,policy:'learned_bc'}:{ok:false,reason:m.reason};
    }
    if(skillId==='navigate_to'){
      const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};
      const target=this.service(context,'target.locationApproach',l),path=this.service(context,'path.to',target),m=await this.learnedFollowPath(skillId,path,context,{tolerance:12,maxTicks:900,maxSpeedOverride:55});
      return m.ok?{ok:true,message:`followed path to ${l.label} (learned_bc)`,ticks:m.ticks,policy:'learned_bc'}:{ok:false,reason:m.reason};
    }
    return{ok:false,reason:`unsupported_learned_runtime_skill:${skillId}`};
  }
}
