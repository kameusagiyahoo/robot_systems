import {PolicyInterface} from './policy_interface.js';
import {densifyPath,purePursuitCommand} from '../control/pure_pursuit.js';
import {PIDPathController} from '../control/pid_path.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentHitsRect=(a,b,r)=>{const steps=40;for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return true}return false};
const angleWrap=d=>((d+180)%360+360)%360-180;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const deg2rad=d=>d*Math.PI/180;

export class RulePolicy extends PolicyInterface{
  constructor(store,robot,{environment=null,domainServices=null}={}){super(store,robot);this.pid=new PIDPathController();this.environment=environment;this.domainServices=domainServices}
  state(){return this.environment?.getState?.()||this.store.state}
  environmentServices(){return this.environment?.getDomainServices?.()||{}}
  hasService(name){return typeof this.environmentServices()[name]==='function'||!!this.domainServices?.has?.(name)}
  service(name,...args){const fn=this.environmentServices()[name];if(typeof fn==='function')return fn(...args);if(this.domainServices?.has?.(name))return this.domainServices.call(name,...args);throw new Error(`policy_domain_service_missing:${name}`)}
  emit(){if(this.hasService('state.emit'))return this.service('state.emit');return this.store.emit()}
  controlConfig(){return this.hasService('control.config')?this.service('control.config'):this.state().simulation}
  async act(action){if(this.environment?.step)return await this.environment.step(action);return await Promise.resolve(this.robot.sendAction(action))}
  lengthUnit(){return this.environment?.describe?.()?.units?.length||'unit'}
  worldDistance(a,b){return this.hasService('world.distance')?this.service('world.distance',a,b):distance(a,b)}

  async driveTo(target,{tolerance=10,maxTicks=420,allowReverse=true,maxSpeedOverride=null}={}){
    const s=this.state();
    for(let i=0;i<maxTicks;i++){
      const sim=this.controlConfig(),r=s.robot,dx=target.x-r.x,dy=target.y-r.y,d=Math.hypot(dx,dy);
      if(d<=tolerance){await this.act({type:'stop'});return{ok:true,ticks:i,distance:d,policy:'classic'}}
      const desired=Math.atan2(dy,dx)*180/Math.PI;let error=angleWrap(desired-r.yaw),reverse=false;
      if(allowReverse&&Math.abs(error)>105){reverse=true;error=angleWrap(error-(error>0?180:-180))}
      const steer=clamp(-error*0.9,-sim.maxSteeringAngle,sim.maxSteeringAngle),headingScale=Math.max(0.1,1-Math.abs(error)/100),baseLimit=reverse?sim.maxReverseSpeed:sim.maxLinearSpeed,limit=maxSpeedOverride?Math.min(baseLimit,maxSpeedOverride):baseLimit,approach=clamp(d*1.0,4,limit),speedMag=Math.min(approach,limit*headingScale),speed=reverse?-speedMag:speedMag;
      const res=await this.act({type:'drive',speed,steeringAngle:steer,dt:sim.dt});
      if(!res?.ok){await this.act({type:'stop'});return{ok:false,reason:res?.reason||'drive_failed'}}
      if(!sim.batchMode)await wait(16);
    }
    await this.act({type:'stop'});return{ok:false,reason:'motion_timeout'};
  }

  async followPathPurePursuit(waypoints,{maxTicks=1100}={}){
    const s=this.state(),sim=this.controlConfig(),dense=densifyPath(s.robot,waypoints,16);
    s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:dense,lookaheadTarget:null};this.emit();
    let cteSum=0;
    for(let i=0;i<maxTicks;i++){
      const cfg=this.controlConfig(),cmd=purePursuitCommand(s.robot,dense,{lookahead:cfg.lookaheadDistance,wheelbase:cfg.wheelbase,maxSteeringAngle:cfg.maxSteeringAngle,maxSpeed:Math.min(92,cfg.maxLinearSpeed),minSpeed:8,goalTolerance:12});
      s.path.index=cmd.index;s.path.lookaheadTarget=cmd.target;cteSum+=cmd.crossTrackError||0;this.emit();
      if(cmd.done){await this.act({type:'stop'});s.path.active=false;s.path.lookaheadTarget=null;this.emit();return{ok:true,ticks:i,meanCrossTrackError:i?cteSum/i:0,policy:'pure_pursuit'}}
      const res=await this.act({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:cfg.dt});
      if(!res?.ok){await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:res?.reason||'drive_failed'}}
      if(!cfg.batchMode)await wait(16);
    }
    await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:'motion_timeout'};
  }

  async followPathPid(waypoints,{maxTicks=1100}={}){
    const s=this.state(),dense=densifyPath(s.robot,waypoints,16);
    s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:dense,lookaheadTarget:null};this.pid.reset();this.emit();
    let cteSum=0;
    for(let i=0;i<maxTicks;i++){
      const sim=this.controlConfig(),cfg=sim.pid||{},cmd=this.pid.command(s.robot,dense,{...cfg,dt:sim.dt,maxSteeringAngle:sim.maxSteeringAngle,maxSpeed:Math.min(88,sim.maxLinearSpeed),minSpeed:8,goalTolerance:12});
      s.path.index=cmd.index;s.path.lookaheadTarget=cmd.target;cteSum+=cmd.crossTrackError||0;this.emit();
      if(cmd.done){await this.act({type:'stop'});s.path.active=false;s.path.lookaheadTarget=null;this.emit();return{ok:true,ticks:i,meanCrossTrackError:i?cteSum/i:0,policy:'pid_path'}}
      const res=await this.act({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:sim.dt});
      if(!res?.ok){await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:res?.reason||'drive_failed'}}
      if(!sim.batchMode)await wait(16);
    }
    await this.act({type:'stop'});s.path.active=false;this.emit();return{ok:false,reason:'motion_timeout'};
  }

  async followPath(waypoints,opts={}){
    const s=this.state(),sim=this.controlConfig();
    if(sim.controller==='pure_pursuit'&&waypoints.length>0)return this.followPathPurePursuit(waypoints,opts);
    if(sim.controller==='pid_path'&&waypoints.length>0)return this.followPathPid(waypoints,opts);
    s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:[],lookaheadTarget:null};this.emit();
    let ticks=0;
    for(let i=0;i<waypoints.length;i++){s.path.index=i;this.emit();const m=await this.driveTo(waypoints[i],opts);ticks+=m.ticks||0;if(!m.ok){s.path.active=false;this.emit();return m}}
    s.path.active=false;s.path.index=waypoints.length;this.emit();return{ok:true,ticks,policy:'rule_waypoint'};
  }

  pathTo(target){
    if(this.hasService('path.to'))return this.service('path.to',target);
    const s=this.state();if(!s.obstacle?.enabled||s.agent.memory.alternateRoute||!segmentHitsRect(s.robot,target,s.obstacle))return[target];
    const margin=70,topY=Math.max(60,s.obstacle.y-margin),bottomY=Math.min(500,s.obstacle.y+s.obstacle.h+margin),chooseTop=Math.abs(s.robot.y-topY)+Math.abs(target.y-topY)<=Math.abs(s.robot.y-bottomY)+Math.abs(target.y-bottomY),y=chooseTop?topY:bottomY;
    return[{x:s.obstacle.x-margin,y},{x:s.obstacle.x+s.obstacle.w+margin,y},target];
  }
  palletApproachPath(p){if(this.hasService('path.palletApproach'))return this.service('path.palletApproach',p);const preAlign={x:p.x-170,y:p.y},staging={x:p.x-125,y:p.y};return[...this.pathTo(preAlign),staging]}
  palletDockTarget(p){return this.hasService('target.palletDock')?this.service('target.palletDock',p):{x:p.x-82,y:p.y,yaw:0}}
  locationApproachTarget(l){return this.hasService('target.locationApproach')?this.service('target.locationApproach',l):{x:l.x-75,y:l.y}}
  retreatTarget(robot=this.state().robot,d=70){if(this.hasService('target.retreat'))return this.service('target.retreat',robot,d);const yaw=deg2rad(robot.yaw);return{x:robot.x-Math.cos(yaw)*d,y:robot.y-Math.sin(yaw)*d}}

  async dockToPallet(p){
    const s=this.state(),path=this.palletApproachPath(p),staging=path.at(-1)||{x:p.x-125,y:p.y},final=this.palletDockTarget(p);let ticks=0;
    if(this.worldDistance(s.robot,staging)>16){const stage=await this.driveTo(staging,{tolerance:12,maxTicks:360,allowReverse:true,maxSpeedOverride:34});ticks+=stage.ticks||0;if(!stage.ok)return stage}
    const finalMove=await this.driveTo(final,{tolerance:10,maxTicks:360,allowReverse:false,maxSpeedOverride:18});ticks+=finalMove.ticks||0;if(!finalMove.ok)return finalMove;
    const targetYaw=Number.isFinite(Number(final.yaw))?Number(final.yaw):0,yawError=Math.abs(angleWrap(s.robot.yaw-targetYaw));if(yawError>28)return{ok:false,reason:'alignment_heading_error',ticks,yawError};
    return{ok:true,ticks,yawError,policy:'rule_staged'};
  }

  async execute(skill,args={}){
    const s=this.state(),sim=this.controlConfig();
    switch(skill){
      case'navigate_to_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
        const m=await this.followPath(this.palletApproachPath(p),{tolerance:12,maxTicks:1100});
        return m.ok?{ok:true,message:`approached ${p.label} via pre-align path (${sim.controller})`,ticks:m.ticks,meanCrossTrackError:m.meanCrossTrackError??null,policy:m.policy}:{ok:false,reason:m.reason};
      }
      case'detect_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures?.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};
        const d=this.worldDistance(s.robot,p),visible=this.hasService('perception.palletVisible')?this.service('perception.palletVisible',p,s.robot):d<180;if(!visible)return{ok:false,reason:'pallet_not_visible'};
        if(this.hasService('perception.markDetected'))this.service('perception.markDetected',args.palletId);else if(!s.perception.detectedPallets.includes(args.palletId)){s.perception.detectedPallets.push(args.palletId);this.emit()}
        return{ok:true,message:`${p.label} detected (${d.toFixed(1)} ${this.lengthUnit()})`};
      }
      case'align_to_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures?.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};
        const m=await this.dockToPallet(p);if(!m.ok)return{ok:false,reason:m.reason,yawError:m.yawError??null};
        if(this.hasService('robot.setAligned'))this.service('robot.setAligned',true);else{s.robot.aligned=true;this.emit()}
        return{ok:true,message:`aligned by ${m.policy} (yaw error ${m.yawError.toFixed(1)}°)`,ticks:m.ticks,policy:m.policy};
      }
      case'insert_forks':{
        if(s.failures?.forceInsertionFailure)return{ok:false,reason:'forced_insertion_failure'};
        if(this.hasService('manipulation.insertForks'))return await Promise.resolve(this.service('manipulation.insertForks',args.palletId));
        s.robot.carrying=args.palletId;s.pallets[args.palletId].status='on_forks';this.emit();return{ok:true,message:'forks inserted'};
      }
      case'lift':{
        if(this.hasService('manipulation.setFork'))return await Promise.resolve(this.service('manipulation.setFork',true));
        const res=await this.act({type:'fork',raised:true});return res?.ok===false?res:{ok:true,message:'pallet lifted'};
      }
      case'navigate_to':{
        const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};
        const target=this.locationApproachTarget(l),m=await this.followPath(this.pathTo(target),{tolerance:12,maxTicks:1100});
        return m.ok?{ok:true,message:`followed path to ${l.label} (${sim.controller})`,ticks:m.ticks,meanCrossTrackError:m.meanCrossTrackError??null,policy:m.policy}:{ok:false,reason:m.reason};
      }
      case'place':{
        const l=s.locations[args.locationId],id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};
        if(this.hasService('manipulation.place'))return await Promise.resolve(this.service('manipulation.place',id,args.locationId));
        s.pallets[id].x=l.x;s.pallets[id].y=l.y;s.pallets[id].status='placed';s.robot.carrying=null;s.robot.forkRaised=false;s.robot.aligned=false;this.emit();return{ok:true,message:`placed at ${l.label}`};
      }
      case'retreat':{
        const target=this.retreatTarget(s.robot,70),m=await this.driveTo(target,{tolerance:10,maxTicks:320,allowReverse:true,maxSpeedOverride:30});
        if(!m.ok)return{ok:false,reason:m.reason};if(this.hasService('agent.markRetreated'))this.service('agent.markRetreated',true);else{s.agent.memory.retreated=true;this.emit()}return{ok:true,message:'retreated in reverse',ticks:m.ticks,policy:'classic'};
      }
      case'avoid_obstacle':
        if(this.hasService('agent.setAlternateRoute'))this.service('agent.setAlternateRoute',true);else{s.agent.memory.alternateRoute=true;this.emit()}return{ok:true,message:'alternate waypoint route enabled'};
      case'reposition_for_detection':{
        const yaw=deg2rad(s.robot.yaw),target={x:s.robot.x-Math.sin(yaw)*45,y:s.robot.y+Math.cos(yaw)*45},m=await this.driveTo(target,{tolerance:10,maxTicks:260,allowReverse:true,maxSpeedOverride:28});return m.ok?{ok:true,message:'repositioned for another detection attempt'}:{ok:false,reason:m.reason};
      }
      default:return{ok:false,reason:`unsupported_policy_skill:${skill}`};
    }
  }
}
