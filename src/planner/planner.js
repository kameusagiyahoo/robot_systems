export class Planner{
  constructor(adapter){this.adapter=adapter}
  async createTask(taskText){return this.adapter.parseTask(taskText)}
  async next(task,state){return this.adapter.next(task,state)}
}
