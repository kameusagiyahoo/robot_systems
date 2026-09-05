const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const angleWrap=d=>((d+180)%360+360)%360-180;

export class PIDPathController{
  constructor(){this.integral=0;this.prevError=0;this.initialized=false}
  reset(){this.integral=0;this.prevError=0;this.initialized=false}
  command(robot,path,{kp=0.8,ki=0.01,kd=0.18,cteGain=1.2,dt=0.08,maxSteeringAngle=35,maxSpeed=85,minSpeed=8,goalTolerance=12}={}){
    if(!path?.length)return{done:true,speed:0,steeringAngle:0,index:0,crossTrackError:0,target:null,goalDistance:0};
    let nearest=0,best=Infinity;
    for(let i=0;i<path.length;i++){const d=Math.hypot(path[i].x-robot.x,path[i].y-robot.y);if(d<best){best=d;nearest=i}}
    const goal=path[path.length-1];
    const goalDist=Math.hypot(goal.x-robot.x,goal.y-robot.y);
    if(goalDist<=goalTolerance)return{done:true,speed:0,steeringAngle:0,index:path.length-1,crossTrackError:best,target:goal,goalDistance:goalDist};
    const next=Math.min(path.length-1,nearest+2),p0=path[nearest],p1=path[next];
    const tangent=Math.atan2(p1.y-p0.y,p1.x-p0.x)*180/Math.PI;
    const headingError=angleWrap(tangent-robot.yaw);
    const tx=p1.x-p0.x,ty=p1.y-p0.y,len=Math.hypot(tx,ty)||1;
    const signedCte=((robot.x-p0.x)*ty-(robot.y-p0.y)*tx)/len;
    const cteCorrection=Math.atan2(cteGain*signedCte,Math.max(12,Math.abs(robot.speed))) * 180/Math.PI;
    const error=angleWrap(headingError+cteCorrection);
    if(!this.initialized){this.prevError=error;this.initialized=true}
    this.integral=clamp(this.integral+error*dt,-60,60);
    const derivative=(error-this.prevError)/Math.max(dt,1e-6);this.prevError=error;
    const steering=clamp(-(kp*error+ki*this.integral+kd*derivative),-maxSteeringAngle,maxSteeringAngle);
    const speedScale=Math.max(0.22,1-Math.abs(steering)/Math.max(maxSteeringAngle,1)*0.75);
    const approachSpeed=clamp(goalDist*1.05,minSpeed,maxSpeed);
    const speed=Math.min(approachSpeed,maxSpeed*speedScale);
    return{done:false,speed,steeringAngle:steering,index:nearest,crossTrackError:Math.abs(signedCte),target:p1,error,headingError,signedCte,goalDistance:goalDist};
  }
}
