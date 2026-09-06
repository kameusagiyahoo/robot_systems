import {registerEnvironmentAdapter} from './environment_registry.js';
import {Browser2DEnvironmentAdapter} from './browser2d_environment.js';
import {RemoteEnvironmentAdapter} from './remote_environment_adapter.js';
import {loadRemoteEnvironmentConfig,remoteEnvironmentConfigured} from './remote_environment_config.js';

registerEnvironmentAdapter({
  id:'browser_2d',label:'Browser 2D Smoke Test',version:5,kind:'simulation',fidelity:'smoke_test',tags:['default','browser'],
  factory:options=>new Browser2DEnvironmentAdapter(options)
});

registerEnvironmentAdapter({
  id:'remote_bridge',label:'Remote Environment Bridge',version:1,kind:'external',fidelity:'remote',tags:['bridge','external'],reason:'bridge_url_not_configured',
  isAvailable:()=>remoteEnvironmentConfigured(),
  factory:options=>new RemoteEnvironmentAdapter({...loadRemoteEnvironmentConfig(),...options,id:'remote_bridge',label:'Remote Environment Bridge'})
});

registerEnvironmentAdapter({id:'gazebo',label:'Gazebo / ROS 2',version:1,kind:'simulation',fidelity:'physics',available:false,reason:'use_remote_bridge_with_gazebo_backend',tags:['ros2','3d','planned']});
registerEnvironmentAdapter({id:'mujoco',label:'MuJoCo',version:1,kind:'simulation',fidelity:'physics',available:false,reason:'use_remote_bridge_with_mujoco_backend',tags:['3d','planned']});
registerEnvironmentAdapter({id:'isaac_sim',label:'NVIDIA Isaac Sim',version:1,kind:'simulation',fidelity:'physics_sensor',available:false,reason:'use_remote_bridge_with_isaac_backend',tags:['3d','gpu','planned']});
registerEnvironmentAdapter({id:'ros2_real',label:'ROS 2 / Real Robot',version:1,kind:'hardware',fidelity:'real',available:false,reason:'use_remote_bridge_with_ros2_backend',tags:['ros2','hardware','planned']});
