const PREFIX='skill_demo_episodes_v1:';
const key=skillId=>`${PREFIX}${skillId}`;

function parseArray(value){try{const v=JSON.parse(value||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function uid(skillId){const rand=Math.random().toString(36).slice(2,8);return`${skillId}:${Date.now().toString(36)}:${rand}`}

export class LocalDemonstrationEpisodeStore{
  constructor({id='local_demo_episodes',label='Local Demonstration Episode Store',version=1,maxEpisodes=500}={}){this.id=id;this.label=label;this.version=version;this.maxEpisodes=maxEpisodes}
  list(skillId){return parseArray(localStorage.getItem(key(skillId)))}
  save(skillId,episode){
    if(!skillId)throw new Error('demo_episode_skill_required');
    const episodes=this.list(skillId),record={episodeId:episode?.episodeId||uid(skillId),skillId,createdAt:episode?.createdAt||new Date().toISOString(),outcome:episode?.outcome||'unlabeled',quality:episode?.quality||'unrated',note:String(episode?.note||''),...episode};
    const index=episodes.findIndex(e=>e.episodeId===record.episodeId);if(index>=0)episodes[index]=record;else episodes.push(record);
    localStorage.setItem(key(skillId),JSON.stringify(episodes.slice(-this.maxEpisodes)));return record;
  }
  update(skillId,episodeId,patch={}){const episode=this.list(skillId).find(e=>e.episodeId===episodeId);if(!episode)throw new Error('demo_episode_not_found');return this.save(skillId,{...episode,...patch,episodeId,updatedAt:new Date().toISOString()})}
  remove(skillId,episodeId){const episodes=this.list(skillId),next=episodes.filter(e=>e.episodeId!==episodeId);localStorage.setItem(key(skillId),JSON.stringify(next));return episodes.length-next.length}
  clear(skillId){localStorage.removeItem(key(skillId))}
  replace(skillId,episodes=[]){localStorage.setItem(key(skillId),JSON.stringify((Array.isArray(episodes)?episodes:[]).slice(-this.maxEpisodes)));return this.list(skillId)}
  describe(skillId){const episodes=this.list(skillId);return{id:this.id,label:this.label,version:this.version,episodes:episodes.length,samples:episodes.reduce((n,e)=>n+(Array.isArray(e.samples)?e.samples.length:0),0)}}
}
