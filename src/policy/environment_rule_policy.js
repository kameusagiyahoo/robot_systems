import {RulePolicyBase} from './rule_policy_base.js';
import {densifyPath,purePursuitCommand} from '../control/pure_pursuit.js';

const angleWrap=d=>((d+180)%360+360)%360-180;
const deg2rad=d=>d*Math.PI/180;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const REFERENCE={wheelbase:52,bodyWidth:36,maxLinearSpeed:110,maxReverseSpeed:70};

export class EnvironmentRulePolicy extends RulePolicyBase{
  async serviceAsync(name,...args){return await Promise.resolve(this.service(name,...args))}
  scaleLength(referenceValue){const sim=this.controlConfig()||{},wheelbase=Math.max(1e-6,Number(sim.wheelbase)||REFERENCE.wheelbase);return Number(referenceValue)*wheelbase/REFERENCE.wheelbase}
  scaleForwardSpeed(referenceValue){const sim=this.controlConfig()||{},max=Math.max(1e-6,Number(sim.maxLinearSpeed)||REFERENCE.maxLinearSpeed);return Number(referenceValue)*max/REFERENCE.maxLinearSpeed}
  scaleReverseSpeed(referenceValue){const sim=this.controlConfig()||{},max=Math.max(1e-6,Number(sim.maxReverseSpeed)||REFERENCE.maxReverseSpeed);return Number(referenceValue)*max/REFERENCE.maxReverseSpeed}
  referenceMotion(){return{lengthScale:this.scaleLength(1),forwardSpeedScale:this.scaleForwardSpeed(1),reverseSpeedScale:this.scaleReverseSpeed(1),reference:{...REFERENCE}}}

  async driveTo(target,{tolerance=10,maxTicks=420,allowReverse=true,maxSpeedOverride=null,nativeTolerance=null,nativeMaxSpeed=null}={}){
    const s=this.state(),toleranceValue=Number.isFinite(Number(nativeTolerance))?Number(nativeTolerance):this.scaleLength(tolerance);
    for(let i=0;i<maxTicks;i++){
      const sim=this.controlConfig(),r=s.robot,dx=target.x-r.x,dy=target.y-r.y,d=Math.hypot(dx,dy);
      if(d<=toleranceValue){await this.act({type:'stop'});return{ok:true,ticks:i,distance:d,policy:'classic'}}
      const desired=Math.atan2(dy,dx)*180/Math.PI;let error=angleWrap(desired-r.yaw),reverse=false;
      if(allowReverse&&Math.abs(error)>105){reverse=true;error=angleWrap(error-(error>0?180:-180))}
      const steer=clamp(-error*.9,-sim.maxSteeringAngle,sim.maxSteeringAngle),headingScale=Math.max(.1,1-Math.abs(error)/100),baseLimit=reverse?sim.maxReverseSpeed:sim.maxLinearSpeed,scaledOverride=Number.isFinite(Number(nativeMaxSpeed))?Number(nativeMaxSpeed):(maxSpeedOverride==null?null:(reverse?this.scaleReverseSpeed(maxSpeedOverride):this.scaleForwardSpeed(maxSpeedOverride))),limit=scaledOverride==null?baseLimit:Math.min(baseLimit,scaledOverride),minApproach=reverse?this.scaleReverseSpeed(4):this.scaleForwardSpeed(4),approach=clamp(d*1.0,Math.min(minApproach,limit),limit),speedMag=Math.min(approach,limit*headingScale),speed=reverse?-speedMag:speedMag;
      const res=await this.act({type:'drive',speed,steeringAngle:steer,dt:sim.dt});if(!res?.ok){await this.act({type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}if(!sim.batchMode)await wait(16);
    }
    await this.act({type:'stop'});return{ok:false,reason:'motion_timeout'};
  }

  async followPathPurePursuit(waypoints,{maxTicks=1100}={}){
    const s=this.state(),dense=densifyPath(s.robot,waypoints,this.scaleLength(16));s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:dense,lookaheadTarget:null};this.emit();let cteSum=0;
    for(let i=0;i<maxTicks;i++){
      const cfg=this.controlConfig(),cmd=purePursuitCommand(s.robot,dense,{lookahead:cfg.lookaheadDistance,wheelbase:cfg.wheelbase,maxSteeringAngle:cfg.maxSteeringAngle,maxSpeed:Math.min(this.scaleForwardSpeed(92),cfg.maxLinearSpeed),minSpeed:Math.min(this.scaleForwardSpeed(8),cfg.maxLinearSpeed),goalTolerance:this.scaleLength(12)});s.path.index=cmd.index;s.path.lookaheadTarget=cmd.target;cteSum+=cmd.crossTrackError||0;this.emit();
      if(cmd.done){await this.act({type:'stop'});s.path.active=false;s.path.lookaheadTarget=null;this.emit();return{ok:true,ticks:i,meanCrossTrackError:i?cteSum/i:0,policy:'pure_pursuit'}}
      const res=await this.act({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:cfg.dt});if(!res?.ok){await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:res?.reason||'drive_failed'}}if(!cfg.batchMode)await wait(16);
    }
    await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:'motion_timeout'};
  }

  async followPathPid(waypoints,{maxTicks=1100}={}){
    const s=this.state(),dense=densifyPath(s.robot,waypoints,this.scaleLength(16));s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:dense,lookaheadTarget:null};this.pid.reset();this.emit();let cteSum=0;
    for(let i=0;i<maxTicks;i++){
      const sim=this.controlConfig(),cfg=sim.pid||{},cmd=this.pid.command(s.robot,dense,{...cfg,dt:sim.dt,maxSteeringAngle:sim.maxSteeringAngle,maxSpeed:Math.min(this.scaleForwardSpeed(88),sim.maxLinearSpeed),minSpeed:Math.min(this.scaleForwardSpeed(8),sim.maxLinearSpeed),goalTolerance:this.scaleLength(12)});s.path.index=cmd.index;s.path.lookaheadTarget=cmd.target;cteSum+=cmd.crossTrackError||0;this.emit();
      if(cmd.done){await this.act({type:'stop'});s.path.active=false;s.path.lookaheadTarget=null;this.emit();return{ok:true,ticks:i,meanCrossTrackError:i?cteSum/i:0,policy:'pid_path'}}
      const res=await this.act({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:sim.dt});if(!res?.ok){await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:res?.reason||'drive_failed'}}if(!sim.batchMode)await wait(16);
    }
    await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:'motion_timeout'};
  }

  async pathTo(target){if(this.hasService('path.to'))return await this.serviceAsync('path.to',target);return super.pathTo(target)}
  async palletApproachPath(pallet){if(this.hasService('path.palletApproach'))return await this.serviceAsync('path.palletApproach',pallet);const preAlign={x:pallet.x-this.scaleLength(170),y:pallet.y},staging={x:pallet.x-this.scaleLength(125),y:pallet.y};return[...await this.pathTo(preAlign),staging]}
  async palletDockTarget(pallet){return this.hasService('target.palletDock')?await this.serviceAsync('target.palletDock',pallet):{x:pallet.x-this.scaleLength(82),y:pallet.y,yaw:0}}
  async locationApproachTarget(location){return this.hasService('target.locationApproach')?await this.serviceAsync('target.locationApproach',location):{x:location.x-this.scaleLength(75),y:location.y}}
  async retreatTarget(robot=this.state().robot,distance=null){if(this.hasService('target.retreat'))return distance==null?await this.serviceAsync('target.retreat',robot):await this.serviceAsync('target.retreat',robot,distance);const d=distance==null?this.scaleLength(70):distance,a=deg2rad(robot.yaw);return{x:robot.x-Math.cos(a)*d,y:robot.y-Math.sin(a)*d}}

  async dockToPallet(pallet){const s=this.state(),path=await this.palletApproachPath(pallet),staging=path.at(-1)||{x:pallet.x-this.scaleLength(125),y:pallet.y},final=await this.palletDockTarget(pallet);let ticks=0;if(this.worldDistance(s.robot,staging)>this.scaleLength(16)){const stage=await this.driveTo(staging,{tolerance:12,maxTicks:360,allowReverse:true,maxSpeedOverride:34});ticks+=stage.ticks||0;if(!stage.ok)return stage}const finalMove=await this.driveTo(final,{tolerance:10,maxTicks:360,allowReverse:false,maxSpeedOverride:18});ticks+=finalMove.ticks||0;if(!finalMove.ok)return finalMove;const targetYaw=Number.isFinite(Number(final.yaw))?Number(final.yaw):0,yawError=Math.abs(angleWrap(s.robot.yaw-targetYaw));if(yawError>28)return{ok:false,reason:'alignment_heading_error',ticks,yawError};return{ok:true,ticks,yawError,policy:'rule_staged'}}

  async detectPallet(palletId,pallet){
    if(this.hasService('perception.detectPallet')){
      const result=await this.serviceAsync('perception.detectPallet',{palletId,target:{id:palletId,label:pallet?.label||palletId}});if(result?.ok===false)return result;if(!result?.detected)return{ok:false,reason:result?.reason||'pallet_not_detected',detection:result||null};
      if(this.hasService('perception.markDetected'))await this.serviceAsync('perception.markDetected',palletId);return{ok:true,message:`${pallet?.label||palletId} detected`,detection:result,policy:'perception_service'};
    }
    const env=this.environment?.describe?.()||{},smoke=env.fidelity==='smoke_test'||env.capabilities?.groundTruthPerception===true;
    if(smoke&&this.hasService('perception.palletVisible')){const d=this.worldDistance(this.state().robot,pallet),visible=await this.serviceAsync('perception.palletVisible',pallet,this.state().robot);if(!visible)return{ok:false,reason:'pallet_not_visible'};if(this.hasService('perception.markDetected'))await this.serviceAsync('perception.markDetected',palletId);return{ok:true,message:`${pallet?.label||palletId} detected by smoke-test ground truth (${d.toFixed(1)} ${this.lengthUnit()})`,detection:{detected:true,source:'ground_truth_smoke'}}}
    if(env.capabilities?.sensorRead&&(env.capabilities?.rgb||env.capabilities?.depth||env.capabilities?.lidar))return{ok:false,reason:'perception_inference_backend_unavailable'};
    return{ok:false,reason:'perception_detection_service_unavailable'};
  }

  async execute(skill,args={}){
    const s=this.state(),sim=this.controlConfig();
    switch(skill){
      case'navigate_to_pallet':{const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};const path=await this.palletApproachPath(p),m=await this.followPath(path,{tolerance:12,maxTicks:1100});return m.ok?{ok:true,message:`approached ${p.label} via pre-align path (${sim.controller})`,ticks:m.ticks,meanCrossTrackError:m.meanCrossTrackError??null,policy:m.policy}:{ok:false,reason:m.reason}}
      case'detect_pallet':{const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures?.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};return await this.detectPallet(args.palletId,p)}
      case'align_to_pallet':{const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures?.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};const m=await this.dockToPallet(p);if(!m.ok)return{ok:false,reason:m.reason,yawError:m.yawError??null};if(this.hasService('robot.setAligned'))await this.serviceAsync('robot.setAligned',true);else{s.robot.aligned=true;this.emit()}return{ok:true,message:`aligned by ${m.policy} (yaw error ${m.yawError.toFixed(1)}°)`,ticks:m.ticks,policy:m.policy}}
      case'insert_forks':{if(s.failures?.forceInsertionFailure)return{ok:false,reason:'forced_insertion_failure'};if(this.hasService('manipulation.insertForks'))return await this.serviceAsync('manipulation.insertForks',args.palletId);return{ok:false,reason:'manipulation_insert_forks_service_unavailable'}}
      case'lift':{if(this.hasService('manipulation.setFork'))return await this.serviceAsync('manipulation.setFork',true);const res=await this.act({type:'fork',raised:true});return res?.ok===false?res:{ok:true,message:'pallet lifted'}}
      case'navigate_to':{const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};const target=await this.locationApproachTarget(l),path=await this.pathTo(target),m=await this.followPath(path,{tolerance:12,maxTicks:1100});return m.ok?{ok:true,message:`followed path to ${l.label} (${sim.controller})`,ticks:m.ticks,meanCrossTrackError:m.meanCrossTrackError??null,policy:m.policy}:{ok:false,reason:m.reason}}
      case'place':{const id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};if(this.hasService('manipulation.place'))return await this.serviceAsync('manipulation.place',id,args.locationId);return{ok:false,reason:'manipulation_place_service_unavailable'}}
      case'retreat':{const target=await this.retreatTarget(s.robot),m=await this.driveTo(target,{tolerance:10,maxTicks:320,allowReverse:true,maxSpeedOverride:30});if(!m.ok)return{ok:false,reason:m.reason};if(this.hasService('agent.markRetreated'))await this.serviceAsync('agent.markRetreated',true);else{s.agent.memory.retreated=true;this.emit()}return{ok:true,message:'retreated in reverse',ticks:m.ticks,policy:'classic'}}
      case'avoid_obstacle':if(this.hasService('agent.setAlternateRoute'))await this.serviceAsync('agent.setAlternateRoute',true);else{s.agent.memory.alternateRoute=true;this.emit()}return{ok:true,message:'alternate waypoint route enabled'};
      case'reposition_for_detection':{const yaw=deg2rad(s.robot.yaw),offset=this.scaleLength(45),target={x:s.robot.x-Math.sin(yaw)*offset,y:s.robot.y+Math.cos(yaw)*offset},m=await this.driveTo(target,{tolerance:10,maxTicks:260,allowReverse:true,maxSpeedOverride:28});return m.ok?{ok:true,message:'repositioned for another detection attempt'}:{ok:false,reason:m.reason}}
      default:return super.execute(skill,args);
    }
  }
}
