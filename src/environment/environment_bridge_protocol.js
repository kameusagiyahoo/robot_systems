export const ENVIRONMENT_BRIDGE_PROTOCOL='robot_systems.environment_bridge.v1';
export const ENVIRONMENT_BRIDGE_COMMANDS=Object.freeze({
  HANDSHAKE:'handshake',
  RESET:'reset',
  OBSERVE:'observe',
  STEP:'step',
  CONFIGURE_TRIAL:'configure_trial',
  METRICS:'metrics',
  DESCRIBE:'describe',
  DOMAIN_CALL:'domain_call',
  GENERATE_SCENARIOS:'generate_scenarios',
  APPLY_SCENARIO:'apply_scenario',
  TASK_TEXT:'task_text'
});

export const REMOTE_STATE_FIELDS=Object.freeze(['robot','pallets','locations','perception','simulation','obstacle','failures','path','benchmark']);

const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

export function makeBridgeRequest(command,payload={},requestId=null){
  if(!Object.values(ENVIRONMENT_BRIDGE_COMMANDS).includes(command))throw new Error(`unknown_environment_bridge_command:${command}`);
  return{protocol:ENVIRONMENT_BRIDGE_PROTOCOL,requestId:requestId||`req:${Date.now()}:${Math.random().toString(36).slice(2,9)}`,command,payload:payload||{}};
}

export function validateBridgeEnvelope(value,{requireResponse=false}={}){
  const issues=[];
  if(!isObject(value))return{ok:false,issues:['envelope_not_object']};
  if(value.protocol!==ENVIRONMENT_BRIDGE_PROTOCOL)issues.push(`protocol_mismatch:${value.protocol||'missing'}`);
  if(requireResponse&&typeof value.ok!=='boolean')issues.push('response_ok_missing');
  if(value.command&& !Object.values(ENVIRONMENT_BRIDGE_COMMANDS).includes(value.command))issues.push(`unknown_command:${value.command}`);
  return{ok:issues.length===0,issues};
}

export function assertBridgeResponse(body,{command=null,requestId=null}={}){
  const validation=validateBridgeEnvelope(body,{requireResponse:true});
  if(!validation.ok)throw new Error(`invalid_environment_bridge_response:${validation.issues.join(',')}`);
  if(requestId&&body.requestId&&body.requestId!==requestId)throw new Error(`environment_bridge_request_id_mismatch:${body.requestId}`);
  if(command&&body.command&&body.command!==command)throw new Error(`environment_bridge_command_mismatch:${body.command}`);
  if(body.ok===false)throw new Error(body.error||body.reason||'remote_environment_error');
  return body;
}

export function mergeRemoteRuntimeState(localState,remoteState){
  if(!isObject(localState)||!isObject(remoteState))return localState;
  for(const key of REMOTE_STATE_FIELDS){
    if(remoteState[key]===undefined)continue;
    const incoming=remoteState[key];
    if(isObject(localState[key])&&isObject(incoming))localState[key]={...localState[key],...incoming};
    else localState[key]=incoming;
  }
  return localState;
}

export function describeEnvironmentBridgeProtocol(){
  return{
    protocol:ENVIRONMENT_BRIDGE_PROTOCOL,
    transport:'request/response JSON; HTTP POST is the first transport, WebSocket can reuse the same envelopes',
    commands:{...ENVIRONMENT_BRIDGE_COMMANDS},
    responseShape:{protocol:ENVIRONMENT_BRIDGE_PROTOCOL,requestId:'echo request id',command:'echo command',ok:true,data:'command-specific payload',state:'optional semantic runtime-state patch',descriptor:'optional environment descriptor'},
    ownership:{upperLayer:['task','agent'],environment:['robot','pallets','locations','perception','simulation','obstacle','failures','path','benchmark']},
    rule:'Environment-native simulator objects/topics must be translated by the bridge. Browser upper layers consume semantic state and domain services only.'
  };
}
