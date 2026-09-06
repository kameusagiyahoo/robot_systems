import '../plugins/default_skill_plugins.js';
import {getLearningDescriptor} from '../framework/plugin_registry.js';
import {getSkillDefinition} from '../skill_learning_registry.js';

const params=new URLSearchParams(location.search);let skillId=params.get('skill')||'align_to_pallet';if(!getSkillDefinition(skillId))skillId='align_to_pallet';
const descriptor=getLearningDescriptor(skillId),sensor=descriptor.sensorSourceAdapter,inference=descriptor.inferenceBackend;
const sensorEl=document.getElementById('sensorSourceState'),inferenceEl=document.getElementById('inferenceBackendState');
if(sensorEl)sensorEl.textContent=sensor?`${sensor.label} v${sensor.version} · ${(sensor.requiredSensorTypes||[]).join(', ')||'plugin-defined'}`:'未定義';
if(inferenceEl)inferenceEl.textContent=inference?`${inference.label} v${inference.version} · ${inference.kind||'inference'}`:'未定義';
