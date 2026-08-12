# MindNest ソフトウェア仕様書 v2.0 案

Version 2.0 仕様案：MindMapモード / Ganttチャートモード、WBS設計、スケジュール管理、担当者、進捗、タスク依存関係

---

## 1. Version 2.0 の目的

Version 2.0では、既存のMindMapをWBS（Work Breakdown Structure）作成に利用し、その構造をGanttチャートとして編集・閲覧できるようにする。

```text
MindMapモード
  アイデア整理
  WBS分解
  タスク階層の作成

Ganttチャートモード
  開始日
  納期
  担当者
  進捗
  タスク間依存
  スケジュール閲覧・編集
```

MindMapとGanttチャートは同一Nodeデータを共有する。MindMapで作成したNodeは、GanttチャートではTaskとして扱う。

---

## 2. モード構成

Version 2.0では、1つのMindMap Documentに対して以下の表示モードを持つ。

```text
MindMap Mode
Gantt Mode
```

画面上部またはMindMapパネル上部にモード切り替えUIを配置する。

例：

```text
[ MindMap ] [ Gantt ]
```

### MindMap Mode

既存のMindMap編集モード。

主な用途：

```text
・WBSの構造を考える
・タスクを階層化する
・メモを書く
・Child MindMapへ分解する
・ノード色を設定する
```

### Gantt Mode

MindMapのNode構造をタスク一覧とタイムラインとして表示する。

主な用途：

```text
・タスクの開始日を編集する
・タスクの納期を編集する
・担当者を設定する
・進捗率を設定する
・タスク間依存を設定する
・スケジュール全体を閲覧する
```

---

## 3. Node / Task データモデル拡張

既存の `MindMapNodeData` にGantt用フィールドを追加する。

```typescript
interface MindMapNodeData {
  id: string;
  topic: string;

  memo?: string;
  childMindMapId?: string;

  'background-color'?: string;
  'foreground-color'?: string;

  /** Gantt用フィールド */
  startDate?: string;
  dueDate?: string;
  assignee?: string;
  progress?: number;
  dependsOn?: string[];

  children?: MindMapNodeData[];
}
```

各フィールドの意味：

```text
startDate
  タスク開始日。ISO日付文字列 YYYY-MM-DD とする。

dueDate
  タスク納期または終了日。ISO日付文字列 YYYY-MM-DD とする。

assignee
  担当者名。自由入力文字列とする。

progress
  進捗率。0〜100 の数値とする。

dependsOn
  このタスクが依存する先行タスクNode IDの配列。
```

### 初期値

Gantt用フィールドが未設定の場合、Gantt Modeでは空欄として表示する。

```text
startDate: 未設定
dueDate: 未設定
assignee: 未設定
progress: 0
依存関係: なし
```

---

## 4. Gantt Mode の画面構成

Gantt Modeは以下の2領域で構成する。

```text
┌──────────────────────────────────────────────────────────────┐
│ MindNest / Work                                  [MindMap][Gantt] │
├──────────────────────────────┬───────────────────────────────┤
│ Task Table                   │ Timeline                      │
│                              │                               │
│ Task       Start  Due  ...   │ Jan  Feb  Mar  Apr            │
│ ├ Work     ...    ...        │ █████████                     │
│ │ ├ Design ...    ...        │   ███                         │
│ │ └ Dev    ...    ...        │      ██████                   │
│ └ Release  ...    ...        │             ██                │
└──────────────────────────────┴───────────────────────────────┘
```

### Task Table

左側にタスク一覧を表示する。

表示項目：

```text
Task名
開始日
納期
担当者
進捗
依存タスク
```

MindMapの階層構造はインデントで表現する。

```text
Work
  Design
  Development
    Frontend
    Backend
  Release
```

### Timeline

右側に日付軸とタスクバーを表示する。

```text
・startDate と dueDate が両方あるタスクはバーを表示する
・progress に応じてバー内部に進捗表示を行う
・dependsOn がある場合は依存線または依存アイコンを表示する
・日付未設定タスクはTimelineにはバーを表示せず、Task Table側で未設定として表示する
```

---

## 5. Gantt Mode の編集機能

### 5.1 Task名

Task名はMindMap Nodeの `topic` と同一とする。

Gantt ModeでTask名を変更した場合、MindMap ModeのNode名も更新する。

### 5.2 開始日 / 納期

Task Table上で日付入力できる。

```text
Start Date: date input
Due Date: date input
```

制約：

```text
・dueDate は startDate 以降であることが望ましい
・dueDate < startDate の場合は警告表示する
・警告状態でも保存は可能とするか、保存不可とするかは実装時に決定する
```

初期仕様では、警告表示のみとし保存は可能とする。

### 5.3 担当者

担当者は自由入力とする。

```text
assignee: string
```

Version 2.0では担当者マスタは持たない。

将来的には担当者一覧、フィルタ、色分けを検討する。

### 5.4 進捗

進捗は0〜100%で入力する。

```text
progress: number
```

UI例：

```text
[  50%  ]
または
[ slider 0 - 100 ]
```

Timeline上では進捗分だけバー内部を塗り分ける。

### 5.5 タスク間依存

Taskは他Taskに依存できる。

```text
dependsOn: string[]
```

依存関係の意味：

```text
このTaskは、dependsOnに含まれるTaskが完了または終了した後に開始する想定である。
```

Version 2.0では、依存関係による日付の自動調整は必須としない。

最低限以下を行う。

```text
・依存先Taskを選択できる
・依存関係を保存できる
・Timeline上で依存関係を視覚的に確認できる
・循環依存は作成できないようにする
```

循環依存例：

```text
A depends on B
B depends on C
C depends on A
```

このような依存は保存不可とする。

---

## 6. MindMap Mode と Gantt Mode の同期

MindMap ModeとGantt Modeは同じNodeデータを参照する。

```text
MindMapでNodeを追加
  ↓
GanttにTaskとして表示

GanttでTask名を変更
  ↓
MindMap Node名も変更

Ganttで開始日・納期・担当者・進捗・依存を編集
  ↓
MindMap Nodeデータへ保存
```

### Node削除時

MindMap ModeでNodeを削除した場合、対応するGantt Taskも削除される。

削除対象Nodeに依存している他Taskがある場合、以下のいずれかとする。

Version 2.0初期仕様：

```text
・削除されたNode IDを他TaskのdependsOnから自動削除する
・必要に応じて通知を表示する
```

### Node移動時

MindMap ModeでNode階層を変更した場合、Gantt ModeのTask階層も同じ構造に更新する。

---

## 7. Child MindMap と Gantt

Child MindMapは独立したMindMap Documentとして扱う。

Gantt Modeも現在開いているMindMap Document単位で表示する。

```text
Root MindMapのGantt
  Root MindMap内のNodeだけを表示

Work Child MindMapのGantt
  Work MindMap内のNodeだけを表示
```

Version 2.0では、複数階層のChild MindMapを横断した統合Ganttは必須としない。

将来的な拡張として、Rootから全Child MindMapを集約したPortfolio Ganttを検討する。

---

## 8. 保存仕様

Gantt用フィールドはMindMap Nodeデータ内に保存する。

```json
{
  "id": "node-design",
  "topic": "Design",
  "memo": "## Design notes",
  "startDate": "2026-01-10",
  "dueDate": "2026-01-20",
  "assignee": "Inamoto",
  "progress": 40,
  "dependsOn": ["node-research"]
}
```

保存先は既存と同じIndexedDBの `mindMaps` テーブルとする。

自動保存は既存仕様と同様、編集後にdebounceして行う。

---

## 9. JSON Export / Import

JSON ExportにはGantt用フィールドも含める。

対象：

```text
startDate
dueDate
assignee
progress
dependsOn
```

Export bundleに含まれるNodeデータをそのまま復元できること。

Import時に依存先Node IDが存在しない場合は、その依存関係を破棄するか警告する。

Version 2.0初期仕様では以下とする。

```text
・Import後に存在しないdependsOn IDは削除する
・削除した依存がある場合は通知する
```

---

## 10. UI操作案

### モード切り替え

```text
Ctrl + G
  Gantt Modeへ切り替え

Ctrl + Shift + G
  MindMap Modeへ戻る
```

※ ショートカットは案であり、既存ショートカットとの競合を確認して決定する。

### Gantt Mode内操作

```text
クリック
  Taskを選択

ダブルクリック
  Task名を編集

日付セルクリック
  date inputで編集

進捗セルクリック
  number inputまたはsliderで編集

依存セルクリック
  依存先Task選択UIを開く
```

---

## 11. Version 2.0 必須機能案

Version 2.0で最低限実装する機能：

```text
・MindMap Mode / Gantt Modeを切り替えられる
・MindMap NodeをGantt Taskとして一覧表示できる
・MindMap階層をGantt Task Tableでインデント表示できる
・Taskの開始日を編集・保存できる
・Taskの納期を編集・保存できる
・Taskの担当者を編集・保存できる
・Taskの進捗率を編集・保存できる
・Taskの依存関係を編集・保存できる
・循環依存を防止できる
・startDate / dueDateがあるTaskをTimelineにバー表示できる
・progressをTimeline上に視覚表示できる
・JSON Export / ImportにGantt用フィールドを含める
```

---

## 12. Version 2.0 では必須にしない機能

初期Version 2.0では、以下は必須にしない。

```text
・依存関係に基づく日付の自動再計算
・クリティカルパス表示
・担当者マスタ管理
・担当者別カレンダー
・休日・祝日カレンダー
・稼働日計算
・リソース負荷管理
・複数Child MindMapを横断した統合Gantt
・PDF Export
・画像Export
・クラウド共有
```

---

## 13. MVP受入シナリオ案

```text
1. MindMap Modeで「Project」Nodeを作成する

2. Project配下に以下のNodeを作成する
   - Research
   - Design
   - Development
   - Release

3. Gantt Modeへ切り替える

4. Research / Design / Development / Release がTaskとして表示される

5. 各Taskに開始日・納期・担当者・進捗を入力する

6. Design depends on Research を設定する

7. Development depends on Design を設定する

8. Timeline上にTaskバーと依存関係が表示される

9. ブラウザをリロードする

10. Gantt情報が保持されている

11. MindMap Modeへ戻る

12. Task名・Node構造がMindMap側にも反映されている

13. JSON ExportするとGantt用フィールドも含まれる
```

---

## 14. 検討事項

実装前に決めるべき事項：

```text
・Ganttライブラリを利用するか、自前実装するか
・Timelineの表示単位（日 / 週 / 月）
・依存線を初期Versionでどこまで描画するか
・Task TableとTimelineの横スクロール同期方式
・日付未設定Taskの表示位置
・親Taskの日付を子Taskから自動集計するか
・親Taskの進捗を子Taskから自動集計するか
・Gantt ModeでもMemoを表示するか
```

---

## 15. 推奨実装方針案

初期実装は以下の順序を推奨する。

```text
Phase 1
  NodeデータモデルにGantt用フィールドを追加
  Gantt Mode切り替えUIを追加
  Task Tableを表示
  開始日・納期・担当者・進捗を編集可能にする

Phase 2
  Timelineバーを表示
  日 / 週 / 月の表示単位を切り替え可能にする

Phase 3
  dependsOn編集UIを追加
  循環依存チェックを追加
  依存線または依存アイコンを表示

Phase 4
  JSON Export / Import対応
  Playwright回帰テスト追加
```
