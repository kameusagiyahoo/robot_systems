import {PolicyInterface} from './policy_interface.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentHitsRect=(a,b,r)=>{const steps=40;for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return true;}return false;};

export class RulePolicy extends PolicyInterface {
  async execute(skill,args={}){
    const s=this.store.state;
    switch(skill){
      case 'navigate_to_pallet':{
        const p=s.pallets[args.palletId]; if(!p)return{ok:false,reason:'pallet_not_found'};
        const target={x:p.x-105,y:p.y};
        if(s.obstacle.enabled&&!s.agent.memory.alternateRoute&&segmentHitsRect(s.robot,target,s.obstacle))return{ok:false,reason:'path_blocked'};
        this.robot.sendAction({type:'teleport',x:target.x,y:target.y});
        return{ok:true,message:`approached ${p.label}`};
      }
      case 'detect_pallet':{
        const p=s.pallets[args.palletId]; if(!p)return{ok:false,reason:'pallet_not_found'};
        if(s.failures.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};
        const d=distance(s.robot,p); if(d>=180)return{ok:false,reason:'pallet_not_visible'};
        if(!s.perception.detectedPallets.includes(args.palletId))s.perception.detectedPallets.push(args.palletId);
        this.store.emit(); return{ok:true,message:`${p.label} detected (${d.toFixed(0)} px)`};
      }
      case 'align_to_pallet':{
        const p=s.pallets[args.palletId]; if(!p)return{ok:false,reason:'pallet_not_found'};
        if(s.failures.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};
        this.robot.sendAction({type:'teleport',x:p.x-82,y:p.y}); s.robot.aligned=true; this.store.emit();
        return{ok:true,message:'aligned to pallet (rule policy)'};
      }
      case 'insert_forks':{
        if(s.failures.forceInsertionFailure)return{ok:false,reason:'forced_insertion_failure'};
        s.robot.carrying=args.palletId; s.pallets[args.palletId].status='on_forks'; this.store.emit();
        return{ok:true,message:'forks inserted'};
      }
      case 'lift': this.robot.sendAction({type:'fork',raised:true}); return{ok:true,message:'pallet lifted'};
      case 'navigate_to':{
        const l=s.locations[args.locationId]; if(!l)return{ok:false,reason:'location_not_found'};
        const target={x:l.x-75,y:l.y};
        if(s.obstacle.enabled&&!s.agent.memory.alternateRoute&&segmentHitsRect(s.robot,target,s.obstacle))return{ok:false,reason:'path_blocked'};
        this.robot.sendAction({type:'teleport',x:target.x,y:target.y});
        return{ok:true,message:`navigated to ${l.label}${s.agent.memory.alternateRoute?' via alternate route':''}`};
      }
      case 'place':{
        const l=s.locations[args.locationId],id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};
        s.pallets[id].x=l.x;s.pallets[id].y=l.y;s.pallets[id].status='placed';s.robot.carrying=null;s.robot.forkRaised=false;s.robot.aligned=false;this.store.emit();
        return{ok:true,message:`placed at ${l.label}`};
      }
      case 'retreat': this.robot.sendAction({type:'move',dx:-70,dy:0});s.agent.memory.retreated=true;this.store.emit();return{ok:true,message:'retreated'};
      case 'avoid_obstacle': this.robot.sendAction({type:'move',dx:0,dy:-90});s.agent.memory.alternateRoute=true;this.store.emit();return{ok:true,message:'alternate route selected'};
      case 'reposition_for_detection': this.robot.sendAction({type:'move',dx:0,dy:45});return{ok:true,message:'repositioned for another detection attempt'};
      default:return{ok:false,reason:`unsupported_policy_skill:${skill}`};
    }
  }
}
