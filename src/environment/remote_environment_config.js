const KEY='robot_systems_remote_environment_config_v1';

export function loadRemoteEnvironmentConfig(){
  try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value&&typeof value==='object'?value:null}catch{return null}
}

export function remoteEnvironmentConfigured(){return !!loadRemoteEnvironmentConfig()?.baseUrl}

export function saveRemoteEnvironmentConfig({baseUrl,endpoint='/environment',timeoutMs=15000}={}){
  const url=String(baseUrl||'').trim().replace(/\/$/,'');if(!url)throw new Error('remote_environment_base_url_required');
  let parsed;try{parsed=new URL(url)}catch{throw new Error('remote_environment_base_url_invalid')}
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('remote_environment_url_must_be_http_or_https');
  const config={baseUrl:url,endpoint:String(endpoint||'/environment').startsWith('/')?String(endpoint||'/environment'):`/${endpoint}`,timeoutMs:Math.max(1000,Math.min(120000,Number(timeoutMs)||15000)),savedAt:new Date().toISOString()};
  localStorage.setItem(KEY,JSON.stringify(config));return config;
}

export function clearRemoteEnvironmentConfig(){localStorage.removeItem(KEY)}
export function remoteEnvironmentSecurityHint(){return location.protocol==='https:'?'GitHub Pages(HTTPS)からLAN内HTTPへはブラウザに遮断される場合があります。HTTPS Bridgeまたは同一Origin Proxyを使用してください。':'ローカルHTTP UIではHTTP Bridgeも接続できます。'}
