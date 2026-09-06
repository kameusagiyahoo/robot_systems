import {loadRemoteEnvironmentConfig,loadRemoteEnvironmentDescriptor,saveRemoteEnvironmentConfig,saveRemoteEnvironmentDescriptor,clearRemoteEnvironmentConfig,remoteEnvironmentSecurityHint} from './remote_environment_config.js';
import {RemoteEnvironmentAdapter} from './remote_environment_adapter.js';
import {setSelectedEnvironmentId,selectedEnvironmentId} from './environment_selection.js';

const el=(tag,className=null)=>{const node=document.createElement(tag);if(className)node.className=className;return node};
const flag=(v)=>v===true?'✓':v===false?'×':'-';

function summarizeDescriptor(descriptor={}){
  const caps=descriptor.capabilities||{},sensors=Array.isArray(descriptor.sensorManifest)?descriptor.sensorManifest:[],drive=descriptor.driveAdapter;
  const lines=[
    `Environment: ${descriptor.id||'-'} / fidelity=${descriptor.fidelity||'-'}`,
    `Pose: 2D ${flag(caps.pose2d)} · 3D ${flag(caps.pose3d)}`,
    `Sensors: RGB ${flag(caps.rgb)} · Depth ${flag(caps.depth)} · LiDAR ${flag(caps.lidar)} · Contact ${flag(caps.contact)} · Joint ${flag(caps.jointState)}`,
    `Control: step ${flag(caps.step)} · fork ${flag(caps.forkActuation)} · manipulation ${flag(caps.palletManipulation)}`,
    `Evaluation: reset ${flag(caps.reset)} · trial ${flag(caps.trialConfiguration)} · scenarios ${flag(caps.scenarios)} · batch ${flag(caps.batch)}`,
  ];
  if(drive)lines.push(`Drive Adapter: ${drive.id||drive.label||'-'}`);
  if(sensors.length)lines.push(`Sensor Manifest: ${sensors.map(s=>`${s.sensorId||s.type}:${s.available?'ready':'waiting'}`).join(' · ')}`);
  if(descriptor.limitations?.length)lines.push(`Limitations: ${descriptor.limitations.join(' / ')}`);
  return lines.join('\n');
}

function applyRemoteRuntimeGuards(){
  if(selectedEnvironmentId()!=='remote_bridge')return;
  const descriptor=loadRemoteEnvironmentDescriptor()||{},caps=descriptor.capabilities||{},batch=document.getElementById('batchBtn');
  const batchOk=caps.batch===true&&caps.scenarios===true&&caps.trialConfiguration===true&&caps.reset===true;
  if(batch){batch.disabled=!batchOk;batch.title=batchOk?'Remote backend advertises reset/scenario/batch support.':'Remote benchmark disabled: backend must advertise reset + scenarios + trialConfiguration + batch.'}
  const state=document.getElementById('batchState');if(state&&!batchOk&&(!state.textContent||state.textContent.trim()===''))state.textContent='Remote benchmark unavailable until the backend advertises reset / scenarios / trialConfiguration / batch capabilities.';
}

async function testConfig(config,status){
  status.textContent='接続テスト中...';let env;
  try{
    env=new RemoteEnvironmentAdapter(config);const result=await env.connect(),descriptor=env.describe(),validation=env.validateState();saveRemoteEnvironmentDescriptor(descriptor);
    const target=descriptor.remoteEnvironmentId||descriptor.id,statusText=`接続OK: ${descriptor.remoteEnvironmentLabel||descriptor.label||target} / id=${target||'-'} / fidelity=${descriptor.fidelity||'-'} / state=${validation.ok?'OK':validation.issues.join(', ')}`;status.textContent=statusText;window.dispatchEvent(new Event('storage'));applyRemoteRuntimeGuards();return{ok:true,descriptor,result};
  }catch(error){status.textContent=`接続失敗: ${error?.message||error}`;return{ok:false,error}}
  finally{try{await env?.disconnect?.()}catch{}}
}

export function installRemoteEnvironmentUi(){
  applyRemoteRuntimeGuards();
  const host=document.querySelector('#settingsSheet .settings-scroll');if(!host||document.getElementById('remoteEnvironmentConfig'))return;
  const details=el('details');details.id='remoteEnvironmentConfig';const summary=el('summary');summary.textContent='External Environment Bridge';details.appendChild(summary);
  const note=el('p','sheet-note');note.textContent='Gazebo / MuJoCo / Isaac Sim / ROS2実機はBridge URLを通して接続します。秘密鍵やAPIキーはここへ入力しません。';details.appendChild(note);
  const cfg=loadRemoteEnvironmentConfig()||{},grid=el('div','form-grid');
  const baseLabel=el('label');baseLabel.append('Bridge URL');const base=el('input');base.type='url';base.placeholder='https://bridge.example.com';base.value=cfg.baseUrl||'';baseLabel.appendChild(base);
  const endpointLabel=el('label');endpointLabel.append('Endpoint');const endpoint=el('input');endpoint.type='text';endpoint.value=cfg.endpoint||'/environment';endpointLabel.appendChild(endpoint);
  const timeoutLabel=el('label');timeoutLabel.append('Timeout ms');const timeout=el('input');timeout.type='number';timeout.min='1000';timeout.max='120000';timeout.step='1000';timeout.value=String(cfg.timeoutMs||15000);timeoutLabel.appendChild(timeout);grid.append(baseLabel,endpointLabel,timeoutLabel);details.appendChild(grid);
  const actions=el('div','sheet-actions'),testBtn=el('button'),saveBtn=el('button'),switchBtn=el('button'),browserBtn=el('button'),clearBtn=el('button');testBtn.textContent='接続テスト';saveBtn.textContent='設定保存';switchBtn.textContent='保存してRemoteへ切替';switchBtn.className='primary';browserBtn.textContent='Browser2Dへ戻す';clearBtn.textContent='設定削除';actions.append(testBtn,saveBtn,switchBtn,browserBtn,clearBtn);details.appendChild(actions);
  const status=el('p','sheet-note'),known=cfg.lastDescriptor;status.textContent=`現在: ${selectedEnvironmentId()}${known?.id?` · last remote=${known.id}`:''} · ${remoteEnvironmentSecurityHint()}`;details.appendChild(status);
  const capabilityState=el('pre','sheet-note');capabilityState.style.whiteSpace='pre-wrap';capabilityState.textContent=known?summarizeDescriptor(known):'Capabilities: 接続テスト後に取得';details.appendChild(capabilityState);
  const values=()=>({baseUrl:base.value,endpoint:endpoint.value,timeoutMs:Number(timeout.value)||15000});
  testBtn.onclick=async()=>{let config;try{config=saveRemoteEnvironmentConfig(values())}catch(error){status.textContent=error?.message||String(error);return}const checked=await testConfig(config,status);if(checked.ok)capabilityState.textContent=summarizeDescriptor(checked.descriptor)};
  saveBtn.onclick=()=>{try{saveRemoteEnvironmentConfig(values());status.textContent=`設定を保存しました。${remoteEnvironmentSecurityHint()}`}catch(error){status.textContent=error?.message||String(error)}};
  switchBtn.onclick=async()=>{let config;try{config=saveRemoteEnvironmentConfig(values())}catch(error){status.textContent=error?.message||String(error);return}const checked=await testConfig(config,status);if(!checked.ok)return;try{setSelectedEnvironmentId('remote_bridge');location.reload()}catch(error){status.textContent=error?.message||String(error)}};
  browserBtn.onclick=()=>{setSelectedEnvironmentId('browser_2d');location.reload()};
  clearBtn.onclick=()=>{clearRemoteEnvironmentConfig();base.value='';endpoint.value='/environment';timeout.value='15000';if(selectedEnvironmentId()==='remote_bridge')setSelectedEnvironmentId('browser_2d');status.textContent='Remote設定を削除しました。';capabilityState.textContent='Capabilities: 接続テスト後に取得';};
  host.prepend(details);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRemoteEnvironmentUi,{once:true});else installRemoteEnvironmentUi();
