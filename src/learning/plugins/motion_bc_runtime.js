import {SkillRuntimePolicyAdapter} from '../framework/runtime_policy_adapter.js';
import {loadSkillModel} from '../skill_learning_registry.js';
import {predictMotionModel} from '../algorithms/motion_bc_core.js';
import {motionSkillIOAdapter} from './motion_skill_io_adapter.js';

const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class MotionBehaviorCloningRuntimeAdapter extends SkillRuntimePolicyAdapter{
  constructor(ioAdapter=motionSkillIOAdapter){super({id:'motion_bc_runtime',label:'Motion BC Runtime',version:5});this.ioAdapter=ioAdapter}
  supports(skillId,policy='learned'){return policy==='learned'&&['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  getRequiredDomainServices(skillId){const common=['state.get','action.send','control.config'];if(skillId==='navigate_to_pallet')return[...common,'path.palletApproach'];if(skillId==='navigate_to')return[...common,'path.to','target.locationApproach'];if(skillId==='align_to_pallet')return[...common,'target.palletDock'];if(skillId==='retreat')return[...common,'target.retreat'];return common}
  describe(skillId){return{...super.describe(skillId),requiredDomainServices:this.getRequiredDomainServices(skillId),skillIOAdapter:this.ioAdapter.describe(skillId),asyncDomainServices:true}}
  state(context){return context.environment?.getState?.()||context.domainServices?.call?.('state.get')||context.store?.state}
  control(context){return context.domainServices?.has?.('control.config')?context.domainServices.call('control.config'):this.state(context)?.simulation||{}}
  async act(context,action){if(context.domainServices?.has?.('action.send'))return await Promise.resolve(context.domainServices.call('action.send',action));if(context.environment?.step)return await context.environment.step(action);return await Promise.resolve(context.robot?.sendAction?.(action))}
  emit(context){if(context.domainServices?.has?.('state.emit'))return context.domainServices.call('state.emit');return context.store?.emit?.()}
  service(context,name,...args){if(!context.domainServices?.has?.(name))throw new Error(`domain_service_missing:${name}`);return context.domainServices.call(name,...args)}
  async serviceAsync(context,name,...args){if(!context.domainServices?.has?.(name))throw new Error(`domain_service_missing:${name}`);if(typeof context.domainServices.callAsync==='function')return await context.domainServices.callAsync(name,...args);return await Promise.resolve(context.domainServices.call(name,...args))}
  ioContext(context){return{environment:context.environment,state:this.state(context),domainServices:context.domainServices,controlConfig:this.control(context)}}
  model(skillId){return loadSkillModel(skillId)}
  validateModel(skillId){const model=this.model(skillId);if(!model)return{ok:false,reason:'learned_model_unavailable',model:null};if(!model.observationSpaceId||!model.actionSpaceId)return{ok:false,reason:'legacy_model_requires_retrain_for_canonical_io',model};const compatibility=this.ioAdapter.compatibility(model);return compatibility.ok?{ok:true,model}:{ok:false,reason:`model_io_incompatible:${compatibility.reason}`,model,compatibility}}
  command(skillId,targetContext,context){const check=this.validateModel(skillId);if(!check.ok)return{ok:false,...check};const encoded=this.ioAdapter.encodeTargetObservation(skillId,this.state(context),targetContext,this.ioContext(context)),normalized=predictMotionModel(check.model,encoded);if(!normalized)return{ok:false,reason:'model_prediction_failed',model:check.model};return{ok:true,encoded,normalized,action:this.ioAdapter.decodeAction(skillId,normalized,this.ioContext(context)),model:check.model}}

  async learnedDriveTo(skillId,target,context,{targetYaw=null,referenceYaw=null,tolerance=12,maxTicks=900}={}){
    const check=this.validateModel(skillId);if(!check.ok)return{ok:false,reason:check.reason};const s=this.state(context);
    for(let i=0;i<maxTicks;i++){
      const r=s.robot,d=context.domainServices?.has?.('world.distance')?context.domainServices.call('world.distance',r,target):Math.hypot(target.x-r.x,target.y-r.y);if(d<=tolerance){await this.act(context,{type:'stop'});return{ok:true,ticks:i,distance:d,policy:'learned_bc',modelId:check.model.modelId||null}}
      const cmd=this.command(skillId,{target,targetYaw,referenceYaw},context);if(!cmd.ok){await this.act(context,{type:'stop'});return{ok:false,reason:cmd.reason}}
      const sim=this.control(context),res=await this.act(context,{...cmd.action,dt:sim.dt});if(!res?.ok){await this.act(context,{type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}if(!sim.batchMode)await wait(16);
    }
    await this.act(context,{type:'stop'});return{ok:false,reason:'learned_motion_timeout'};
  }

  async learnedFollowPath(skillId,waypoints,context,{tolerance=12,maxTicks=900}={}){
    const s=this.state(context);s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:[],lookaheadTarget:null};this.emit(context);let ticks=0;
    for(let i=0;i<waypoints.length;i++){s.path.index=i;s.path.lookaheadTarget={...waypoints[i]};this.emit(context);const m=await this.learnedDriveTo(skillId,waypoints[i],context,{tolerance,maxTicks});ticks+=m.ticks||0;if(!m.ok){s.path.active=false;s.path.lookaheadTarget=null;this.emit(context);return m}}
    s.path.active=false;s.path.lookaheadTarget=null;s.path.index=waypoints.length;this.emit(context);return{ok:true,ticks,policy:'learned_bc',modelId:this.model(skillId)?.modelId||null};
  }

  async learnedAlign(args,context){
    const s=this.state(context),p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures?.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};const check=this.validateModel('align_to_pallet');if(!check.ok)return{ok:false,reason:check.reason};const final=await this.serviceAsync(context,'target.palletDock',p),targetYaw=Number.isFinite(Number(final.yaw))?Number(final.yaw):0;
    for(let i=0;i<520;i++){
      const r=s.robot,d=context.domainServices?.has?.('world.distance')?context.domainServices.call('world.distance',r,final):Math.hypot(final.x-r.x,final.y-r.y),raw=this.ioAdapter.rawObservationFromTarget('align_to_pallet',s,{target:final,targetYaw}),yawError=Math.abs(raw.yawError);
      if(d<11&&yawError<24){await this.act(context,{type:'stop'});if(context.domainServices?.has?.('robot.setAligned'))await this.serviceAsync(context,'robot.setAligned',true);else{s.robot.aligned=true;this.emit(context)}return{ok:true,message:`aligned by learned_bc (yaw error ${yawError.toFixed(1)}°)`,ticks:i,yawError,policy:'learned_bc',modelId:check.model.modelId||null}}
      const cmd=this.command('align_to_pallet',{target:final,targetYaw},context);if(!cmd.ok){await this.act(context,{type:'stop'});return{ok:false,reason:cmd.reason}}const sim=this.control(context),res=await this.act(context,{...cmd.action,dt:sim.dt});if(!res?.ok){await this.act(context,{type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}if(!sim.batchMode)await wait(16);
    }
    await this.act(context,{type:'stop'});return{ok:false,reason:'learned_alignment_timeout'};
  }

  async learnedRetreat(context){
    const s=this.state(context),check=this.validateModel('retreat');if(!check.ok)return{ok:false,reason:check.reason};const referenceYaw=s.robot.yaw,target=await this.serviceAsync(context,'target.retreat',s.robot,70);
    for(let i=0;i<420;i++){
      const r=s.robot,d=context.domainServices?.has?.('world.distance')?context.domainServices.call('world.distance',r,target):Math.hypot(target.x-r.x,target.y-r.y);if(d<=10){await this.act(context,{type:'stop'});if(context.domainServices?.has?.('agent.markRetreated'))await this.serviceAsync(context,'agent.markRetreated',true);else{s.agent.memory.retreated=true;this.emit(context)}return{ok:true,message:'retreated (learned_bc)',ticks:i,policy:'learned_bc',modelId:check.model.modelId||null}}
      const cmd=this.command('retreat',{target,referenceYaw},context);if(!cmd.ok){await this.act(context,{type:'stop'});return{ok:false,reason:cmd.reason}}const sim=this.control(context),res=await this.act(context,{...cmd.action,dt:sim.dt});if(!res?.ok){await this.act(context,{type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}if(!sim.batchMode)await wait(16);
    }
    await this.act(context,{type:'stop'});return{ok:false,reason:'learned_retreat_timeout'};
  }

  async execute(skillId,args={},context={}){
    const s=this.state(context),required=this.getRequiredDomainServices(skillId),missing=required.filter(name=>!context.domainServices?.has?.(name));if(missing.length)return{ok:false,reason:`domain_service_missing:${missing.join(',')}`};const check=this.validateModel(skillId);if(!check.ok)return{ok:false,reason:check.reason};
    if(skillId==='align_to_pallet')return this.learnedAlign(args,context);if(skillId==='retreat')return this.learnedRetreat(context);
    if(skillId==='navigate_to_pallet'){const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};const path=await this.serviceAsync(context,'path.palletApproach',p),m=await this.learnedFollowPath(skillId,path,context,{tolerance:12,maxTicks:900});return m.ok?{ok:true,message:`approached ${p.label} (learned_bc)`,ticks:m.ticks,policy:'learned_bc',modelId:check.model.modelId||null}:{ok:false,reason:m.reason}}
    if(skillId==='navigate_to'){const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};const target=await this.serviceAsync(context,'target.locationApproach',l),path=await this.serviceAsync(context,'path.to',target),m=await this.learnedFollowPath(skillId,path,context,{tolerance:12,maxTicks:900});return m.ok?{ok:true,message:`followed path to ${l.label} (learned_bc)`,ticks:m.ticks,policy:'learned_bc',modelId:check.model.modelId||null}:{ok:false,reason:m.reason}}
    return{ok:false,reason:`unsupported_learned_runtime_skill:${skillId}`};
  }
}
