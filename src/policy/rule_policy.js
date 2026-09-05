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
  constructor(store,robot){super(store,robot);this.pid=new PIDPathController()}

  async driveTo(target,{tolerance=10,maxTicks=420,allowReverse=true,maxSpeedOverride=null}={}){
    const s=this.store.state;
    for(let i=0;i<maxTicks;i++){
      const r=s.robot,dx=target.x-r.x,dy=target.y-r.y,d=Math.hypot(dx,dy);
      if(d<=tolerance){this.robot.sendAction({type:'stop'});return{ok:true,ticks:i,distance:d,policy:'classic'}}
      const desired=Math.atan2(dy,dx)*180/Math.PI;let error=angleWrap(desired-r.yaw),reverse=false;
      if(allowReverse&&Math.abs(error)>105){reverse=true;error=angleWrap(error-(error>0?180:-180))}
      const steer=clamp(-error*0.9,-s.simulation.maxSteeringAngle,s.simulation.maxSteeringAngle),headingScale=Math.max(0.1,1-Math.abs(error)/100),baseLimit=reverse?s.simulation.maxReverseSpeed:s.simulation.maxLinearSpeed,limit=maxSpeedOverride?Math.min(baseLimit,maxSpeedOverride):baseLimit,approach=clamp(d*1.0,4,limit),speedMag=Math.min(approach,limit*headingScale),speed=reverse?-speedMag:speedMag;
      const res=this.robot.sendAction({type:'drive',speed,steeringAngle:steer,dt:s.simulation.dt});
      if(!res.ok){this.robot.sendAction({type:'stop'});return{ok:false,reason:res.reason||'drive_failed'}}
      if(!s.simulation.batchMode)await wait(16);
    }
    this.robot.sendAction({type:'stop'});return{ok:false,reason:'motion_timeout'};
  }

  async followPathPurePursuit(waypoints,{maxTicks=1100}={}){
    const s=this.store.state,dense=densifyPath(s.robot,waypoints,16);
    s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:dense,lookaheadTarget:null};this.store.emit();
    let cteSum=0;
    for(let i=0;i<maxTicks;i++){
      const cmd=purePursuitCommand(s.robot,dense,{lookahead:s.simulation.lookaheadDistance,wheelbase:s.simulation.wheelbase,maxSteeringAngle:s.simulation.maxSteeringAngle,maxSpeed:Math.min(92,s.simulation.maxLinearSpeed),minSpeed:8,goalTolerance:12});
      s.path.index=cmd.index;s.path.lookaheadTarget=cmd.target;cteSum+=cmd.crossTrackError||0;this.store.emit();
      if(cmd.done){this.robot.sendAction({type:'stop'});s.path.active=false;s.path.lookaheadTarget=null;this.store.emit();return{ok:true,ticks:i,meanCrossTrackError:i?cteSum/i:0,policy:'pure_pursuit'}}
      const res=this.robot.sendAction({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:s.simulation.dt});
      if(!res.ok){this.robot.sendAction({type:'stop'});s.path.active=false;this.store.emit();return{ok:false,reason:res.reason||'drive_failed'}}
      if(!s.simulation.batchMode)await wait(16);
    }
    this.robot.sendAction({type:'stop'});s.path.active=false;this.store.emit();return{ok:false,reason:'motion_timeout'};
  }

  async followPathPid(waypoints,{maxTicks=1100}={}){
    const s=this.store.state,dense=densifyPath(s.robot,waypoints,16);
    s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:dense,lookaheadTarget:null};this.pid.reset();this.store.emit();
    let cteSum=0;
    for(let i=0;i<maxTicks;i++){
      const cfg=s.simulation.pid||{},cmd=this.pid.command(s.robot,dense,{...cfg,dt:s.simulation.dt,maxSteeringAngle:s.simulation.maxSteeringAngle,maxSpeed:Math.min(88,s.simulation.maxLinearSpeed),minSpeed:8,goalTolerance:12});
      s.path.index=cmd.index;s.path.lookaheadTarget=cmd.target;cteSum+=cmd.crossTrackError||0;this.store.emit();
      if(cmd.done){this.robot.sendAction({type:'stop'});s.path.active=false;s.path.lookaheadTarget=null;this.store.emit();return{ok:true,ticks:i,meanCrossTrackError:i?cteSum/i:0,policy:'pid_path'}}
      const res=this.robot.sendAction({type:'drive',speed:cmd.speed,steeringAngle:cmd.steeringAngle,dt:s.simulation.dt});
      if(!res.ok){this.robot.sendAction({type:'stop'});s.path.active=false;this.store.emit();return{ok:false,reason:res.reason||'drive_failed'}}
      if(!s.simulation.batchMode)await wait(16);
    }
    this.robot.sendAction({type:'stop'});s.path.active=false;this.store.emit();return{ok:false,reason:'motion_timeout'};
  }

  async followPath(waypoints,opts={}){
    const s=this.store.state;
    if(s.simulation.controller==='pure_pursuit'&&waypoints.length>0)return this.followPathPurePursuit(waypoints,opts);
    if(s.simulation.controller==='pid_path'&&waypoints.length>0)return this.followPathPid(waypoints,opts);
    s.path={active:true,index:0,waypoints:waypoints.map(p=>({...p})),densePoints:[],lookaheadTarget:null};this.store.emit();
    let ticks=0;
    for(let i=0;i<waypoints.length;i++){
      s.path.index=i;this.store.emit();const m=await this.driveTo(waypoints[i],opts);ticks+=m.ticks||0;
      if(!m.ok){s.path.active=false;this.store.emit();return m}
    }
    s.path.active=false;s.path.index=waypoints.length;this.store.emit();return{ok:true,ticks,policy:'rule_waypoint'};
  }

  pathTo(target){
    const s=this.store.state;
    if(!s.obstacle.enabled||s.agent.memory.alternateRoute||!segmentHitsRect(s.robot,target,s.obstacle))return[target];
    const margin=70,topY=Math.max(60,s.obstacle.y-margin),bottomY=Math.min(500,s.obstacle.y+s.obstacle.h+margin),chooseTop=Math.abs(s.robot.y-topY)+Math.abs(target.y-topY)<=Math.abs(s.robot.y-bottomY)+Math.abs(target.y-bottomY),y=chooseTop?topY:bottomY;
    return[{x:s.obstacle.x-margin,y},{x:s.obstacle.x+s.obstacle.w+margin,y},target];
  }

  palletApproachPath(p){const preAlign={x:p.x-170,y:p.y},staging={x:p.x-125,y:p.y};const base=this.pathTo(preAlign);return[...base,staging]}

  async dockToPallet(p){
    const s=this.store.state,staging={x:p.x-125,y:p.y},final={x:p.x-82,y:p.y};let ticks=0;
    if(distance(s.robot,staging)>16){const stage=await this.driveTo(staging,{tolerance:12,maxTicks:360,allowReverse:true,maxSpeedOverride:34});ticks+=stage.ticks||0;if(!stage.ok)return stage}
    const finalMove=await this.driveTo(final,{tolerance:10,maxTicks:360,allowReverse:false,maxSpeedOverride:18});ticks+=finalMove.ticks||0;if(!finalMove.ok)return finalMove;
    const yawError=Math.abs(angleWrap(s.robot.yaw));if(yawError>28)return{ok:false,reason:'alignment_heading_error',ticks,yawError};
    return{ok:true,ticks,yawError,policy:'rule_staged'};
  }

  async execute(skill,args={}){
    const s=this.store.state;
    switch(skill){
      case'navigate_to_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
        const m=await this.followPath(this.palletApproachPath(p),{tolerance:12,maxTicks:1100});
        return m.ok?{ok:true,message:`approached ${p.label} via pre-align path (${s.simulation.controller})`,ticks:m.ticks,meanCrossTrackError:m.meanCrossTrackError??null,policy:m.policy}:{ok:false,reason:m.reason};
      }
      case'detect_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};
        const d=distance(s.robot,p);if(d>=180)return{ok:false,reason:'pallet_not_visible'};if(!s.perception.detectedPallets.includes(args.palletId))s.perception.detectedPallets.push(args.palletId);this.store.emit();return{ok:true,message:`${p.label} detected (${d.toFixed(0)} px)`};
      }
      case'align_to_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};
        const m=await this.dockToPallet(p);if(!m.ok)return{ok:false,reason:m.reason,yawError:m.yawError??null};s.robot.aligned=true;this.store.emit();return{ok:true,message:`aligned by ${m.policy} (yaw error ${m.yawError.toFixed(1)}°)`,ticks:m.ticks,policy:m.policy};
      }
      case'insert_forks':
        if(s.failures.forceInsertionFailure)return{ok:false,reason:'forced_insertion_failure'};s.robot.carrying=args.palletId;s.pallets[args.palletId].status='on_forks';this.store.emit();return{ok:true,message:'forks inserted'};
      case'lift':
        this.robot.sendAction({type:'fork',raised:true});return{ok:true,message:'pallet lifted'};
      case'navigate_to':{
        const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};
        const target={x:l.x-75,y:l.y},m=await this.followPath(this.pathTo(target),{tolerance:12,maxTicks:1100});
        return m.ok?{ok:true,message:`followed path to ${l.label} (${s.simulation.controller})`,ticks:m.ticks,meanCrossTrackError:m.meanCrossTrackError??null,policy:m.policy}:{ok:false,reason:m.reason};
      }
      case'place':{
        const l=s.locations[args.locationId],id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};s.pallets[id].x=l.x;s.pallets[id].y=l.y;s.pallets[id].status='placed';s.robot.carrying=null;s.robot.forkRaised=false;s.robot.aligned=false;this.store.emit();return{ok:true,message:`placed at ${l.label}`};
      }
      case'retreat':{
        const yaw=deg2rad(s.robot.yaw),target={x:s.robot.x-Math.cos(yaw)*70,y:s.robot.y-Math.sin(yaw)*70},m=await this.driveTo(target,{tolerance:10,maxTicks:320,allowReverse:true,maxSpeedOverride:30});
        if(!m.ok)return{ok:false,reason:m.reason};s.agent.memory.retreated=true;this.store.emit();return{ok:true,message:'retreated in reverse',ticks:m.ticks,policy:'classic'};
      }
      case'avoid_obstacle':
        s.agent.memory.alternateRoute=true;this.store.emit();return{ok:true,message:'alternate waypoint route enabled'};
      case'reposition_for_detection':{
        const yaw=deg2rad(s.robot.yaw),target={x:s.robot.x-Math.sin(yaw)*45,y:s.robot.y+Math.cos(yaw)*45},m=await this.driveTo(target,{tolerance:10,maxTicks:260,allowReverse:true,maxSpeedOverride:28});return m.ok?{ok:true,message:'repositioned for another detection attempt'}:{ok:false,reason:m.reason};
      }
      default:return{ok:false,reason:`unsupported_policy_skill:${skill}`};
    }
  }
}
