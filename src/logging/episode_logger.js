export class EpisodeLogger{
  constructor(){this.current=null;this.completed=[]}
  start(task){this.current={id:`ep_${Date.now()}`,startedAt:new Date().toISOString(),endedAt:null,task:JSON.parse(JSON.stringify(task)),steps:[],metrics:{stepCount:0,failures:0,recoveries:0,success:false,pathLength:0,controlTicks:0,collisions:0,elapsedMs:0}};return this.current}
  record(observation,action,result,nextObservation){if(!this.current)return;this.current.steps.push({observation,action,result,nextObservation});this.current.metrics.stepCount=this.current.steps.length;if(!result.ok)this.current.metrics.failures++;this.current.metrics.pathLength=nextObservation?.simulation?.pathLength??this.current.metrics.pathLength;this.current.metrics.controlTicks=nextObservation?.simulation?.controlTicks??this.current.metrics.controlTicks;this.current.metrics.collisions=nextObservation?.simulation?.collisions??this.current.metrics.collisions}
  recovery(){if(this.current)this.current.metrics.recoveries++}
  finish(success,status){if(!this.current)return null;this.current.endedAt=new Date().toISOString();this.current.metrics.success=!!success;this.current.metrics.elapsedMs=new Date(this.current.endedAt)-new Date(this.current.startedAt);this.current.status=status;const done=this.current;this.completed.push(done);this.current=null;return done}
  exportLatest(){const ep=this.current||this.completed.at(-1);return ep?JSON.stringify(ep,null,2):null}
}
