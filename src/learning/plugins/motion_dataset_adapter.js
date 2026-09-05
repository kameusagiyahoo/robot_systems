import {SkillDatasetAdapter} from '../framework/dataset_adapter.js';

const PREFIX='forklift_skill_manual_dataset_v1:';
const requiredObs=['dx','dy','yawError','speed','steeringAngle'];
const requiredAction=['speed','steeringAngle'];
const key=skillId=>`${PREFIX}${skillId}`;
const read=skillId=>{try{const v=JSON.parse(localStorage.getItem(key(skillId))||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
const write=(skillId,samples)=>{localStorage.setItem(key(skillId),JSON.stringify(samples));return samples};
const finite=(obj,names)=>names.every(k=>Number.isFinite(Number(obj?.[k])));

function normalizeSample(sample){
  const obs=sample?.obs||sample?.observation,action=sample?.action;
  if(!finite(obs,requiredObs)||!finite(action,requiredAction))return null;
  return{obs:Object.fromEntries(requiredObs.map(k=>[k,Number(obs[k])])),action:Object.fromEntries(requiredAction.map(k=>[k,Number(action[k])]))};
}
function extractSamples(input){
  const value=typeof input==='string'?JSON.parse(input):input;
  const raw=Array.isArray(value)?value:Array.isArray(value?.samples)?value.samples:Array.isArray(value?.records)?value.records:[];
  return raw.map(normalizeSample).filter(Boolean);
}

export class MotionDatasetAdapter extends SkillDatasetAdapter{
  constructor(){super({id:'motion_dataset',label:'Motion Observation/Action Dataset',version:1})}
  supports(skillId){return['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  getSources(){return[
    {id:'synthetic_expert',label:'Synthetic Expert',kind:'generated'},
    {id:'manual_import',label:'Manual / Imported Demo',kind:'local'}
  ]}
  async buildTrainingDataset(skillId,{source='synthetic_expert',samples=2500,seed=42}={}){
    if(source==='synthetic_expert')return{source,samples:null,requestedSamples:Number(samples)||2500,seed:Number(seed)||42};
    if(source==='manual_import'){
      const demos=read(skillId);if(!demos.length)throw new Error('manual_dataset_empty_import_json_first');
      return{source,samples:demos,requestedSamples:demos.length,seed:Number(seed)||42};
    }
    throw new Error(`unsupported_dataset_source:${source}`);
  }
  appendManualSample(skillId,sample){const normalized=normalizeSample(sample);if(!normalized)throw new Error('invalid_manual_sample');const samples=read(skillId);samples.push(normalized);write(skillId,samples);return samples.length}
  loadManualSamples(skillId){return read(skillId)}
  clearManualSamples(skillId){localStorage.removeItem(key(skillId))}
  async importDataset(skillId,input){
    const samples=extractSamples(input);if(!samples.length)throw new Error('no_valid_observation_action_samples');write(skillId,samples);
    return{skillId,source:'manual_import',samples:samples.length,importedAt:new Date().toISOString(),adapterId:this.id};
  }
  exportDataset(skillId,{format='portable'}={}){
    const samples=read(skillId);
    if(format==='lerobot_intermediate'){
      return{schema:'robot_systems.lerobot_intermediate.v1',note:'Intermediate JSON for later conversion to an official LeRobotDataset; not an official LeRobotDataset by itself.',skillId,features:{observation:requiredObs,action:requiredAction},records:samples.map(s=>({observation:s.obs,action:s.action}))};
    }
    return{schema:'robot_systems.skill_dataset.v1',skillId,adapterId:this.id,samples};
  }
  describe(skillId){return{...super.describe(skillId),manualSamples:read(skillId).length,portableSchemas:['robot_systems.skill_dataset.v1','robot_systems.lerobot_intermediate.v1']}}
}
