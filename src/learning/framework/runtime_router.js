import '../plugins/default_skill_plugins.js';
import {getLearningPlugin,getRuntimePolicyAdapter} from './plugin_registry.js';
import {selectedPolicy} from '../skill_learning_registry.js';

export async function routeSkillRuntime(skillId,args={},context={}){
  const policy=selectedPolicy(skillId);
  if(policy==='classic')return{handled:false,policy};

  let plugin,adapter;
  try{
    plugin=getLearningPlugin(skillId);
    adapter=getRuntimePolicyAdapter(skillId);
  }catch(error){
    return{handled:true,policy,result:{ok:false,reason:`runtime_plugin_unavailable:${skillId}:${error?.message||'unknown'}`}};
  }

  if(!adapter)return{handled:true,policy,pluginId:plugin.id,result:{ok:false,reason:`runtime_adapter_unavailable:${plugin.id}:${skillId}`}};
  if(typeof adapter.supports==='function'&&!adapter.supports(skillId,policy))return{handled:true,policy,pluginId:plugin.id,adapterId:adapter.id,result:{ok:false,reason:`runtime_adapter_unsupported:${adapter.id}:${skillId}:${policy}`}};

  try{
    const result=await adapter.execute(skillId,args,{...context,policy,plugin});
    return{handled:true,policy,pluginId:plugin.id,adapterId:adapter.id,result};
  }catch(error){
    return{handled:true,policy,pluginId:plugin.id,adapterId:adapter.id,result:{ok:false,reason:`runtime_adapter_exception:${error?.message||'unknown'}`}};
  }
}
