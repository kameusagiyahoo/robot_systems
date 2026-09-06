import {EnvironmentSensorSourceAdapter} from '../framework/sensor_source_adapter.js';

export class PerceptionSensorSourceAdapter extends EnvironmentSensorSourceAdapter{
  constructor(){super({id:'perception_environment_sensors',label:'Environment Perception Sensors',version:1,requiredBySkill:{detect_pallet:['rgb|depth|lidar']}})}
  requiredSensorTypes(skillId){return skillId==='detect_pallet'?['one_of:rgb|depth|lidar']:[]}
  async choose(skillId,context={},preferred=['rgb','depth','lidar']){
    const manifest=await this.list(skillId,context);for(const type of preferred){const found=manifest.find(s=>s.type===type&&s.available!==false);if(found)return found}return null
  }
  async readPreferred(skillId,context={},options={}){const source=await this.choose(skillId,context,options.preferred||['rgb','depth','lidar']);if(!source)throw new Error(`perception_sensor_unavailable:${skillId}`);return{source,packet:await this.read(skillId,source.sensorId,context,options)}}
}

export const perceptionSensorSource=new PerceptionSensorSourceAdapter();
