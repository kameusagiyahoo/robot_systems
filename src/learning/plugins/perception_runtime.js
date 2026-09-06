import {SkillRuntimePolicyAdapter} from '../framework/runtime_policy_adapter.js';
import {perceptionSensorSource} from './perception_sensor_source.js';
import {perceptionInferenceBackend} from './perception_inference_backend.js';

export class PerceptionRuntimePolicyAdapter extends SkillRuntimePolicyAdapter{
  constructor({sensorSource=perceptionSensorSource,inferenceBackend=perceptionInferenceBackend}={}){super({id:'perception_sensor_runtime',label:'Perception Sensor Runtime',version:1});this.sensorSource=sensorSource;this.inferenceBackend=inferenceBackend}
  supports(skillId,policy='sensor_inference'){return skillId==='detect_pallet'&&policy==='sensor_inference'}
  getRequiredDomainServices(){return['state.get']}
  describe(skillId){return{...super.describe(skillId),policies:['sensor_inference'],sensorSource:this.sensorSource.describe(skillId),inferenceBackend:this.inferenceBackend.describe(skillId)}}
  state(context){return context.environment?.getState?.()||context.store?.state}
  async markDetected(context,palletId){if(context.domainServices?.has?.('perception.markDetected')){if(typeof context.domainServices.callAsync==='function')return await context.domainServices.callAsync('perception.markDetected',palletId);return await Promise.resolve(context.domainServices.call('perception.markDetected',palletId))}const s=this.state(context);if(!s.perception.detectedPallets.includes(palletId))s.perception.detectedPallets.push(palletId);context.store?.emit?.();return{ok:true}}
  async execute(skillId,args={},context={}){
    if(!this.supports(skillId,context.policy))return{ok:false,reason:`perception_runtime_unsupported:${skillId}:${context.policy}`};
    const s=this.state(context),palletId=args.palletId,pallet=s?.pallets?.[palletId];if(!pallet)return{ok:false,reason:'pallet_not_found'};if(s.failures?.forceDetectionFailure)return{ok:false,reason:'forced_detection_failure'};
    let sensor=null;try{sensor=await this.sensorSource.choose(skillId,context)}catch{}
    let result;
    try{result=await this.inferenceBackend.infer(skillId,{sensorId:sensor?.sensorId||null,target:{id:palletId,label:pallet.label||palletId},options:{requestedSkill:'DetectPallet'}},context)}catch(error){return{ok:false,reason:error?.message||'perception_inference_failed',sensorId:sensor?.sensorId||null,inferenceBackend:this.inferenceBackend.id}}
    if(!result?.detected)return{ok:false,reason:result?.reason||'pallet_not_detected',confidence:Number.isFinite(Number(result?.confidence))?Number(result.confidence):null,sensorId:sensor?.sensorId||null,inferenceBackend:this.inferenceBackend.id,detection:result||null};
    await this.markDetected(context,palletId);
    return{ok:true,message:`${pallet.label||palletId} detected by sensor inference`,policy:'sensor_inference',confidence:Number.isFinite(Number(result.confidence))?Number(result.confidence):null,sensorId:sensor?.sensorId||result.sensorId||null,inferenceBackend:this.inferenceBackend.id,detectorId:result.detectorId||result.modelId||null,detection:result};
  }
}

export const perceptionRuntimeAdapter=new PerceptionRuntimePolicyAdapter();
