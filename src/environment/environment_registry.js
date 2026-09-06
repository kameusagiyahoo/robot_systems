import {UnavailableEnvironmentAdapter} from './environment_adapter.js';

const entries=new Map();
const availability=e=>{const dynamic=typeof e?.isAvailable==='function'?!!e.isAvailable():e?.available!==false;return dynamic&&typeof e?.factory==='function'};
const descriptor=e=>{if(!e)return null;const{factory,isAvailable,...rest}=e;return{...rest,available:availability(e),reason:availability(e)?null:(rest.reason||'adapter_not_configured_or_installed')}};

export function registerEnvironmentAdapter({id,label,version=1,kind='simulation',fidelity='unknown',factory=null,available=true,isAvailable=null,reason=null,tags=[]}={}){
  if(!id)throw new Error('environment_registry_id_required');
  entries.set(id,{id,label:label||id,version,kind,fidelity,factory,available:available!==false,isAvailable,reason,tags:[...tags]});
  return descriptor(entries.get(id));
}

export function listEnvironmentAdapters(){return[...entries.values()].map(descriptor)}
export function getEnvironmentDescriptor(id){return descriptor(entries.get(id))}
export function hasEnvironmentAdapter(id){return entries.has(id)}

export function createEnvironmentAdapter(id,options={}){
  const entry=entries.get(id);if(!entry)throw new Error(`unknown_environment_adapter:${id}`);const d=descriptor(entry);
  if(!d.available||typeof entry.factory!=='function')return new UnavailableEnvironmentAdapter({...d,reason:d.reason||'adapter_not_installed'});
  const env=entry.factory(options);if(!env)throw new Error(`environment_factory_returned_empty:${id}`);return env;
}

export function defaultEnvironmentId(){
  const available=[...entries.values()].filter(availability),preferred=available.find(e=>e.tags?.includes('default'));
  return preferred?.id||available[0]?.id||null;
}
