# v2.0 Skill Learning / Evaluation Status

## 現在できること

Task Pipeline の各 Skill は個別に `Policy / Dataset / Model / Training / Evaluation` を管理する。

### 実行時に Classic / Learned を切替可能

| Skill | Classic | Learned | 単体評価 | Classic vs Learned比較 |
|---|---|---|---|---|
| NavigateToPallet | Pure Pursuit / PID / Rule | Behavior Cloning | Yes | Yes |
| DetectPallet | Rule perception | - | Yes | No |
| AlignToPallet | staged docking | Behavior Cloning | Yes | Yes |
| InsertForks | Rule | - | Yes | No |
| Lift | Rule | - | Yes | No |
| Transport | Pure Pursuit / PID / Rule | Behavior Cloning | Yes | Yes |
| Place | Rule | - | Yes | No |
| Retreat | Rule reverse | Behavior Cloning | Yes | Yes |

Learned Policyでも `SimRobot` の速度上限、操舵上限、加速度制限、steering-rate制限、衝突判定は維持する。

## Skill Evaluation

各 Skill を Task 全体から切り離し、独立した初期条件をSeed付きで生成して複数回評価する。

保存指標:
- success rate
- collision rate
- average control ticks
- average simulated time
- average path length
- final position error where applicable
- yaw error where applicable
- failure reason counts

評価履歴はPolicy別にブラウザ `localStorage` へ保存する。最新1件だけでなく最大100件を保持する。

`evaluate.html` の `Classic vs Learned` は同一 Trials / Seed / Controller でClassicとLearnedを連続評価し、成功率差を表示する。

## 現在の学習データの限界

現在の Behavior Cloning は Synthetic Expert Demonstration を教師データとしている。したがって、現段階では「Expert Ruleの模倣」が中心であり、人間の操作や実機データを超えることは保証しない。

次の重要な改善は以下。

1. 手動操作ログからSkill別Datasetを収集
2. Train / Validation / Test を分離
3. Easy / Medium / Hard のSkill評価条件を固定
4. 評価履歴グラフとモデルバージョン比較
5. SACなどRL Policyとの比較
6. DetectPalletへcamera observationを追加
7. InsertFork / Lift / Placeを連続物理動作に変更
8. Skill timeout / cancel
9. Cloudflare + OpenAI Planner移行

## 研究上の基本フロー

```text
Task failure
  ↓
failed Skill identification
  ↓
Skill standalone evaluation
  ↓
Classic vs Learned comparison
  ↓
Dataset / Policy improvement
  ↓
Skill re-evaluation
  ↓
Task benchmark
```

Task成功率だけを見るのではなく、Skill単位の性能を先に測り、ボトルネックを特定して改善する。
