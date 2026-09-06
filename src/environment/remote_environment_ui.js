import {loadRemoteEnvironmentConfig,saveRemoteEnvironmentConfig,clearRemoteEnvironmentConfig,remoteEnvironmentSecurityHint} from './remote_environment_config.js';
import {RemoteEnvironmentAdapter} from './remote_environment_adapter.js';
import {setSelectedEnvironmentId,selectedEnvironmentId} from './environment_selection.js';

const el=(tag,className=null)=>{const node=document.createElement(tag);if(className)node.className=className;return node};

async function testConfig(config,status){
  status.textContent='接続テスト中...';let env;
  try{env=new RemoteEnvironmentAdapter(config);const result=await env.connect(),descriptor=env.describe(),validation=env.validateState();status.textContent=`接続OK: ${descriptor.label||descriptor.id} / fidelity=${descriptor.fidelity||'-'} / state=${validation.ok?'OK':validation.issues.join(', ')}`;return{ok:true,descriptor,result}}
  catch(error){status.textContent=`接続失敗: ${error?.message||error}`;return{ok:false,error}}
  finally{try{await env?.disconnect?.()}catch{}}
}

export function installRemoteEnvironmentUi(){
  const host=document.querySelector('#settingsSheet .settings-scroll');if(!host||document.getElementById('remoteEnvironmentConfig'))return;
  const details=el('details');details.id='remoteEnvironmentConfig';
  const summary=el('summary');summary.textContent='External Environment Bridge';details.appendChild(summary);
  const note=el('p','sheet-note');note.textContent='Gazebo / MuJoCo / Isaac Sim / ROS2実機はBridge URLを通して接続します。秘密鍵やAPIキーはここへ入力しません。';details.appendChild(note);
  const cfg=loadRemoteEnvironmentConfig()||{};
  const grid=el('div','form-grid');
  const baseLabel=el('label');baseLabel.append('Bridge URL');const base=el('input');base.type='url';base.placeholder='https://bridge.example.com';base.value=cfg.baseUrl||'';baseLabel.appendChild(base);
  const endpointLabel=el('label');endpointLabel.append('Endpoint');const endpoint=el('input');endpoint.type='text';endpoint.value=cfg.endpoint||'/environment';endpointLabel.appendChild(endpoint);
  const timeoutLabel=el('label');timeoutLabel.append('Timeout ms');const timeout=el('input');timeout.type='number';timeout.min='1000';timeout.max='120000';timeout.step='1000';timeout.value=String(cfg.timeoutMs||15000);timeoutLabel.appendChild(timeout);
  grid.append(baseLabel,endpointLabel,timeoutLabel);details.appendChild(grid);
  const actions=el('div','sheet-actions'),testBtn=el('button'),saveBtn=el('button'),switchBtn=el('button'),browserBtn=el('button'),clearBtn=el('button');
  testBtn.textContent='接続テスト';saveBtn.textContent='設定保存';switchBtn.textContent='保存してRemoteへ切替';switchBtn.className='primary';browserBtn.textContent='Browser2Dへ戻す';clearBtn.textContent='設定削除';actions.append(testBtn,saveBtn,switchBtn,browserBtn,clearBtn);details.appendChild(actions);
  const status=el('p','sheet-note');status.textContent=`現在: ${selectedEnvironmentId()} · ${remoteEnvironmentSecurityHint()}`;details.appendChild(status);
  const values=()=>({baseUrl:base.value,endpoint:endpoint.value,timeoutMs:Number(timeout.value)||15000});
  testBtn.onclick=async()=>{let config;try{config=values();saveRemoteEnvironmentConfig(config)}catch(error){status.textContent=error?.message||String(error);return}await testConfig(config,status)};
  saveBtn.onclick=()=>{try{saveRemoteEnvironmentConfig(values());status.textContent=`設定を保存しました。${remoteEnvironmentSecurityHint()}`}catch(error){status.textContent=error?.message||String(error)}};
  switchBtn.onclick=async()=>{let config;try{config=saveRemoteEnvironmentConfig(values())}catch(error){status.textContent=error?.message||String(error);return}const checked=await testConfig(config,status);if(!checked.ok)return;try{setSelectedEnvironmentId('remote_bridge');location.reload()}catch(error){status.textContent=error?.message||String(error)}};
  browserBtn.onclick=()=>{setSelectedEnvironmentId('browser_2d');location.reload()};
  clearBtn.onclick=()=>{clearRemoteEnvironmentConfig();base.value='';endpoint.value='/environment';timeout.value='15000';if(selectedEnvironmentId()==='remote_bridge')setSelectedEnvironmentId('browser_2d');status.textContent='Remote設定を削除しました。';};
  host.prepend(details);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRemoteEnvironmentUi,{once:true});else installRemoteEnvironmentUi();
