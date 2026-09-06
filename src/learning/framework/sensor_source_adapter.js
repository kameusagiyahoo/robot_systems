export class SensorSourceAdapter{
  constructor({id,label,version=1}={}){if(!id)throw new Error('sensor_source_adapter_id_required');this.id=id;this.label=label||id;this.version=version}
  supports(_skillId){return false}
  requiredSensorTypes(_skillId){return[]}
  async list(_skillId,_context={}){return[]}
  async read(_skillId,_sensorId,_context={},_options={}){throw new Error(`sensor_source_read_not_implemented:${this.id}`)}
  describe(skillId){return{id:this.id,label:this.label,version:this.version,skillId,requiredSensorTypes:this.requiredSensorTypes(skillId)}}
}

export class EnvironmentSensorSourceAdapter extends SensorSourceAdapter{
  constructor({id='environment_sensor_source',label='Environment Sensor Source',version=1,requiredBySkill={}}={}){super({id,label,version});this.requiredBySkill=requiredBySkill}
  supports(skillId){return Array.isArray(this.requiredBySkill[skillId])}
  requiredSensorTypes(skillId){return[...(this.requiredBySkill[skillId]||[])]}
  services(context){return context?.domainServices||null}
  async list(skillId,context={}){if(!this.supports(skillId))return[];const services=this.services(context);if(services?.has?.('sensor.manifest'))return await services.callAsync?.('sensor.manifest')??await Promise.resolve(services.call('sensor.manifest'));if(context.environment?.sensorManifest)return await context.environment.sensorManifest();return[]}
  async read(skillId,sensorId,context={},options={}){if(!this.supports(skillId))throw new Error(`sensor_source_skill_unsupported:${skillId}`);const services=this.services(context);if(services?.has?.('sensor.read'))return await services.callAsync?.('sensor.read',sensorId,options)??await Promise.resolve(services.call('sensor.read',sensorId,options));if(context.environment?.readSensor)return await context.environment.readSensor(sensorId,options);throw new Error(`environment_sensor_read_unavailable:${sensorId}`)}
}
