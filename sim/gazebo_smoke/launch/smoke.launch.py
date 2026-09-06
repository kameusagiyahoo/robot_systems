from launch import LaunchDescription
from launch.actions import ExecuteProcess
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
from pathlib import Path


def generate_launch_description():
    share = Path(get_package_share_directory('robot_systems_gazebo_smoke'))
    world = share / 'worlds' / 'forklift_smoke.sdf'
    bridge = share / 'config' / 'bridge.yaml'

    gazebo = ExecuteProcess(
        cmd=['gz', 'sim', '-r', str(world)],
        output='screen',
    )

    topic_bridge = Node(
        package='ros_gz_bridge',
        executable='parameter_bridge',
        name='robot_systems_gz_bridge',
        output='screen',
        parameters=[{'config_file': str(bridge)}],
    )

    return LaunchDescription([gazebo, topic_bridge])
