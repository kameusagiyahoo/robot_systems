import {SkillDatasetAdapter} from '../framework/dataset_adapter.js';
import {LocalDemonstrationEpisodeStore} from '../framework/demonstration_episode_store.js';
import {splitEpisodesDeterministic,splitSamplesDeterministic} from '../framework/dataset_split.js';

const PREFIX='forklift_skill_manual_dataset_v1:';
const requiredObs=['dx','dy','yawError','speed','steeringAngle'];
const requiredAction=['speed','steeringAngle'];
const key=skillId=>`${PREFIX}${skillId}`;
const readLegacy=skillId=>{try{const v=JSON.parse(localStorage.getItem(key(skillId))||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
const writeLegacy=(skillId,samples)=>{localStorage.setItem(key(skillId),JSON.stringify(samples));return samples};
const finite=(obj,names)=>names.every(k=>Number.isFinite(Number(obj?.[k])));

function normalizeSample(sample){
  const obs=sample?.obs||sample?.observation,action=sample?.action;
  if(!finite(obs,requiredObs)||!finite(action,requiredAction))return null;
  return{obs:Object.fromEntries(requiredObs.map(k=>[k,Number(obs[k])])),action:Object.fromEntries(requiredAction.map(k=>[k,Number(action[k])]))};
}
function normalizeEpisode(episode){
  const samples=(Array.isArray(episode?.samples)?episode.samples:[]).map(normalizeSample).filter(Boolean);if(!samples.length)return null;
  return{episodeId:episode.episodeId,skillId:episode.skillId,createdAt:episode.createdAt||new Date().toISOString(),startedAt:episode.startedAt||null,endedAt:episode.endedAt||null,outcome:episode.outcome||'unlabeled',quality:episode.quality||'unrated',note:String(episode.note||''),context:episode.context||null,samples};
}
function parseInput(input){return typeof input==='string'?JSON.parse(input):input}
function summarize(samples){
  const featureSummary={};
  for(const name of requiredObs){const values=samples.map(s=>Number(s.obs?.[name])).filter(Number.isFinite);if(!values.length)continue;featureSummary[name]={min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length}}
  const step=Math.max(1,Math.floor(samples.length/120)),preview=[];for(let i=0;i<samples.length&&preview.length<120;i+=step){const o=samples[i]?.obs;if(o)preview.push({dx:o.dx,dy:o.dy,yawError:o.yawError})}
  return{samples:samples.length,featureSummary,preview};
}
function filterEpisode(episode,filter='all'){
  if(filter==='success_only')return episode.outcome==='success';
  if(filter==='good_or_ok')return episode.quality==='good'||episode.quality==='ok';
  return true;
}

export class MotionDatasetAdapter extends SkillDatasetAdapter{
  constructor(){super({id:'motion_dataset',label:'Motion Observation/Action Dataset',version:4});this.episodeStore=new LocalDemonstrationEpisodeStore({id:'motion_demo_episodes',label:'Motion Demonstration Episodes',version:1})}
  supports(skillId){return['navigate_to_pallet','align_to_pallet','navigate_to','retreat'].includes(skillId)}
  getSources(){return[{id:'synthetic_expert',label:'Synthetic Expert',kind:'generated'},{id:'manual_import',label:'Manual / Recorded Demo',kind:'local'}]}
  listEpisodes(skillId){return this.episodeStore.list(skillId)}
  saveEpisode(skillId,episode){return this.episodeStore.save(skillId,normalizeEpisode(episode)||episode)}
  updateEpisode(skillId,episodeId,patch){return this.episodeStore.update(skillId,episodeId,patch)}
  removeEpisode(skillId,episodeId){return this.episodeStore.remove(skillId,episodeId)}
  clearEpisodes(skillId){this.episodeStore.clear(skillId)}
  episodeSummary(skillId){const episodes=this.listEpisodes(skillId);return{episodes:episodes.length,success:episodes.filter(e=>e.outcome==='success').length,failure:episodes.filter(e=>e.outcome==='failure').length,good:episodes.filter(e=>e.quality==='good').length,ok:episodes.filter(e=>e.quality==='ok').length,bad:episodes.filter(e=>e.quality==='bad').length,unrated:episodes.filter(e=>!e.quality||e.quality==='unrated').length,samples:episodes.reduce((n,e)=>n+(e.samples?.length||0),0)}}
  allManualSamples(skillId){return[...readLegacy(skillId).map(normalizeSample).filter(Boolean),...this.listEpisodes(skillId).flatMap(e=>(e.samples||[]).map(normalizeSample).filter(Boolean))]}
  async buildTrainingDataset(skillId,{source='synthetic_expert',samples=2500,seed=42,validationRatio=.2,demoFilter='all'}={}){
    if(source==='synthetic_expert')return{source,samples:null,trainSamples:null,validationSamples:null,requestedSamples:Number(samples)||2500,seed:Number(seed)||42,validationRatio:Number(validationRatio)||0,demoFilter,split:null};
    if(source!=='manual_import')throw new Error(`unsupported_dataset_source:${source}`);
    const legacy=readLegacy(skillId).map(normalizeSample).filter(Boolean),episodes=this.listEpisodes(skillId).map(normalizeEpisode).filter(Boolean).filter(e=>filterEpisode(e,demoFilter));
    const groups=[...episodes];if(legacy.length&&demoFilter==='all')groups.unshift({episodeId:'legacy_flat',skillId,outcome:'unlabeled',quality:'unrated',samples:legacy});
    if(!groups.length)throw new Error('manual_dataset_empty_or_filter_excluded_all_episodes');
    let split;if(groups.length>=2)split=splitEpisodesDeterministic(groups,{validationRatio,seed,sampleSelector:e=>e.samples});else split=splitSamplesDeterministic(groups[0].samples,{validationRatio:0,seed});
    return{source,samples:[...split.train,...split.validation],trainSamples:split.train,validationSamples:split.validation,requestedSamples:split.train.length,seed:Number(seed)||42,validationRatio:Number(validationRatio)||0,demoFilter,split:split.meta};
  }
  appendManualSample(skillId,sample){return this.appendManualSamples(skillId,[sample])}
  appendManualSamples(skillId,input){const incoming=(Array.isArray(input)?input:[input]).map(normalizeSample).filter(Boolean);if(!incoming.length)return readLegacy(skillId).length;const samples=readLegacy(skillId).map(normalizeSample).filter(Boolean);samples.push(...incoming);writeLegacy(skillId,samples);return samples.length}
  loadManualSamples(skillId){return this.allManualSamples(skillId)}
  summarizeManualSamples(skillId){return summarize(this.allManualSamples(skillId))}
  clearManualSamples(skillId){localStorage.removeItem(key(skillId));this.clearEpisodes(skillId)}
  async importDataset(skillId,input){
    const value=parseInput(input),episodesRaw=Array.isArray(value?.episodes)?value.episodes:[],legacyRaw=Array.isArray(value)?value:Array.isArray(value?.samples)?value.samples:Array.isArray(value?.legacySamples)?value.legacySamples:Array.isArray(value?.records)?value.records:[];
    const episodes=episodesRaw.map(normalizeEpisode).filter(Boolean),legacy=legacyRaw.map(normalizeSample).filter(Boolean);
    if(!episodes.length&&!legacy.length)throw new Error('no_valid_observation_action_samples');
    this.episodeStore.replace(skillId,episodes);writeLegacy(skillId,legacy);
    const summary=this.summarizeManualSamples(skillId);return{skillId,source:'manual_import',samples:summary.samples,episodes:episodes.length,importedAt:new Date().toISOString(),adapterId:this.id,...summary};
  }
  exportDataset(skillId,{format='portable'}={}){
    const legacySamples=readLegacy(skillId).map(normalizeSample).filter(Boolean),episodes=this.listEpisodes(skillId).map(normalizeEpisode).filter(Boolean);
    if(format==='lerobot_intermediate'){
      const records=[];let index=0;for(const episode of episodes){for(let step=0;step<episode.samples.length;step++){const s=episode.samples[step];records.push({index:index++,episodeId:episode.episodeId,episodeStep:step,outcome:episode.outcome,quality:episode.quality,observation:s.obs,action:s.action})}}for(const s of legacySamples)records.push({index:index++,episodeId:'legacy_flat',episodeStep:null,outcome:'unlabeled',quality:'unrated',observation:s.obs,action:s.action});
      return{schema:'robot_systems.lerobot_intermediate.v2',note:'Intermediate episodic JSON for later conversion to an official LeRobotDataset; not an official LeRobotDataset by itself.',skillId,features:{observation:requiredObs,action:requiredAction},episodes:episodes.map(e=>({episodeId:e.episodeId,outcome:e.outcome,quality:e.quality,note:e.note,steps:e.samples.length})),records};
    }
    return{schema:'robot_systems.skill_dataset.v2',skillId,adapterId:this.id,adapterVersion:this.version,generatedAt:new Date().toISOString(),episodes,legacySamples};
  }
  describe(skillId){const legacy=readLegacy(skillId).map(normalizeSample).filter(Boolean),episode=this.episodeSummary(skillId);return{...super.describe(skillId),manualSamples:legacy.length+episode.samples,legacySamples:legacy.length,episodeSummary:episode,episodeStore:this.episodeStore.describe(skillId),portableSchemas:['robot_systems.skill_dataset.v2','robot_systems.lerobot_intermediate.v2']}}
}
