import {UnavailableEnvironmentAdapter} from './environment_adapter.js';

const entries=new Map();

export function registerEnvironmentAdapter({id,label,version=1,kind='simulation',fidelity='unknown',factory=null,available=true,reason=null,tags=[]}={}){
  if(!id)throw new Error('environment_registry_id_required');
  entries.set(id,{id,label:label||id,version,kind,fidelity,factory,available:available!==false&&typeof factory==='function',reason,tags:[...tags]});
  return entries.get(id);
}

export function listEnvironmentAdapters(){return[...entries.values()].map(({factory,...descriptor})=>({...descriptor}))}
export function getEnvironmentDescriptor(id){const e=entries.get(id);if(!e)return null;const{factory,...descriptor}=e;return{...descriptor}}
export function hasEnvironmentAdapter(id){return entries.has(id)}

export function createEnvironmentAdapter(id,options={}){
  const entry=entries.get(id);if(!entry)throw new Error(`unknown_environment_adapter:${id}`);
  if(!entry.available||typeof entry.factory!=='function')return new UnavailableEnvironmentAdapter({...entry,reason:entry.reason||'adapter_not_installed'});
  const env=entry.factory(options);if(!env)throw new Error(`environment_factory_returned_empty:${id}`);return env;
}

export function defaultEnvironmentId(){
  const preferred=[...entries.values()].find(e=>e.available&&e.tags?.includes('default'));
  return preferred?.id||[...entries.values()].find(e=>e.available)?.id||null;
}
