# Skill Evaluation

## Purpose
Task全体のBenchmarkとは別に、各Skillを独立した初期条件から複数回実行して弱点を切り分ける。

## Evaluation flow

```text
Task
  ↓
Skillを1つ選ぶ
  ↓
Seed付きで開始条件を生成
  ↓
SkillだけをN回実行
  ↓
成功率 / 衝突率 / 制御Step / 誤差を集計
  ↓
localStorageへ保存
  ↓
Task Pipelineに最新評価を表示
```

## Current metrics
- successRate
- collisionRate
- avgControlTicks
- avgSimTimeSec
- avgPathLength
- avgFinalError（該当Skillのみ）
- avgYawError（AlignToPallet）
- failure reasons

## Skill-specific interpretation

| Skill | 主な評価内容 |
|---|---|
| NavigateToPallet | 接近成功率、最終位置誤差、制御量 |
| DetectPallet | 検出成功率 |
| AlignToPallet | 位置合わせ成功率、位置誤差、Yaw誤差 |
| InsertForks | Preconditionsを満たした状態での差込み成功 |
| Lift | 荷を保持した状態でのLift成功 |
| Transport | 搬送成功率、目的地への最終位置誤差 |
| Place | 設置成功率、設置位置誤差 |
| Retreat | 退避成功率、退避目標への誤差 |

## Runtime policy rule
評価は原則として現在Task実行に接続されているRuntime Policyを測る。

- AlignToPallet: Classic / Learnedの選択を実評価に反映する。
- NavigateToPallet / Transport / Retreat: 学習モデル保存は可能だが、現時点ではRuntimeへのLearned Policy接続前なのでClassic Runtimeを評価する。
- Detect / Insert / Lift / Place: 現在のRule/固定Skillを評価する。

学習モデルそのもののoffline validationと、Runtime Skill evaluationは別指標として扱う。
