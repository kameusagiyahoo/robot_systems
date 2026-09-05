export class SkillDomainServiceProvider{
  constructor({id,label,version=1}={}){if(!id)throw new Error('domain_service_provider_id_required');this.id=id;this.label=label||id;this.version=version}
  has(){return false}
  list(){return[]}
  call(name,..._args){throw new Error(`domain_service_not_available:${this.id}:${name}`)}
  describe(){return{id:this.id,label:this.label,version:this.version,services:this.list()}}
}

export class ObjectDomainServiceProvider extends SkillDomainServiceProvider{
  constructor({id,label,version=1,services={}}={}){super({id,label,version});this.services=new Map(Object.entries(services))}
  has(name){return this.services.has(name)}
  list(){return[...this.services.keys()]}
  call(name,...args){const fn=this.services.get(name);if(typeof fn!=='function')throw new Error(`domain_service_not_available:${this.id}:${name}`);return fn(...args)}
}
