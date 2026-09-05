export class Planner{constructor(adapter){this.adapter=adapter}async plan(task,state){return this.adapter.plan(task,state)}}
