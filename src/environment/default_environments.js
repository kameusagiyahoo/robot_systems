import {registerEnvironmentAdapter} from './environment_registry.js';
import {Browser2DEnvironmentAdapter} from './browser2d_environment.js';

registerEnvironmentAdapter({
  id:'browser_2d',label:'Browser 2D Smoke Test',version:1,kind:'simulation',fidelity:'smoke_test',tags:['default','browser'],
  factory:options=>new Browser2DEnvironmentAdapter(options)
});

registerEnvironmentAdapter({id:'gazebo',label:'Gazebo / ROS 2',version:1,kind:'simulation',fidelity:'physics',available:false,reason:'adapter_not_implemented',tags:['ros2','3d','planned']});
registerEnvironmentAdapter({id:'mujoco',label:'MuJoCo',version:1,kind:'simulation',fidelity:'physics',available:false,reason:'adapter_not_implemented',tags:['3d','planned']});
registerEnvironmentAdapter({id:'isaac_sim',label:'NVIDIA Isaac Sim',version:1,kind:'simulation',fidelity:'physics_sensor',available:false,reason:'adapter_not_implemented',tags:['3d','gpu','planned']});
registerEnvironmentAdapter({id:'ros2_real',label:'ROS 2 / Real Robot',version:1,kind:'hardware',fidelity:'real',available:false,reason:'hardware_adapter_not_implemented',tags:['ros2','hardware','planned']});
