import {PolicyInterface} from './policy_interface.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentHitsRect=(a,b,r)=>{const steps=40;for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return true;}return false;};
const angleWrap=d=>((d+180)%360+360)%360-180;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class RulePolicy extends PolicyInterface {
  async driveTo(target,{tolerance=10,maxTicks=240}={}){
    const s=this.store.state;
    for(let i=0;i<maxTicks;i++){
      const r=s.robot,dx=target.x-r.x,dy=target.y-r.y,d=Math.hypot(dx,dy);
      if(d<=tolerance){this.robot.sendAction({type:'stop'});return{ok:true,ticks:i,distance:d};}
      const desired=Math.atan2(dy,dx)*180/Math.PI;
      const error=angleWrap(desired-r.yaw);
      const angular=Math.max(-s.simulation.maxAngularSpeed,Math.min(s.simulation.maxAngularSpeed,error*4));
      const headingScale=Math.max(0.15,1-Math.abs(error)/120);
      const linear=Math.min(s.simulation.maxLinearSpeed,Math.max(24,d*2))*headingScale;
      this.robot.sendAction({type:'velocity',linear,angular,dt:s.simulation.dt});
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
        return m.ok?{ok:true,message:`approached ${p.label} continuously`,ticks:m.ticks}:{ok:false,reason:m.reason};
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
        const m=await this.driveTo({x:p.x-82,y:p.y},{tolerance:5,maxTicks:160});
        if(!m.ok)return{ok:false,reason:m.reason};
        s.robot.aligned=true;this.store.emit();return{ok:true,message:'aligned to pallet with continuous motion'};
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
        const m=await this.driveTo(target,{tolerance:12,maxTicks:360});
        return m.ok?{ok:true,message:`navigated continuously to ${l.label}${s.agent.memory.alternateRoute?' via alternate route':''}`,ticks:m.ticks}:{ok:false,reason:m.reason};
      }
      case 'place':{
        const l=s.locations[args.locationId],id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};
        s.pallets[id].x=l.x;s.pallets[id].y=l.y;s.pallets[id].status='placed';s.robot.carrying=null;s.robot.forkRaised=false;s.robot.aligned=false;this.store.emit();return{ok:true,message:`placed at ${l.label}`};
      }
      case 'retreat':{
        const yaw=s.robot.yaw*Math.PI/180;
        const target={x:s.robot.x-Math.cos(yaw)*70,y:s.robot.y-Math.sin(yaw)*70};
        const m=await this.driveTo(target,{tolerance:8,maxTicks:140});
        if(!m.ok)return{ok:false,reason:m.reason};
        s.agent.memory.retreated=true;this.store.emit();return{ok:true,message:'retreated continuously'};
      }
      case 'avoid_obstacle':{
        const sideY=Math.max(65,Math.min(495,s.obstacle.y-75));
        const m=await this.driveTo({x:s.robot.x,y:sideY},{tolerance:10,maxTicks:220});
        if(!m.ok)return{ok:false,reason:m.reason};
        s.agent.memory.alternateRoute=true;this.store.emit();return{ok:true,message:'moved to alternate corridor'};
      }
      case 'reposition_for_detection':{
        const yaw=s.robot.yaw*Math.PI/180;
        const target={x:s.robot.x-Math.sin(yaw)*45,y:s.robot.y+Math.cos(yaw)*45};
        const m=await this.driveTo(target,{tolerance:8,maxTicks:120});
        return m.ok?{ok:true,message:'repositioned for another detection attempt'}:{ok:false,reason:m.reason};
      }
      default:return{ok:false,reason:`unsupported_policy_skill:${skill}`};
    }
  }
}
