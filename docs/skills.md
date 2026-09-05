# Skill Catalog

## v0 skills

| Skill | Purpose | v0 implementation | Future implementation |
|---|---|---|---|
| navigate_to_pallet | Approach a pallet | teleport-like rule | navigation planner / learned policy |
| detect_pallet | Confirm target pallet | distance threshold | detector / segmentation / pose estimation |
| align_to_pallet | Align vehicle and pallet | direct alignment | visual servo / MPC / imitation |
| insert_forks | Insert forks | state transition | perception + precise control |
| lift | Lift pallet | binary state | hardware / ROS2 action |
| navigate_to | Move to destination | teleport-like rule | navigation stack / RL |
| place | Place pallet | state transition | precise placement skill |
| retreat | Leave pallet | simple movement | controller / learned skill |

## Design rule

A Task must not be implemented as one giant procedure. Tasks are compositions of reusable Skills.
