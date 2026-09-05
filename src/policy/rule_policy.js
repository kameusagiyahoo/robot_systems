import {PolicyInterface} from './policy_interface.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentHitsRect=(a,b,r)=>{const steps=40;for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return true;}return false;};
const angleWrap=d=>((d+180)%360+360)%360-180;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class RulePolicy extends PolicyInterface {
  async driveTo(target,{tolerance=10,maxTicks=320}={}){
    const s=this.store.state;
    for(let i=0;i<maxTicks;i++){
      const r=s.robot,dx=target.x-r.x,dy=target.y-r.y,d=Math.hypot(dx,dy);
      if(d<=tolerance){this.robot.sendAction({type:'stop'});return{ok:true,ticks:i,distance:d};}
      const desired=Math.atan2(dy,dx)*180/Math.PI;
      const error=angleWrap(desired-r.yaw);
      // Rear-wheel steering: steering sign is opposite to desired yaw direction.
      const steeringAngle=clamp(-error*0.9,-s.simulation.maxSteeringAngle,s.simulation.maxSteeringAngle);
      const headingScale=Math.max(0.12,1-Math.abs(error)/105);
      const speed=Math.min(s.simulation.maxLinearSpeed,Math.max(20,d*1.8))*headingScale;
      const driveResult=this.robot.sendAction({type:'drive',speed,steeringAngle,dt:s.simulation.dt});
      if(!driveResult.ok){this.robot.sendAction({type:'stop'});return{ok:false,reason:driveResult.reason||'drive_failed'};}
      await wait(16);
    }
    this.robot.sendAction({type:'stop'});
    return{ok:false,reason:'motion_timeout'};
  }

  async execute(skill,args={}){
    const s=this.store.state;
    switch(skill){
      case 'navigate_to_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
        const target={x:p.x-105,y:p.y};
        if(s.obstacle.enabled&&!s.agent.memory.alternateRoute&&segmentHitsRect(s.robot,target,s.obstacle))return{ok:false,reason:'path_blocked'};
        const m=await this.driveTo(target,{tolerance:12});
        return m.ok?{ok:true,message:`approached ${p.label} with rear-steer kinematics`,ticks:m.ticks}:{ok:false,reason:m.reason};
      }
      case 'detect_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
        if(s.failures.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};
        const d=distance(s.robot,p);if(d>=180)return{ok:false,reason:'pallet_not_visible'};
        if(!s.perception.detectedPallets.includes(args.palletId))s.perception.detectedPallets.push(args.palletId);
        this.store.emit();return{ok:true,message:`${p.label} detected (${d.toFixed(0)} px)`};
      }
      case 'align_to_pallet':{
        const p=s.pallets[args.palletId];if(!p)return{ok:false,reason:'pallet_not_found'};
        if(s.failures.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};
        const m=await this.driveTo({x:p.x-82,y:p.y},{tolerance:5,maxTicks:220});
        if(!m.ok)return{ok:false,reason:m.reason};
        s.robot.aligned=true;this.store.emit();return{ok:true,message:'aligned to pallet with rear-steer motion'};
      }
      case 'insert_forks':{
        if(s.failures.forceInsertionFailure)return{ok:false,reason:'forced_insertion_failure'};
        s.robot.carrying=args.palletId;s.pallets[args.palletId].status='on_forks';this.store.emit();return{ok:true,message:'forks inserted'};
      }
      case 'lift':this.robot.sendAction({type:'fork',raised:true});return{ok:true,message:'pallet lifted'};
      case 'navigate_to':{
        const l=s.locations[args.locationId];if(!l)return{ok:false,reason:'location_not_found'};
        const target={x:l.x-75,y:l.y};
        if(s.obstacle.enabled&&!s.agent.memory.alternateRoute&&segmentHitsRect(s.robot,target,s.obstacle))return{ok:false,reason:'path_blocked'};
        const m=await this.driveTo(target,{tolerance:12,maxTicks:480});
        return m.ok?{ok:true,message:`navigated to ${l.label}${s.agent.memory.alternateRoute?' via alternate route':''}`,ticks:m.ticks}:{ok:false,reason:m.reason};
      }
      case 'place':{
        const l=s.locations[args.locationId],id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};
        s.pallets[id].x=l.x;s.pallets[id].y=l.y;s.pallets[id].status='placed';s.robot.carrying=null;s.robot.forkRaised=false;s.robot.aligned=false;this.store.emit();return{ok:true,message:`placed at ${l.label}`};
      }
      case 'retreat':{
        const yaw=s.robot.yaw*Math.PI/180;
        const target={x:s.robot.x-Math.cos(yaw)*70,y:s.robot.y-Math.sin(yaw)*70};
        const m=await this.driveTo(target,{tolerance:8,maxTicks:220});
        if(!m.ok)return{ok:false,reason:m.reason};
        s.agent.memory.retreated=true;this.store.emit();return{ok:true,message:'retreated with vehicle kinematics'};
      }
      case 'avoid_obstacle':{
        const sideY=Math.max(70,Math.min(490,s.obstacle.y-95));
        const m=await this.driveTo({x:s.robot.x,y:sideY},{tolerance:10,maxTicks:320});
        if(!m.ok)return{ok:false,reason:m.reason};
        s.agent.memory.alternateRoute=true;this.store.emit();return{ok:true,message:'moved to alternate corridor'};
      }
      case 'reposition_for_detection':{
        const yaw=s.robot.yaw*Math.PI/180;
        const target={x:s.robot.x-Math.sin(yaw)*45,y:s.robot.y+Math.cos(yaw)*45};
        const m=await this.driveTo(target,{tolerance:8,maxTicks:180});
        return m.ok?{ok:true,message:'repositioned for another detection attempt'}:{ok:false,reason:m.reason};
      }
      default:return{ok:false,reason:`unsupported_policy_skill:${skill}`};
    }
  }
}
