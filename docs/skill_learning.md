# Skill Learning Architecture

Taskは複数のSkillへ分解し、学習状態はTask全体ではなくSkill単位で管理する。

各Skillは次の情報を持つ。

- Policy: 現在実行に使う方式
- Dataset: 学習データの種類・件数
- Model: 学習済みモデル
- Training: 学習方式とloss
- Evaluation: Skill単位の成功率・誤差（今後Benchmarkへ接続）

## Current status

| # | Skill | 現在の実行方式 | 学習方式 | ブラウザ学習 | Learned runtime |
|---|---|---|---|---|---|
| 1 | NavigateToPallet | Pure Pursuit / PID | BC / SAC | Yes | Not connected yet |
| 2 | DetectPallet | Rule perception | Detector / VLM | No | No |
| 3 | AlignToPallet | Rule / BC | BC / SAC | Yes | Yes |
| 4 | InsertForks | Rule | BC / ACT | No | No |
| 5 | Lift | Rule | BC / ACT | No | No |
| 6 | Transport | Pure Pursuit / PID | BC / SAC | Yes | Not connected yet |
| 7 | Place | Rule | BC / ACT | No | No |
| 8 | Retreat | Rule reverse | BC / SAC | Yes | Not connected yet |

## Why some Skills are not trainable yet

DetectPalletには画像観測が必要だが、現在のSimulatorは画像Datasetを生成していない。

InsertForks / Lift / Placeは現在ほぼ瞬時の状態遷移で、学習対象となる連続動作自由度が存在しない。フォーク挿入量・フォーク高さ・荷重・接触などをSimulatorへ追加した後に学習対象化する。

## Storage

Skill model and metadata are stored independently in browser localStorage.

- `forklift_skill_model_v1:<skillId>`
- `forklift_skill_dataset_meta_v1:<skillId>`
- `forklift_skill_policy_v1:<skillId>`

Legacy Align model `forklift_bc_align_v1` is migrated into the common registry when found.

## Next

1. Skill EvaluationをBenchmarkへ接続
2. Navigate / Transport / RetreatのLearned runtimeを接続
3. Camera observation追加後にDetectPallet training
4. Fork physics追加後にInsert / Lift / Place training
5. BC → SAC / ACT / VLA comparison
