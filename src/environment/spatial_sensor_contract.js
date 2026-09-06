export const SPATIAL_STATE_SCHEMA='robot_systems.spatial_state.v1';
export const SENSOR_PACKET_SCHEMA='robot_systems.sensor_packet.v1';

const finite=v=>Number.isFinite(Number(v));
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

export function pose3(x=0,y=0,z=0,qx=0,qy=0,qz=0,qw=1,frame='world'){
  return{frame,position:{x,y,z},orientation:{x:qx,y:qy,z:qz,w:qw}};
}

export function validatePose3(value){
  const issues=[];if(!object(value))return{ok:false,issues:['pose_not_object'],schema:SPATIAL_STATE_SCHEMA};
  if(!object(value.position))issues.push('position_missing');else for(const k of ['x','y','z'])if(!finite(value.position[k]))issues.push(`position_${k}_invalid`);
  if(!object(value.orientation))issues.push('orientation_missing');else for(const k of ['x','y','z','w'])if(!finite(value.orientation[k]))issues.push(`orientation_${k}_invalid`);
  if(!value.frame)issues.push('frame_missing');return{ok:issues.length===0,issues,schema:SPATIAL_STATE_SCHEMA};
}

export function validateSpatialState(spatial){
  const issues=[];if(!object(spatial))return{ok:false,issues:['spatial_not_object'],schema:SPATIAL_STATE_SCHEMA};
  const robot=validatePose3(spatial.robotPose);if(!robot.ok)issues.push(...robot.issues.map(x=>`robotPose:${x}`));
  if(spatial.entities&&!object(spatial.entities))issues.push('entities_invalid');
  if(spatial.twist){const linear=spatial.twist.linear||{},angular=spatial.twist.angular||{};for(const[k,v]of Object.entries({...linear,...Object.fromEntries(Object.entries(angular).map(([k,v])=>[`angular_${k}`,v]))}))if(!finite(v))issues.push(`twist_${k}_invalid`)}
  return{ok:issues.length===0,issues,schema:SPATIAL_STATE_SCHEMA};
}

export function sensorPacket({sensorId,type,frame,timestamp=Date.now(),encoding=null,shape=null,data=null,meta={}}={}){
  if(!sensorId)throw new Error('sensor_id_required');if(!type)throw new Error('sensor_type_required');return{schema:SENSOR_PACKET_SCHEMA,sensorId,type,frame:frame||sensorId,timestamp,encoding,shape,data,meta};
}

export function validateSensorPacket(packet){
  const issues=[];if(!object(packet))return{ok:false,issues:['sensor_packet_not_object'],schema:SENSOR_PACKET_SCHEMA};
  if(packet.schema&&packet.schema!==SENSOR_PACKET_SCHEMA)issues.push(`sensor_schema_mismatch:${packet.schema}`);if(!packet.sensorId)issues.push('sensor_id_missing');if(!packet.type)issues.push('sensor_type_missing');if(!packet.frame)issues.push('sensor_frame_missing');if(!finite(packet.timestamp))issues.push('sensor_timestamp_invalid');return{ok:issues.length===0,issues,schema:SENSOR_PACKET_SCHEMA};
}

export function describeSpatialSensorContracts(){
  return{
    spatial:{schema:SPATIAL_STATE_SCHEMA,frames:'Named coordinate frames; bridge is responsible for simulator-native transform conversion.',pose:'position xyz + quaternion xyzw',twist:'linear/angular vectors in declared units'},
    sensors:{schema:SENSOR_PACKET_SCHEMA,types:['rgb','depth','lidar','pointcloud','imu','odometry','contact','joint_state','fork_state','custom'],rule:'Large binary payloads may be referenced by URL/stream handle instead of embedded JSON data.'},
    compatibility:'Task Runtime State v1 may keep x/y/yaw for current Planner/Skill compatibility while spatial.robotPose carries full 3D pose.'
  };
}
