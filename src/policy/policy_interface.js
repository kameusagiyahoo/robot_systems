export class PolicyInterface {
  constructor(store, robot, {environment=null,domainServices=null}={}) {
    this.store = store;
    this.robot = robot;
    this.environment = environment;
    this.domainServices = domainServices;
  }

  getState(){return this.environment?.getState?.()||this.store?.state||null}
  async sendAction(action){if(this.environment?.step)return await this.environment.step(action);return await Promise.resolve(this.robot?.sendAction?.(action))}

  async execute(_skill, _args = {}) {
    throw new Error('PolicyInterface.execute() must be implemented');
  }
}
