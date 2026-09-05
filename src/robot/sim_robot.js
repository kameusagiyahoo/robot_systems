import {RobotInterface} from './robot_interface.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export class SimRobot extends RobotInterface{
  constructor(store){super();this.store=store;this.connected=false}
  connect(){this.connected=true;return{ok:true}}
  disconnect(){this.connected=false;return{ok:true}}
  getObservation(){const s=this.store.state;return JSON.parse(JSON.stringify({robot:s.robot,pallets:s.pallets,locations:s.locations,task:s.task,obstacle:s.obstacle,simulation:s.simulation}))}
  sendAction(action){
    const s=this.store.state,r=s.robot;
    switch(action.type){
      case'velocity':{
        const dt=action.dt??s.simulation.dt;
        const linear=clamp(action.linear??0,-s.simulation.maxLinearSpeed,s.simulation.maxLinearSpeed);
        const angular=clamp(action.angular??0,-s.simulation.maxAngularSpeed,s.simulation.maxAngularSpeed);
        r.speed=linear;r.angularVelocity=angular;
        r.yaw=(r.yaw+angular*dt+360)%360;
        const rad=r.yaw*Math.PI/180;
        const dx=Math.cos(rad)*linear*dt,dy=Math.sin(rad)*linear*dt;
        r.x+=dx;r.y+=dy;
        s.simulation.pathLength+=Math.hypot(dx,dy);s.simulation.controlTicks++;
        break;
      }
      case'move':r.x+=action.dx||0;r.y+=action.dy||0;s.simulation.pathLength+=Math.hypot(action.dx||0,action.dy||0);break;
      case'yaw':r.yaw=(r.yaw+(action.delta||0)+360)%360;break;
      case'fork':r.forkRaised=!!action.raised;break;
      case'stop':r.speed=0;r.angularVelocity=0;break;
      default:return{ok:false,reason:'unknown_action'};
    }
    r.x=clamp(r.x,25,875);r.y=clamp(r.y,25,535);this.store.emit();return{ok:true};
  }
}
