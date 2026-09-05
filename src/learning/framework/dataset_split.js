function rng(seed=42){let a=(Number(seed)||42)>>>0;return()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296}}
function shuffledIndices(length,seed){const out=Array.from({length},(_,i)=>i),r=rng(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}

export function splitSamplesDeterministic(samples,{validationRatio=.2,seed=42}={}){
  const source=Array.isArray(samples)?samples:[],ratio=Math.max(0,Math.min(.5,Number(validationRatio)||0));
  if(source.length<2||ratio<=0)return{train:[...source],validation:[],meta:{strategy:'sample',validationRatio:0,seed:Number(seed)||42}};
  const order=shuffledIndices(source.length,seed),validationCount=Math.max(1,Math.min(source.length-1,Math.round(source.length*ratio))),validationSet=new Set(order.slice(0,validationCount));
  return{train:source.filter((_,i)=>!validationSet.has(i)),validation:source.filter((_,i)=>validationSet.has(i)),meta:{strategy:'sample',validationRatio:validationCount/source.length,seed:Number(seed)||42}};
}

export function splitEpisodesDeterministic(episodes,{validationRatio=.2,seed=42,sampleSelector=e=>e?.samples||[]}={}){
  const source=(Array.isArray(episodes)?episodes:[]).filter(e=>Array.isArray(sampleSelector(e))&&sampleSelector(e).length),ratio=Math.max(0,Math.min(.5,Number(validationRatio)||0));
  if(source.length<2||ratio<=0){const train=source.flatMap(sampleSelector);return{train,validation:[],trainEpisodes:source,validationEpisodes:[],meta:{strategy:'episode',validationRatio:0,seed:Number(seed)||42,episodes:source.length}}}
  const order=shuffledIndices(source.length,seed),validationCount=Math.max(1,Math.min(source.length-1,Math.round(source.length*ratio))),validationSet=new Set(order.slice(0,validationCount));
  const trainEpisodes=source.filter((_,i)=>!validationSet.has(i)),validationEpisodes=source.filter((_,i)=>validationSet.has(i));
  const train=trainEpisodes.flatMap(sampleSelector),validation=validationEpisodes.flatMap(sampleSelector),total=train.length+validation.length;
  return{train,validation,trainEpisodes,validationEpisodes,meta:{strategy:'episode',validationRatio:total?validation.length/total:0,requestedValidationRatio:ratio,seed:Number(seed)||42,episodes:source.length,trainEpisodes:trainEpisodes.length,validationEpisodes:validationEpisodes.length}};
}
