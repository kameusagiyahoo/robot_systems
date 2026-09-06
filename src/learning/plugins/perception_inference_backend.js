import {InferenceBackend} from '../framework/inference_backend.js';

export class EnvironmentPerceptionInferenceBackend extends InferenceBackend{
  constructor(){super({id:'environment_perception_inference',label:'Environment / Remote Perception Inference',version:1,kind:'perception'})}
  supports(skillId){return skillId==='detect_pallet'}
  async infer(skillId,input={},context={}){
    if(!this.supports(skillId))throw new Error(`perception_inference_skill_unsupported:${skillId}`);
    const services=context?.domainServices;
    if(services?.has?.('perception.infer')){
      const request={skillId,sensorId:input.sensorId||null,target:input.target||null,packet:input.packet||null,options:input.options||{}};
      const value=typeof services.callAsync==='function'?await services.callAsync('perception.infer',request):await Promise.resolve(services.call('perception.infer',request));
      if(!value||typeof value!=='object')throw new Error('perception_inference_invalid_result');
      return value;
    }
    if(context?.environment?.domainCall&&context.environment.hasRemoteDomainService?.('perception.infer'))return await context.environment.domainCall('perception.infer',{skillId,...input});
    throw new Error('perception_inference_backend_unavailable');
  }
  describe(skillId){return{...super.describe(skillId),requiredDomainService:'perception.infer',placement:'environment_or_remote_compute',note:'Detector/VLM/Pose model implementation is supplied by the environment/compute backend, not hard-coded in the web framework.'}}
}

export const perceptionInferenceBackend=new EnvironmentPerceptionInferenceBackend();
