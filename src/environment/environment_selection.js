import './default_environments.js';
import {defaultEnvironmentId,getEnvironmentDescriptor,listEnvironmentAdapters} from './environment_registry.js';

const KEY='robot_systems_environment_v1';

export function selectedEnvironmentId(){
  const saved=localStorage.getItem(KEY);if(saved&&getEnvironmentDescriptor(saved)?.available)return saved;
  return defaultEnvironmentId()||'browser_2d';
}
export function setSelectedEnvironmentId(id){
  const descriptor=getEnvironmentDescriptor(id);if(!descriptor)throw new Error(`unknown_environment:${id}`);if(!descriptor.available)throw new Error(`environment_unavailable:${id}:${descriptor.reason||'not_available'}`);localStorage.setItem(KEY,id);return id;
}
export function environmentSelectionState(){return{selected:selectedEnvironmentId(),environments:listEnvironmentAdapters()}}
