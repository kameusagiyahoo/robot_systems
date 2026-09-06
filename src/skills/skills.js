import {routeSkillRuntime} from '../learning/framework/runtime_router.js';
import {ObjectDomainServiceProvider,CompositeDomainServiceProvider} from '../learning/framework/domain_service_interface.js';

const skillSpecs={
  navigate_to_pallet:{pre:(s,a)=>s.pallets[a.palletId]?'ok':'pallet_not_found',post:()=>true},
  detect_pallet:{pre:(s,a)=>s.pallets[a.palletId]?'ok':'pallet_not_found',post:(s,a,r)=>!r.ok||s.perception.detectedPallets.includes(a.palletId)},
  align_to_pallet:{pre:(s,a)=>s.perception.detectedPallets.includes(a.palletId)?'ok':'pallet_not_detected',post:(s,a,r)=>!r.ok||s.robot.aligned},
  insert_forks:{pre:(s)=>s.robot.aligned?'ok':'not_aligned',post:(s,a,r)=>!r.ok||s.robot.carrying===a.palletId},
  lift:{pre:(s)=>s.robot.carrying?'ok':'no_load',post:(s,a,r)=>!r.ok||s.robot.forkRaised},
  navigate_to:{pre:(s,a)=>s.locations[a.locationId]?'ok':'location_not_found',post:()=>true},
  place:{pre:(s)=>s.robot.carrying?'ok':'no_load',post:(s,a,r)=>!r.ok||!s.robot.carrying},
  retreat:{pre:()=> 'ok',post:(s,a,r)=>!r.ok||s.agent.memory.retreated},
  avoid_obstacle:{pre:(s)=>s.obstacle?.enabled?'ok':'no_obstacle',post:(s,a,r)=>!r.ok||s.agent.memory.alternateRoute},
  reposition_for_detection:{pre:()=> 'ok',post:()=>true}
};

export class SkillExecutor{
  constructor(storeOrEnvironment,policy,{environment=null}={}){
    const looksLikeEnvironment=!!storeOrEnvironment?.getState&&!!storeOrEnvironment?.getStore;
    this.environment=looksLikeEnvironment?storeOrEnvironment:environment;
    this.store=looksLikeEnvironment?storeOrEnvironment.getStore():storeOrEnvironment;
    this.policy=policy;
    if(!this.store)throw new Error('skill_executor_store_required');
  }

  environmentServices(){
    const services=this.environment?.getDomainServices?.()||{};
    return new ObjectDomainServiceProvider({id:`${this.environment?.id||'legacy'}_environment_domain`,label:`${this.environment?.label||'Legacy'} Environment Domain Services`,version:this.environment?.version||1,services});
  }

  fallbackServices(){
    const policy=this.policy;
    return new ObjectDomainServiceProvider({
      id:'policy_compat_domain',label:'Policy Compatibility Domain Services',version:2,
      services:{
        'path.to':target=>typeof policy.pathTo==='function'?policy.pathTo(target):[target],
        'path.palletApproach':pallet=>typeof policy.palletApproachPath==='function'?policy.palletApproachPath(pallet):[{x:pallet.x-170,y:pallet.y},{x:pallet.x-125,y:pallet.y}],
        'state.emit':()=>this.store.emit(),
        'state.get':()=>this.store.state,
        'action.send':action=>Promise.resolve(policy.robot?.sendAction?.(action))
      }
    });
  }

  domainServices(){
    return new CompositeDomainServiceProvider({id:'skill_runtime_domain',label:'Skill Runtime Domain Services',version:2,providers:[this.environmentServices(),this.fallbackServices()]});
  }

  runtimeContext(){
    const policy=this.policy,domainServices=this.domainServices(),environmentDescriptor=this.environment?.describe?.()||null;
    return{store:this.store,robot:this.environment?.getRobot?.()||policy.robot,environment:this.environment,environmentDescriptor,classicPolicy:policy,domainServices,domainServiceDescriptor:domainServices.describe()};
  }

  async execute(step){
    const spec=skillSpecs[step.name];
    if(!spec)return{ok:false,reason:`unknown_skill:${step.name}`};
    const args=step.args||{},state=this.environment?.getState?.()||this.store.state;
    const pre=spec.pre(state,args);
    if(pre!=='ok')return{ok:false,reason:`precondition_failed:${pre}`};

    const routed=await routeSkillRuntime(step.name,args,this.runtimeContext());
    const result=routed.handled?routed.result:await this.policy.execute(step.name,args);
    const after=this.environment?.getState?.()||this.store.state;
    if(result.ok&&!spec.post(after,args,result))return{ok:false,reason:'postcondition_failed'};
    const environmentId=this.environment?.id||null;
    return routed.handled?{...result,runtimePlugin:routed.pluginId||null,runtimeAdapter:routed.adapterId||null,environmentId}:{...result,environmentId};
  }
}
