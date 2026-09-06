const KEY='robot_systems_remote_environment_config_v1';

export function loadRemoteEnvironmentConfig(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value&&typeof value==='object'?value:null}catch{return null}}
export function remoteEnvironmentConfigured(){return !!loadRemoteEnvironmentConfig()?.baseUrl}

function sanitizeDescriptor(descriptor){
  if(!descriptor||typeof descriptor!=='object')return null;
  return{
    id:descriptor.remoteEnvironmentId||descriptor.id||null,
    label:descriptor.remoteEnvironmentLabel||descriptor.label||null,
    version:descriptor.remoteEnvironmentVersion??descriptor.version??null,
    kind:descriptor.kind||null,
    fidelity:descriptor.fidelity||null,
    stateContract:descriptor.stateContract||null,
    coordinateFrame:descriptor.coordinateFrame||null,
    units:descriptor.units||null,
    capabilities:descriptor.capabilities||null,
    sensorManifest:Array.isArray(descriptor.sensorManifest)?descriptor.sensorManifest.map(s=>({sensorId:s.sensorId||null,type:s.type||null,topic:s.topic||null,available:!!s.available,transport:s.transport||null})):[],
    driveAdapter:descriptor.driveAdapter||null,
    gazebo:descriptor.gazebo||null,
    intendedUse:descriptor.intendedUse||null,
    limitations:Array.isArray(descriptor.limitations)?descriptor.limitations:[],
    capturedAt:new Date().toISOString()
  };
}

export function saveRemoteEnvironmentConfig({baseUrl,endpoint='/environment',timeoutMs=15000,lastDescriptor=undefined}={}){
  const previous=loadRemoteEnvironmentConfig()||{},url=String(baseUrl||'').trim().replace(/\/$/,'');if(!url)throw new Error('remote_environment_base_url_required');
  let parsed;try{parsed=new URL(url)}catch{throw new Error('remote_environment_base_url_invalid')}
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('remote_environment_url_must_be_http_or_https');
  const config={baseUrl:url,endpoint:String(endpoint||'/environment').startsWith('/')?String(endpoint||'/environment'):`/${endpoint}`,timeoutMs:Math.max(1000,Math.min(120000,Number(timeoutMs)||15000)),lastDescriptor:lastDescriptor===undefined?(previous.lastDescriptor||null):sanitizeDescriptor(lastDescriptor),savedAt:new Date().toISOString()};
  localStorage.setItem(KEY,JSON.stringify(config));return config;
}

export function saveRemoteEnvironmentDescriptor(descriptor){const config=loadRemoteEnvironmentConfig();if(!config?.baseUrl)return null;return saveRemoteEnvironmentConfig({...config,lastDescriptor:descriptor})}
export function loadRemoteEnvironmentDescriptor(){return loadRemoteEnvironmentConfig()?.lastDescriptor||null}
export function remoteEnvironmentScope(){const d=loadRemoteEnvironmentDescriptor();return{environmentId:'remote_bridge',remoteEnvironmentId:d?.id||null}}
export function clearRemoteEnvironmentConfig(){localStorage.removeItem(KEY)}
export function remoteEnvironmentSecurityHint(){return location.protocol==='https:'?'GitHub Pages(HTTPS)からLAN内HTTPへはブラウザに遮断される場合があります。HTTPS Bridgeまたは同一Origin Proxyを使用してください。':'ローカルHTTP UIではHTTP Bridgeも接続できます。'}
