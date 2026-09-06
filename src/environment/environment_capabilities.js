export const ENVIRONMENT_CAPABILITIES=Object.freeze({
  RESET:'reset',OBSERVATION:'observation',STEP:'step',RENDERING:'rendering',SCENARIOS:'scenarios',TRIAL_CONFIGURATION:'trialConfiguration',METRICS:'metrics',
  POSE_2D:'pose2d',POSE_3D:'pose3d',RGB:'rgb',DEPTH:'depth',LIDAR:'lidar',CONTACT:'contact',JOINT_STATE:'jointState',FORK_ACTUATION:'forkActuation',PALLET_MANIPULATION:'palletManipulation',TELEPORT:'teleport'
});

const SKILL_REQUIREMENTS=Object.freeze({
  navigate_to_pallet:{anyAll:[['pose2d'],['pose3d']],services:['action.send']},
  detect_pallet:{anyAll:[['perception.palletVisible'],['rgb'],['depth'],['lidar']]},
  align_to_pallet:{anyAll:[['pose2d'],['pose3d']],services:['action.send']},
  insert_forks:{anyAll:[['manipulation.insertForks'],['forkActuation','contact']]},
  lift:{anyAll:[['manipulation.setFork'],['forkActuation']]},
  navigate_to:{anyAll:[['pose2d'],['pose3d']],services:['action.send']},
  place:{anyAll:[['manipulation.place'],['palletManipulation','contact']]},
  retreat:{anyAll:[['pose2d'],['pose3d']],services:['action.send']}
});

function descriptorServices(descriptor){return new Set(descriptor?.capabilities?.domainServices||descriptor?.domainServices||[])}
function descriptorFlags(descriptor){const caps=descriptor?.capabilities||{};return new Set(Object.entries(caps).filter(([,v])=>v===true).map(([k])=>k))}

export function environmentSupportsSkill(environmentOrDescriptor,skillId){
  const descriptor=environmentOrDescriptor?.describe?.()||environmentOrDescriptor||{},requirements=SKILL_REQUIREMENTS[skillId];if(!requirements)return{ok:true,missing:[],skillId};
  const services=descriptorServices(descriptor),flags=descriptorFlags(descriptor),has=name=>services.has(name)||flags.has(name),missing=[];
  for(const service of requirements.services||[])if(!has(service))missing.push(service);
  const groups=requirements.anyAll||[];if(groups.length&&!groups.some(group=>group.every(has)))missing.push(`one_of_sets:${groups.map(g=>g.join('+')).join('|')}`);
  return{ok:missing.length===0,missing,skillId,environmentId:descriptor.id||null};
}

export function environmentCapabilityMatrix(environmentOrDescriptor,skillIds=[]){return Object.fromEntries(skillIds.map(id=>[id,environmentSupportsSkill(environmentOrDescriptor,id)]))}

export function describeEnvironmentCapabilities(){return{capabilities:{...ENVIRONMENT_CAPABILITIES},skillRequirements:SKILL_REQUIREMENTS,note:'Capabilities describe what an environment can physically/sensorially support. Learning algorithm support remains a separate Skill Learning Plugin concern.'}}
