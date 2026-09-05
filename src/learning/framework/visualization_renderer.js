const renderers=new Map();

export function registerLearningVisualizationRenderer(type,renderer){if(!type||typeof renderer!=='function')throw new Error('invalid_visualization_renderer');renderers.set(type,renderer)}
export function listLearningVisualizationRenderers(){return[...renderers.keys()]}

function card(title){const el=document.createElement('section');el.className='plugin-viz-card';const h=document.createElement('div');h.className='plugin-viz-title';h.textContent=title;el.appendChild(h);return el}
function canvas2d(parent,width=320,height=120){const c=document.createElement('canvas');c.width=width;c.height=height;c.className='plugin-viz-canvas';parent.appendChild(c);return[c,c.getContext('2d')]}
function clear(ctx,w,h){ctx.clearRect(0,0,w,h);ctx.strokeStyle='#dce4e9';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1)}
function num(v,d=3){return Number.isFinite(Number(v))?Number(v).toFixed(d):'-'}
function metricText(value,format='number'){if(!Number.isFinite(Number(value)))return'-';if(format==='percent')return`${(Number(value)*100).toFixed(0)}%`;return num(value,2)}

registerLearningVisualizationRenderer('capability_note',(spec)=>{const el=card(spec.title),p=document.createElement('p');p.className='plugin-viz-note';p.textContent=spec.text||'このPluginが可視化内容を定義します。';el.appendChild(p);return el});

registerLearningVisualizationRenderer('loss_curve',(spec,context)=>{
  const el=card(spec.title),history=context.model?.lossHistory||[];if(history.length<2){const p=document.createElement('p');p.className='plugin-viz-note';p.textContent='再学習するとEpochごとのLoss曲線を表示します。';el.appendChild(p);return el}
  const [c,ctx]=canvas2d(el),w=c.width,h=c.height,pad=18,train=history.map(x=>Number(x.loss)).filter(Number.isFinite),validation=history.map(x=>Number(x.validationLoss)).filter(Number.isFinite),all=[...train,...validation],max=Math.max(...all),min=Math.min(...all),span=Math.max(1e-9,max-min);clear(ctx,w,h);
  const draw=(key,stroke,dashed=false)=>{ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.setLineDash(dashed?[5,4]:[]);ctx.beginPath();let started=false;history.forEach((p,i)=>{const v=Number(p[key]);if(!Number.isFinite(v))return;const x=pad+(w-pad*2)*(i/Math.max(1,history.length-1)),y=h-pad-(h-pad*2)*((v-min)/span);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)});if(started)ctx.stroke();ctx.setLineDash([])};
  draw('loss','#17202a',false);if(validation.length)draw('validationLoss','#65737c',true);
  const meta=document.createElement('div');meta.className='plugin-viz-meta';const last=history.at(-1);meta.textContent=`epoch ${last?.epoch||'-'} / train ${num(last?.loss,4)}${Number.isFinite(Number(last?.validationLoss))?` / validation ${num(last.validationLoss,4)}`:''}`;el.appendChild(meta);
  if(validation.length){const legend=document.createElement('div');legend.className='plugin-viz-meta';legend.textContent='実線: Train / 破線: Validation';el.appendChild(legend)}return el;
});

registerLearningVisualizationRenderer('dataset_distribution',(spec,context)=>{
  const el=card(spec.title),summary=context.dataset?.featureSummary||{},preview=context.dataset?.preview||[];if(!Object.keys(summary).length){const p=document.createElement('p');p.className='plugin-viz-note';p.textContent='Datasetを作成または再学習すると分布を表示します。';el.appendChild(p);return el}
  const rows=document.createElement('div');rows.className='plugin-feature-rows';for(const key of ['dx','dy','yawError','speed']){const s=summary[key];if(!s)continue;const r=document.createElement('div');r.innerHTML=`<span>${key}</span><strong>${num(s.min,1)} ～ ${num(s.max,1)}</strong><small>mean ${num(s.mean,1)}</small>`;rows.appendChild(r)}el.appendChild(rows);
  if(preview.length){const [c,ctx]=canvas2d(el,320,105),w=c.width,h=c.height,pad=14,xs=preview.map(p=>Number(p.dx)).filter(Number.isFinite),ys=preview.map(p=>Number(p.dy)).filter(Number.isFinite),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),xspan=Math.max(1e-9,xmax-xmin),yspan=Math.max(1e-9,ymax-ymin);clear(ctx,w,h);ctx.fillStyle='#35556d';for(const p of preview){if(!Number.isFinite(Number(p.dx))||!Number.isFinite(Number(p.dy)))continue;const x=pad+(w-pad*2)*(p.dx-xmin)/xspan,y=h-pad-(h-pad*2)*(p.dy-ymin)/yspan;ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill()}}
  const split=context.dataset?.split;if(split){const m=document.createElement('div');m.className='plugin-viz-meta';m.textContent=`split: ${split.strategy||'-'} / validation ${Number.isFinite(Number(split.validationRatio))?(Number(split.validationRatio)*100).toFixed(0)+'%':'-'}`;el.appendChild(m)}return el;
});

registerLearningVisualizationRenderer('policy_comparison',(spec,context)=>{
  const el=card(spec.title),classic=context.classicEvaluation,learned=context.learnedEvaluation,metric=spec.metric||'successRate',format=spec.format||'number',wrap=document.createElement('div');wrap.className='plugin-compare-bars',raw=[classic?.[metric],learned?.[metric]].filter(v=>Number.isFinite(Number(v))).map(Number),max=Math.max(1e-9,...raw.map(v=>Math.abs(v)));
  const make=(label,e)=>{const row=document.createElement('div'),value=e?.[metric],ratio=Number.isFinite(Number(value))?Math.min(100,Math.abs(Number(value))/max*100):0;row.innerHTML=`<span>${label}</span><div><i style="width:${ratio}%"></i></div><strong>${metricText(value,format)}</strong>`;return row};wrap.appendChild(make('Classic',classic));wrap.appendChild(make('Learned',learned));el.appendChild(wrap);
  const note=document.createElement('div');note.className='plugin-viz-meta';if(classic&&learned&&Number.isFinite(Number(classic[metric]))&&Number.isFinite(Number(learned[metric]))){const d=Number(learned[metric])-Number(classic[metric]),direction=spec.better==='lower'?-d:d,suffix=format==='percent'?' pt':'';note.textContent=`Learned ${direction>=0?'+':''}${format==='percent'?(direction*100).toFixed(0):direction.toFixed(2)}${suffix} (${spec.better==='lower'?'低いほど良い':'高いほど良い'})`}else note.textContent='両Policyを評価すると比較できます。';el.appendChild(note);return el;
});

export function renderLearningVisualizations(host,specs=[],context={}){if(!host)return;host.innerHTML='';for(const spec of specs){const renderer=renderers.get(spec.type);if(!renderer)continue;host.appendChild(renderer(spec,context))}if(!host.children.length){const p=document.createElement('p');p.className='plugin-viz-note';p.textContent='このSkill Pluginには現在可視化が定義されていません。';host.appendChild(p)}}
