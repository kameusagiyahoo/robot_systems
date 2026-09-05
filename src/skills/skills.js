const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentHitsRect=(a,b,r)=>{const steps=40;for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return true;}return false;};

export class SkillExecutor{
  constructor(store,robot){this.store=store;this.robot=robot}
  async execute(step){const fn=this[step.name];if(!fn)return{ok:false,reason:`unknown_skill:${step.name}`};return fn.call(this,step.args||{})}

  navigate_to_pallet({palletId}){const s=this.store.state,p=s.pallets[palletId];if(!p)return{ok:false,reason:'pallet_not_found'};const target={x:p.x-105,y:p.y};if(s.obstacle.enabled&&segmentHitsRect(s.robot,target,s.obstacle))return{ok:false,reason:'path_blocked'};this.robot.sendAction({type:'teleport',x:target.x,y:target.y});return{ok:true,message:`approached ${p.label}`}}

  detect_pallet({palletId}){const s=this.store.state,p=s.pallets[palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(s.failures.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};const d=distance(s.robot,p);if(d>=180)return{ok:false,reason:'pallet_not_visible'};if(!s.perception.detectedPallets.includes(palletId))s.perception.detectedPallets.push(palletId);this.store.emit();return{ok:true,message:`${p.label} detected (${d.toFixed(0)} px)`}}

  align_to_pallet({palletId}){const s=this.store.state,p=s.pallets[palletId];if(!p)return{ok:false,reason:'pallet_not_found'};if(!s.perception.detectedPallets.includes(palletId))return{ok:false,reason:'pallet_not_detected'};if(s.failures.forceAlignmentFailure)return{ok:false,reason:'forced_alignment_failure'};this.robot.sendAction({type:'teleport',x:p.x-82,y:p.y});s.robot.aligned=true;this.store.emit();return{ok:true,message:'aligned to pallet (rule-based placeholder)'}}

  insert_forks({palletId}){const s=this.store.state;if(!s.robot.aligned)return{ok:false,reason:'not_aligned'};if(s.failures.forceInsertionFailure)return{ok:false,reason:'forced_insertion_failure'};s.robot.carrying=palletId;s.pallets[palletId].status='on_forks';this.store.emit();return{ok:true,message:'forks inserted'}}

  lift(){const s=this.store.state;if(!s.robot.carrying)return{ok:false,reason:'no_load'};this.robot.sendAction({type:'fork',raised:true});return{ok:true,message:'pallet lifted'}}

  navigate_to({locationId}){const s=this.store.state,l=s.locations[locationId];if(!l)return{ok:false,reason:'location_not_found'};const target={x:l.x-75,y:l.y};if(s.obstacle.enabled&&segmentHitsRect(s.robot,target,s.obstacle))return{ok:false,reason:'path_blocked'};this.robot.sendAction({type:'teleport',x:target.x,y:target.y});return{ok:true,message:`navigated to ${l.label}`}}

  place({locationId}){const s=this.store.state,l=s.locations[locationId],id=s.robot.carrying;if(!id)return{ok:false,reason:'no_load'};s.pallets[id].x=l.x;s.pallets[id].y=l.y;s.pallets[id].status='placed';s.robot.carrying=null;s.robot.forkRaised=false;s.robot.aligned=false;this.store.emit();return{ok:true,message:`placed at ${l.label}`}}

  retreat(){const s=this.store.state;this.robot.sendAction({type:'move',dx:-70,dy:0});s.agent.memory.retreated=true;this.store.emit();return{ok:true,message:'retreated'}}
}
