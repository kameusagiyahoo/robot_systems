const plugins=new Map();
const bindings=new Map();

export function registerLearningPlugin(plugin,{skills=[]}={}){
  if(!plugin?.id)throw new Error('invalid_learning_plugin');
  plugins.set(plugin.id,plugin);
  for(const skillId of skills){
    if(bindings.has(skillId))throw new Error(`learning_plugin_already_bound:${skillId}`);
    bindings.set(skillId,plugin.id);
  }
  return plugin;
}

export function bindSkillLearningPlugin(skillId,pluginId){
  if(!plugins.has(pluginId))throw new Error(`unknown_learning_plugin:${pluginId}`);
  bindings.set(skillId,pluginId);
}

export function getLearningPlugin(skillId){
  const id=bindings.get(skillId),plugin=id?plugins.get(id):null;
  if(!plugin)throw new Error(`learning_plugin_not_registered:${skillId}`);
  return plugin;
}

export function getLearningDescriptor(skillId){return getLearningPlugin(skillId).describe(skillId)}
export function getLearningPluginId(skillId){return bindings.get(skillId)||null}
export function listLearningPlugins(){return[...plugins.values()].map(p=>({id:p.id,label:p.label,version:p.version}))}
export function listSkillPluginBindings(){return[...bindings.entries()].map(([skillId,pluginId])=>({skillId,pluginId}))}
