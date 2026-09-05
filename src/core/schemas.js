export function buildObservation(state){return JSON.parse(JSON.stringify({robot:state.robot,pallets:state.pallets,locations:state.locations,perception:state.perception,task:state.task,obstacle:state.obstacle,failures:state.failures,simulation:state.simulation,path:state.path}));}
export function buildAction(step,skill,args){return{step,skill,args:JSON.parse(JSON.stringify(args||{})),timestamp:new Date().toISOString()};}
export function buildResult(result){return{
  ok:!!result?.ok,
  reason:result?.reason||null,
  message:result?.message||null,
  ticks:result?.ticks??null,
  meanCrossTrackError:result?.meanCrossTrackError??null,
  yawError:result?.yawError??null,
  policy:result?.policy||null,
  runtimePlugin:result?.runtimePlugin||null,
  runtimeAdapter:result?.runtimeAdapter||null,
  timestamp:new Date().toISOString()
};}
