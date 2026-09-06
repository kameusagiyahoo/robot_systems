export const TASK_RUNTIME_STATE_SCHEMA='robot_systems.task_runtime_state.v1';

const isObject=v=>!!v&&typeof v==='object';
const finite=v=>Number.isFinite(Number(v));

export function validateTaskRuntimeState(state){
  const issues=[];
  if(!isObject(state))return{ok:false,issues:['state_not_object'],schema:TASK_RUNTIME_STATE_SCHEMA};
  if(!isObject(state.robot))issues.push('robot_missing');
  else{
    for(const key of ['x','y','yaw'])if(!finite(state.robot[key]))issues.push(`robot_${key}_invalid`);
  }
  if(!isObject(state.pallets))issues.push('pallets_missing');
  if(!isObject(state.locations))issues.push('locations_missing');
  if(!isObject(state.agent))issues.push('agent_missing');
  if(!isObject(state.task))issues.push('task_missing');
  if(!isObject(state.perception))issues.push('perception_missing');
  if(!isObject(state.simulation))issues.push('simulation_or_runtime_config_missing');
  return{ok:issues.length===0,issues,schema:TASK_RUNTIME_STATE_SCHEMA};
}

export function describeTaskRuntimeStateContract(){
  return{
    schema:TASK_RUNTIME_STATE_SCHEMA,
    purpose:'Semantic state consumed by Planner / Skill / Policy / Learning. Environment-native state must be adapted into this contract.',
    required:{
      robot:['x','y','yaw'],
      collections:['pallets','locations'],
      runtime:['agent','task','perception','simulation']
    },
    conventions:{
      angle:'degrees in v1 compatibility contract',
      length:'environment adapter units; adapter must declare units/scale in describe()',
      nativeSimulatorState:'must not be required by upper layers'
    }
  };
}
