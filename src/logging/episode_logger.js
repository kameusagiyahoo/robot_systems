export class EpisodeLogger{
  constructor(){this.current=null;this.completed=[]}
  start(task){this.current={id:`ep_${Date.now()}`,startedAt:new Date().toISOString(),endedAt:null,task:JSON.parse(JSON.stringify(task)),steps:[],metrics:{stepCount:0,failures:0,recoveries:0,success:false}};return this.current}
  record(observation,action,result,nextObservation){if(!this.current)return;this.current.steps.push({observation,action,result,nextObservation});this.current.metrics.stepCount=this.current.steps.length;if(!result.ok)this.current.metrics.failures++}
  recovery(){if(this.current)this.current.metrics.recoveries++}
  finish(success,status){if(!this.current)return null;this.current.endedAt=new Date().toISOString();this.current.metrics.success=!!success;this.current.status=status;const done=this.current;this.completed.push(done);this.current=null;return done}
  exportLatest(){const ep=this.current||this.completed.at(-1);return ep?JSON.stringify(ep,null,2):null}
}
