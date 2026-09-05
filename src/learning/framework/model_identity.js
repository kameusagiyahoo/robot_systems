const IDENTITY_IGNORED_KEYS=new Set(['modelId','checksum','identityAlgorithm','importedFromPackageAt','packageChecksum']);
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!IDENTITY_IGNORED_KEYS.has(k)).map(k=>[k,stable(value[k])]));
  return value;
}
function stableJson(value){return JSON.stringify(stable(value))}
function fallbackHash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
function hex(buffer){return[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('')}

export async function checksumValue(value){
  const text=stableJson(value);
  if(globalThis.crypto?.subtle){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return{checksum:hex(digest),algorithm:'sha256'};
  }
  return{checksum:fallbackHash(text),algorithm:'fnv1a32'};
}

export async function identifySkillModel(skillId,model){
  if(!model)throw new Error('model_required_for_identity');
  const payload={...model,skillId},algo=payload.algorithm||'model',identity=await checksumValue(payload);
  return{...payload,modelId:`${skillId}:${algo}:${identity.checksum.slice(0,12)}`,checksum:identity.checksum,identityAlgorithm:identity.algorithm};
}

export async function verifySkillModelIdentity(model){
  if(!model?.checksum)return{valid:false,reason:'checksum_missing'};
  const {checksum,algorithm}=await checksumValue(model);
  return{valid:checksum===model.checksum,expected:model.checksum,actual:checksum,algorithm};
}
