export class PolicyInterface {
  constructor(store, robot) {
    this.store = store;
    this.robot = robot;
  }

  async execute(_skill, _args = {}) {
    throw new Error('PolicyInterface.execute() must be implemented');
  }
}
