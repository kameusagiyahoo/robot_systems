const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const angleWrap=d=>((d+180)%360+360)%360-180;
const rad2deg=r=>r*180/Math.PI;

export function densifyPath(start,waypoints,spacing=18){
  const pts=[{x:start.x,y:start.y}];
  let prev=pts[0];
  for(const wp of waypoints){
    const d=Math.hypot(wp.x-prev.x,wp.y-prev.y);
    const n=Math.max(1,Math.ceil(d/spacing));
    for(let i=1;i<=n;i++){
      const t=i/n;
      pts.push({x:prev.x+(wp.x-prev.x)*t,y:prev.y+(wp.y-prev.y)*t});
    }
    prev={x:wp.x,y:wp.y};
  }
  return pts;
}

export function purePursuitCommand(robot,path,{lookahead=55,wheelbase=52,maxSteeringAngle=35,maxSpeed=90,minSpeed=24}={}){
  if(!path.length)return{done:true,index:0,target:null,speed:0,steeringAngle:0,crossTrackError:0};
  let nearest=0,nearestDist=Infinity;
  for(let i=0;i<path.length;i++){
    const d=Math.hypot(path[i].x-robot.x,path[i].y-robot.y);
    if(d<nearestDist){nearestDist=d;nearest=i;}
  }
  let targetIndex=nearest;
  let accum=0;
  for(let i=nearest;i<path.length-1;i++){
    accum+=Math.hypot(path[i+1].x-path[i].x,path[i+1].y-path[i].y);
    targetIndex=i+1;
    if(accum>=lookahead)break;
  }
  const target=path[targetIndex];
  const goal=path[path.length-1];
  const goalDist=Math.hypot(goal.x-robot.x,goal.y-robot.y);
  if(goalDist<10)return{done:true,index:targetIndex,target:goal,speed:0,steeringAngle:0,crossTrackError:nearestDist};
  const desired=Math.atan2(target.y-robot.y,target.x-robot.x)*180/Math.PI;
  const alpha=angleWrap(desired-robot.yaw)*Math.PI/180;
  const delta=rad2deg(Math.atan2(2*wheelbase*Math.sin(alpha),Math.max(lookahead,1)));
  const steeringAngle=clamp(-delta,-maxSteeringAngle,maxSteeringAngle); // rear steer
  const curvaturePenalty=Math.max(0.28,1-Math.abs(steeringAngle)/maxSteeringAngle*0.72);
  const goalPenalty=Math.max(0.3,Math.min(1,goalDist/90));
  const speed=Math.max(minSpeed,maxSpeed*curvaturePenalty*goalPenalty);
  return{done:false,index:targetIndex,target,speed,steeringAngle,crossTrackError:nearestDist};
}
