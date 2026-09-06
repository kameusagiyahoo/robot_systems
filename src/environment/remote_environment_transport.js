import {ENVIRONMENT_BRIDGE_PROTOCOL,makeBridgeRequest,assertBridgeResponse} from './environment_bridge_protocol.js';

export {ENVIRONMENT_BRIDGE_PROTOCOL};

export class RemoteEnvironmentTransport{
  constructor({id='remote_transport',label='Remote Environment Transport',version=1}={}){this.id=id;this.label=label;this.version=version}
  async connect(){return{ok:true}}
  async disconnect(){return{ok:true}}
  async request(_command,_payload={}){throw new Error(`remote_environment_request_not_implemented:${this.id}`)}
  describe(){return{id:this.id,label:this.label,version:this.version,protocol:ENVIRONMENT_BRIDGE_PROTOCOL}}
}

export class HttpJsonEnvironmentTransport extends RemoteEnvironmentTransport{
  constructor({baseUrl,endpoint='/environment',headers={},timeoutMs=15000,fetchImpl=globalThis.fetch,credentials='omit'}={}){
    super({id:'http_json_environment_transport',label:'HTTP JSON Environment Transport',version:2});
    if(!baseUrl)throw new Error('remote_environment_base_url_required');
    if(typeof fetchImpl!=='function')throw new Error('fetch_unavailable');
    this.baseUrl=String(baseUrl).replace(/\/$/,'');this.endpoint=endpoint.startsWith('/')?endpoint:`/${endpoint}`;this.headers={...headers};this.timeoutMs=timeoutMs;this.fetchImpl=fetchImpl;this.credentials=credentials;
  }
  url(){return`${this.baseUrl}${this.endpoint}`}
  async request(command,payload={}){
    const request=makeBridgeRequest(command,payload),controller=new AbortController(),timer=setTimeout(()=>controller.abort('remote_environment_timeout'),Math.max(1000,Number(this.timeoutMs)||15000));
    try{
      const response=await this.fetchImpl(this.url(),{method:'POST',headers:{'content-type':'application/json',...this.headers},body:JSON.stringify(request),signal:controller.signal,credentials:this.credentials});
      if(!response.ok)throw new Error(`remote_environment_http_${response.status}`);
      const body=await response.json();return assertBridgeResponse(body,{command,requestId:request.requestId});
    }catch(error){if(controller.signal.aborted)throw new Error('remote_environment_timeout');throw error}finally{clearTimeout(timer)}
  }
  describe(){return{...super.describe(),kind:'http_json',endpoint:this.endpoint,baseUrl:this.baseUrl,timeoutMs:this.timeoutMs,credentials:this.credentials,securityNote:'Do not embed secrets in GitHub Pages. Prefer same-origin reverse proxy or short-lived authenticated bridge sessions for private simulators.'}}
}
