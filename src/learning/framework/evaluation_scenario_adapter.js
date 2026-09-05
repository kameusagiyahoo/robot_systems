const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;

export class SkillEvaluationScenarioAdapter {
  constructor({id,label,version=1}={}){
    if(!id)throw new Error('evaluation_scenario_adapter_id_required');
    this.id=id;
    this.label=label||id;
    this.version=version;
  }

  supports(_skillId){return false}

  describe(skillId){return{id:this.id,label:this.label,version:this.version,skillId}}

  createRuntime({defaultRuntimeFactory,options={}}={}){
    if(typeof defaultRuntimeFactory!=='function')throw new Error('default_runtime_factory_required');
    return defaultRuntimeFactory(options);
  }

  prepareTrial(_skillId,_state,_rng,_context={}){
    throw new Error(`prepare_trial_not_implemented:${this.id}`);
  }

  measureTrial(_skillId,state,prepared,result){
    return{
      success:!!result?.ok,
      reason:result?.reason||null,
      controlTicks:state?.simulation?.controlTicks||0,
      simTimeSec:(state?.simulation?.controlTicks||0)*(state?.simulation?.dt||0),
      collisions:state?.simulation?.collisions||0,
      pathLength:state?.simulation?.pathLength||0,
      prepared
    };
  }

  aggregate(skillId,runs,{trials,seed,controller,policy}={}){
    const failures={};
    for(const x of runs)if(!x.success){const key=x.reason||'unknown';failures[key]=(failures[key]||0)+1}
    const finite=key=>runs.map(x=>Number(x[key])).filter(Number.isFinite);
    return{
      version:1,
      adapterId:this.id,
      skillId,
      policy,
      controller,
      trials,
      seed:String(seed),
      evaluatedAt:new Date().toISOString(),
      successRate:runs.filter(x=>x.success).length/Math.max(runs.length,1),
      collisionRate:runs.filter(x=>(x.collisions||0)>0).length/Math.max(runs.length,1),
      avgControlTicks:mean(finite('controlTicks')),
      avgSimTimeSec:mean(finite('simTimeSec')),
      avgPathLength:mean(finite('pathLength')),
      failures,
      runs
    };
  }
}
