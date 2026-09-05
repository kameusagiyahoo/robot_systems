export class EpisodeLogger{
  constructor(){this.current=null;this.completed=[]}
  start(task,meta={}){this.current={id:`ep_${Date.now()}`,startedAt:new Date().toISOString(),endedAt:null,task:JSON.parse(JSON.stringify(task)),meta:JSON.parse(JSON.stringify(meta)),steps:[],metrics:{stepCount:0,failures:0,recoveries:0,success:false,pathLength:0,controlTicks:0,collisions:0,elapsedMs:0,meanCrossTrackError:null}};return this.current}
  record(observation,action,result,nextObservation){
    if(!this.current)return;
    const learning={skillId:action?.skill||null,policy:result?.policy||null,runtimePlugin:result?.runtimePlugin||null,runtimeAdapter:result?.runtimeAdapter||null};
    this.current.steps.push({observation,action,result,nextObservation,learning});
    const m=this.current.metrics;m.stepCount=this.current.steps.length;if(!result.ok)m.failures++;m.pathLength=nextObservation?.simulation?.pathLength??m.pathLength;m.controlTicks=nextObservation?.simulation?.controlTicks??m.controlTicks;m.collisions=nextObservation?.simulation?.collisions??m.collisions;const values=this.current.steps.map(s=>s.result?.meanCrossTrackError).filter(v=>Number.isFinite(v));m.meanCrossTrackError=values.length?values.reduce((a,b)=>a+b,0)/values.length:null
  }
  recovery(){if(this.current)this.current.metrics.recoveries++}
  finish(success,status){if(!this.current)return null;this.current.endedAt=new Date().toISOString();this.current.metrics.success=!!success;this.current.metrics.elapsedMs=new Date(this.current.endedAt)-new Date(this.current.startedAt);this.current.status=status;const done=this.current;this.completed.push(done);this.current=null;return done}
  exportLatest(){const ep=this.current||this.completed.at(-1);return ep?JSON.stringify(ep,null,2):null}
}
