export function buildEnvironmentMetadata(environment){
  if(!environment)return null;
  const descriptor=environment.describe?.()||{id:environment.id||null,label:environment.label||null,version:environment.version??null};
  let validation=null;try{validation=environment.validateState?.()||null}catch(error){validation={ok:false,issues:[error?.message||String(error)]}}
  return{
    id:descriptor.id||environment.id||null,
    label:descriptor.label||environment.label||null,
    version:descriptor.version??environment.version??null,
    kind:descriptor.kind||null,
    fidelity:descriptor.fidelity||null,
    stateContract:descriptor.stateContract||null,
    nativeRuntime:descriptor.nativeRuntime||null,
    coordinateFrame:descriptor.coordinateFrame||null,
    units:descriptor.units||null,
    intendedUse:descriptor.intendedUse||null,
    validation,
    capturedAt:new Date().toISOString()
  };
}

export function environmentResultMetadata(environment){const d=environment?.describe?.()||{};return{environmentId:d.id||environment?.id||null,environmentVersion:d.version??environment?.version??null,environmentFidelity:d.fidelity||null,stateContract:d.stateContract||null}}
