export class EnvironmentAdapter{
  constructor({id,label,version=1,kind='simulation',fidelity='unknown',available=true}={}){
    if(!id)throw new Error('environment_adapter_id_required');
    this.id=id;this.label=label||id;this.version=version;this.kind=kind;this.fidelity=fidelity;this.available=available;
  }
  async connect(){return{ok:true}}
  async disconnect(){return{ok:true}}
  async reset(_options={}){throw new Error(`environment_reset_not_implemented:${this.id}`)}
  getState(){throw new Error(`environment_state_not_implemented:${this.id}`)}
  getStore(){return null}
  getRobot(){return null}
  observe(){const robot=this.getRobot();return robot?.getObservation?.()??this.getState()}
  async step(action){const robot=this.getRobot();if(!robot?.sendAction)throw new Error(`environment_step_not_implemented:${this.id}`);return await Promise.resolve(robot.sendAction(action))}
  subscribe(_listener){return()=>{}}
  render(_state=this.getState()){}
  getMetrics(){return{}}
  getDomainServices(){return{}}
  generateScenarios(_seed,_count){return[]}
  applyScenario(_scenario){throw new Error(`environment_scenario_not_supported:${this.id}`)}
  async configureTrial(_spec){throw new Error(`environment_trial_configuration_not_supported:${this.id}`)}
  taskTextForScenario(_scenario){return null}
  validateState(){return{ok:true,issues:[]}}
  describe(){
    return{
      id:this.id,label:this.label,version:this.version,kind:this.kind,fidelity:this.fidelity,available:this.available,
      capabilities:{
        reset:this.reset!==EnvironmentAdapter.prototype.reset,
        observation:true,
        step:true,
        rendering:this.render!==EnvironmentAdapter.prototype.render,
        scenarios:this.applyScenario!==EnvironmentAdapter.prototype.applyScenario,
        trialConfiguration:this.configureTrial!==EnvironmentAdapter.prototype.configureTrial,
        metrics:true,
        domainServices:Object.keys(this.getDomainServices?.()||{})
      }
    };
  }
}

export class UnavailableEnvironmentAdapter extends EnvironmentAdapter{
  constructor({reason='adapter_not_installed',...descriptor}={}){super({...descriptor,available:false});this.reason=reason}
  async connect(){throw new Error(`environment_unavailable:${this.id}:${this.reason}`)}
  async reset(){throw new Error(`environment_unavailable:${this.id}:${this.reason}`)}
  async configureTrial(){throw new Error(`environment_unavailable:${this.id}:${this.reason}`)}
  getState(){return null}
  describe(){return{...super.describe(),available:false,reason:this.reason}}
}
