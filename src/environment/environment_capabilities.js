export const ENVIRONMENT_CAPABILITIES=Object.freeze({
  RESET:'reset',OBSERVATION:'observation',STEP:'step',RENDERING:'rendering',SCENARIOS:'scenarios',TRIAL_CONFIGURATION:'trialConfiguration',METRICS:'metrics',
  POSE_2D:'pose2d',POSE_3D:'pose3d',RGB:'rgb',DEPTH:'depth',LIDAR:'lidar',CONTACT:'contact',JOINT_STATE:'jointState',FORK_ACTUATION:'forkActuation',PALLET_MANIPULATION:'palletManipulation',TELEPORT:'teleport'
});

const SKILL_REQUIREMENTS=Object.freeze({
  navigate_to_pallet:{any:[['pose2d','pose3d']],services:['action.send']},
  detect_pallet:{any:[['perception.palletVisible'],['rgb'],['depth'],['lidar']]},
  align_to_pallet:{any:[['pose2d','pose3d']],services:['action.send']},
  insert_forks:{any:[['manipulation.insertForks'],['forkActuation']]},
  lift:{any:[['manipulation.setFork'],['forkActuation']]},
  navigate_to:{any:[['pose2d','pose3d']],services:['action.send']},
  place:{any:[['manipulation.place'],['palletManipulation']]},
  retreat:{any:[['pose2d','pose3d']],services:['action.send']}
});

function descriptorServices(descriptor){return new Set(descriptor?.capabilities?.domainServices||descriptor?.domainServices||[])}
function descriptorFlags(descriptor){const caps=descriptor?.capabilities||{};return new Set(Object.entries(caps).filter(([,v])=>v===true).map(([k])=>k))}

export function environmentSupportsSkill(environmentOrDescriptor,skillId){
  const descriptor=environmentOrDescriptor?.describe?.()||environmentOrDescriptor||{},requirements=SKILL_REQUIREMENTS[skillId];if(!requirements)return{ok:true,missing:[],skillId};
  const services=descriptorServices(descriptor),flags=descriptorFlags(descriptor),has=name=>services.has(name)||flags.has(name),missing=[];
  for(const service of requirements.services||[])if(!has(service))missing.push(service);
  for(const alternatives of requirements.any||[])if(!alternatives.some(has))missing.push(`one_of:${alternatives.join('|')}`);
  return{ok:missing.length===0,missing,skillId,environmentId:descriptor.id||null};
}

export function environmentCapabilityMatrix(environmentOrDescriptor,skillIds=[]){return Object.fromEntries(skillIds.map(id=>[id,environmentSupportsSkill(environmentOrDescriptor,id)]))}

export function describeEnvironmentCapabilities(){return{capabilities:{...ENVIRONMENT_CAPABILITIES},skillRequirements:SKILL_REQUIREMENTS,note:'Capabilities describe what an environment can physically/sensorially support. Learning algorithm support remains a separate Skill Learning Plugin concern.'}}
