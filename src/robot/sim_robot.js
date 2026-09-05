import {RobotInterface} from './robot_interface.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const deg2rad=d=>d*Math.PI/180;
const rad2deg=r=>r*180/Math.PI;
const pointInExpandedRect=(x,y,radius,rect)=>x>=rect.x-radius&&x<=rect.x+rect.w+radius&&y>=rect.y-radius&&y<=rect.y+rect.h+radius;

export class SimRobot extends RobotInterface{
  constructor(store){super();this.store=store;this.connected=false}
  connect(){this.connected=true;return{ok:true}}
  disconnect(){this.connected=false;return{ok:true}}
  getObservation(){const s=this.store.state;return JSON.parse(JSON.stringify({robot:s.robot,pallets:s.pallets,locations:s.locations,task:s.task,obstacle:s.obstacle,simulation:s.simulation}))}
  sendAction(action){
    const s=this.store.state,r=s.robot,sim=s.simulation;
    switch(action.type){
      case'drive':{
        const dt=action.dt??sim.dt;
        const targetSpeed=clamp(action.speed??0,-sim.maxLinearSpeed,sim.maxLinearSpeed);
        const targetSteer=clamp(action.steeringAngle??0,-sim.maxSteeringAngle,sim.maxSteeringAngle);
        const dv=clamp(targetSpeed-r.speed,-sim.maxAcceleration*dt,sim.maxAcceleration*dt);
        const ds=clamp(targetSteer-r.steeringAngle,-sim.maxSteeringRate*dt,sim.maxSteeringRate*dt);
        const nextSpeed=r.speed+dv;
        const nextSteer=r.steeringAngle+ds;
        const yawRateRad=-(nextSpeed/sim.wheelbase)*Math.tan(deg2rad(nextSteer));
        const nextYaw=(r.yaw+rad2deg(yawRateRad*dt)+360)%360;
        const heading=deg2rad(nextYaw);
        const dx=Math.cos(heading)*nextSpeed*dt,dy=Math.sin(heading)*nextSpeed*dt;
        const nx=clamp(r.x+dx,25,875),ny=clamp(r.y+dy,25,535);
        if(s.obstacle.enabled&&pointInExpandedRect(nx,ny,sim.robotRadius,s.obstacle)){
          r.speed=0;r.angularVelocity=0;sim.collisions++;sim.controlTicks++;this.store.emit();
          return{ok:false,reason:'collision_detected'};
        }
        r.speed=nextSpeed;r.steeringAngle=nextSteer;r.angularVelocity=rad2deg(yawRateRad);r.yaw=nextYaw;r.x=nx;r.y=ny;
        sim.pathLength+=Math.hypot(dx,dy);sim.controlTicks++;
        break;
      }
      case'move':{
        const nx=clamp(r.x+(action.dx||0),25,875),ny=clamp(r.y+(action.dy||0),25,535);
        if(s.obstacle.enabled&&pointInExpandedRect(nx,ny,sim.robotRadius,s.obstacle)){sim.collisions++;this.store.emit();return{ok:false,reason:'collision_detected'};}
        sim.pathLength+=Math.hypot(nx-r.x,ny-r.y);r.x=nx;r.y=ny;break;
      }
      case'yaw':r.yaw=(r.yaw+(action.delta||0)+360)%360;break;
      case'fork':r.forkRaised=!!action.raised;break;
      case'stop':r.speed=0;r.angularVelocity=0;r.steeringAngle=0;break;
      default:return{ok:false,reason:'unknown_action'};
    }
    this.store.emit();return{ok:true};
  }
}
