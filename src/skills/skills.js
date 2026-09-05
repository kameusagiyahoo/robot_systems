const skillSpecs={
  navigate_to_pallet:{pre:(s,a)=>s.pallets[a.palletId]?'ok':'pallet_not_found',post:()=>true},
  detect_pallet:{pre:(s,a)=>s.pallets[a.palletId]?'ok':'pallet_not_found',post:(s,a,r)=>!r.ok||s.perception.detectedPallets.includes(a.palletId)},
  align_to_pallet:{pre:(s,a)=>s.perception.detectedPallets.includes(a.palletId)?'ok':'pallet_not_detected',post:(s,a,r)=>!r.ok||s.robot.aligned},
  insert_forks:{pre:(s)=>s.robot.aligned?'ok':'not_aligned',post:(s,a,r)=>!r.ok||s.robot.carrying===a.palletId},
  lift:{pre:(s)=>s.robot.carrying?'ok':'no_load',post:(s,a,r)=>!r.ok||s.robot.forkRaised},
  navigate_to:{pre:(s,a)=>s.locations[a.locationId]?'ok':'location_not_found',post:()=>true},
  place:{pre:(s)=>s.robot.carrying?'ok':'no_load',post:(s,a,r)=>!r.ok||!s.robot.carrying},
  retreat:{pre:()=> 'ok',post:(s,a,r)=>!r.ok||s.agent.memory.retreated},
  avoid_obstacle:{pre:(s)=>s.obstacle.enabled?'ok':'no_obstacle',post:(s,a,r)=>!r.ok||s.agent.memory.alternateRoute},
  reposition_for_detection:{pre:()=> 'ok',post:()=>true}
};

export class SkillExecutor{
  constructor(store,policy){this.store=store;this.policy=policy}
  async execute(step){
    const spec=skillSpecs[step.name];
    if(!spec)return{ok:false,reason:`unknown_skill:${step.name}`};
    const args=step.args||{};
    const pre=spec.pre(this.store.state,args);
    if(pre!=='ok')return{ok:false,reason:`precondition_failed:${pre}`};
    const result=await this.policy.execute(step.name,args);
    if(result.ok&&!spec.post(this.store.state,args,result))return{ok:false,reason:'postcondition_failed'};
    return result;
  }
}
