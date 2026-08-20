# MindNest ソフトウェア仕様書 v2.0 案

Version 2.0 仕様案：MindMapモード / Ganttモード、WBS設計、スケジュール管理、担当者、進捗、タスク依存関係

---

## 1. Version 2.0 の目的

Version 2.0では、既存のMindMapをWBS（Work Breakdown Structure）作成に利用し、その構造をGanttチャートとして編集・閲覧できるようにする。

```text
MindMapモード
  アイデア整理
  WBS分解
  タスク階層の作成
  メモ編集
  Child MindMap管理

Ganttモード
  開始日
  終了日
  担当者
  進捗
  タスク間依存
  スケジュール閲覧・編集
```

MindMapとGanttは同一Nodeデータを共有する。MindMapで作成したNodeは、GanttではTaskとして扱う。

---

## 2. モード構成

1つのMindMap Documentに対して以下の表示モードを持つ。

```text
MindMap Mode
Gantt Mode
```

画面上部のモード切り替えUIで切り替える。

```text
[ MindMap ] [ Gantt ]
```

### 2.1 MindMap Mode

既存のMindMap編集モード。

主な用途：

```text
・WBSの構造を考える
・タスクを階層化する
・ノード名を編集する
・メモを書く
・Child MindMapへ分解する
・ノード色を設定する
```

### 2.2 Gantt Mode

MindMapのNode構造をタスク一覧とタイムラインとして表示する。

主な用途：

```text
・タスクの開始日を編集する
・タスクの終了日を編集する
・担当者を設定する
・進捗率を設定する
・タスク間依存を設定する
・スケジュール全体を閲覧する
```

Ganttモードへ切り替えた場合、MindMapモードで表示されていたChild MindMap用の `Open MindMap` ポップアップおよび右クリックメニューは閉じる。

---

## 3. Node / Task データモデル

既存の `MindMapNodeData` にGantt用フィールドを追加する。

```typescript
interface MindMapNodeData {
  id: string;
  topic: string;

  memo?: string;
  childMindMapId?: string;

  'background-color'?: string;
  'foreground-color'?: string;

  startDate?: string;
  dueDate?: string;
  assignee?: string;
  progress?: number;
  dependsOn?: string[];

  /** MindMap上の開閉状態。falseの場合は子孫を折りたたむ。 */
  expanded?: boolean;

  children?: MindMapNodeData[];
}
```

各フィールドの意味：

```text
startDate
  タスク開始日。ISO日付文字列 YYYY-MM-DD とする。

dueDate
  タスク終了日。ISO日付文字列 YYYY-MM-DD とする。

assignee
  担当者名。自由入力文字列とする。

progress
  進捗率。0〜100 の数値とする。

dependsOn
  このタスクが依存する先行タスクNode IDの配列。

expanded
  MindMap ModeでのNode開閉状態。未設定またはtrueの場合は展開、falseの場合は折りたたみとして扱う。
  メモ編集などNode内容のみを更新する操作では、現在の開閉状態を維持する。
```

---

## 4. 日付・進捗・担当者の算出仕様

### 4.1 Leaf Task

子を持たない一番下のNodeをLeaf Taskと呼ぶ。

Leaf Taskでは以下を編集できる。

```text
Name
From
To
Assignee
%
Depends on
```

日付未設定時の表示補完：

```text
startDate が未設定の場合
  From = 今日

dueDate が未設定、かつ From が今日の場合
  To = 今日 + 7日

dueDate が未設定、かつ From が今日以外の場合
  To = From と同日
```

ただし、補完値は表示・Gantt計算用であり、ユーザー操作により保存されるまでは元データが必ずしも埋まっているとは限らない。

Leaf Taskで `From` に今日を設定し、かつ `dueDate` が未設定の場合、`To` は自動的に今日+7日に設定する。

### 4.2 Parent Task

子を持つNodeをParent Taskと呼ぶ。

Parent Taskでは以下の値を子Taskから自動計算する。

```text
From
  子Taskの最も早いFrom

To
  子Taskの最も遅いTo

Assignee
  子孫Leaf TaskのAssigneeを重複なしで列挙

%
  子Taskの進捗平均
```

Parent Taskの `From` / `To` / `Assignee` / `%` は編集不可とする。編集不可項目はdisabled inputではなく、通常テキストとして表示する。

### 4.3 進捗

進捗は0〜100%とする。

Ganttバー上でマウス操作により進捗を変更する場合、10%単位に丸める。

```text
0, 10, 20, ... 100
```

数値入力欄も `step=10` とし、直接入力された値も10%単位に正規化する。

---

## 5. Gantt Mode の画面構成

Gantt Modeは以下で構成する。

```text
┌──────────────────────────────────────────────────────────────┐
│ MindNest / Work                         [MindMap] [Gantt]    │  sticky
├───────────────────────────────────────────────┬──────────────┤
│ Gantt Area                                    │ Memo         │
│ [Day] [Week] [Month]                          │              │
│ ┌────────────────────┬──────────────────────┐ │ 選択Taskの   │
│ │ Task Table         │ Timeline             │ │ Memo         │
│ │ Name [Hide/Show]   │ 日/週/月ヘッダー     │ │              │
│ │ Task A             │ █████                │ │              │
│ │   Task A-1         │   ███                │ │              │
│ └────────────────────┴──────────────────────┘ │              │
└───────────────────────────────────────────────┴──────────────┘
```

### 5.1 Topbar

アプリ最上部の `MindNest` / Breadcrumb / モード切替ヘッダーはsticky表示とする。

### 5.2 Gantt Toolbar

Gantt内の表示単位切り替えボタンを表示する。

```text
[ Day ] [ Week ] [ Month ]
```

選択状態はGanttモードを離れても維持する。

保存先：

```text
localStorage: mindnest:gantt:view-mode
```

### 5.3 Task Table

左側にタスク一覧を表示する。

表示項目：

```text
Name
From
To
Assignee
%
Depends on
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

`From` / `To` / `Assignee` / `%` / `Depends on` の詳細フィールドは折りたたみ可能とする。

```text
展開時: Name | From | To | Assignee | % | Depends on
折畳時: Name のみ
```

折りたたみボタンはTask Tableヘッダーの `Name` 列右端に表示する。

```text
Name                                           [Hide]
Name                                           [Show]
```

折りたたみ状態はGanttモードを離れても維持する。

保存先：

```text
localStorage: mindnest:gantt:fields-collapsed
```

### 5.4 Timeline

右側にGanttチャートを表示する。

使用ライブラリ：

```text
gantt-task-react
```

Timeline上にはタスクバーと依存関係を表示する。左側Task TableにNameを表示するため、Timeline側のバー内外のタスク名ラベルは非表示とする。

### 5.5 Memo

GanttモードでもMemoは右側に表示する。

Ganttの行または行内入力欄をクリック・フォーカスした場合、その行のNodeを選択し、Memoも対応するNodeの内容に切り替える。

Memoは表示・非表示を切り替え可能とする。表示ボタンの位置はMindMapモードと同じ位置とする。

---

## 6. Gantt表示仕様

### 6.1 表示単位

以下の表示単位を持つ。

```text
Day
Week
Month
```

列幅は表示単位ごとに調整する。

```text
Day:   狭い日単位表示
Week:  狭めの週単位表示
Month: 狭めの月単位表示
```

現在の初期値：

```text
Day: 38px
Week: 120px
Month: 160px
```

### 6.2 Day表示

Day表示では日付ヘッダーから曜日表記を除去し、日付のみを表示する。

例：

```text
Sun, 12 -> 12
Mon, 13 -> 13
```

`gantt-task-react` には日付ヘッダーのフォーマットを変更する標準APIがないため、Day表示の日付加工と休日装飾は描画後のSVG後処理で行う。

描画直後に曜日が一瞬表示されることを抑えるため、Day表示では後処理完了まで日付ヘッダーを一時的に非表示にする。

### 6.3 Week表示

Week表示はライブラリ標準の週表示を尊重する。

`W33` のような週番号表示はライブラリ標準のまま表示する。週番号を隠したり、日付表示に置き換えるDOM後処理は行わない。

### 6.4 Month表示

Month表示はライブラリ標準の月表示を利用する。

### 6.5 休日表示

Day表示では土日を視覚的に区別する。

```text
Saturday: 青系
Sunday: 赤系
```

日付ラベルだけでなく、該当日の列全体にも淡い背景色を付ける。

祝日カレンダー・稼働日計算はVersion 2.0 MVPでは対象外とする。

### 6.6 Sticky表示

以下は縦スクロール時も表示されたままにする。

```text
・最上部のMindNestヘッダー
・Gantt Toolbar
・Task Tableヘッダー
```

---

## 7. Gantt Mode の編集機能

### 7.1 Name

Task名はMindMap Nodeの `topic` と同一とする。

Gantt ModeでNameを変更した場合、MindMap ModeのNode名も更新する。

### 7.2 From / To

Leaf Taskのみ日付入力できる。

```text
From: date input
To:   date input
```

Parent Taskは子Taskから自動計算し、テキスト表示のみとする。

### 7.3 Assignee

Leaf Taskのみ自由入力できる。

```text
assignee: string
```

Parent Taskでは子孫Leaf TaskのAssigneeを重複なしで列挙する。

Version 2.0 MVPでは担当者マスタは持たない。

### 7.4 Progress

Leaf Taskのみ数値入力またはGanttバー操作で編集できる。

```text
progress: number
0〜100
10%刻み
```

Parent Taskでは子Taskの平均値を表示する。

### 7.5 Depends on

Taskは他Taskに依存できる。

```text
dependsOn: string[]
```

Version 2.0 MVPでは、依存先選択UIは単一選択を基本とする。ただしデータ構造は配列として保持する。

循環依存は作成できない。

```text
A depends on B
B depends on C
C depends on A
```

上記のような依存は保存不可とする。

依存関係による日付の自動調整はVersion 2.0 MVPでは行わない。

---

## 8. MindMap Mode と Gantt Mode の同期

MindMap ModeとGantt Modeは同じNodeデータを参照する。

```text
MindMapでNodeを追加
  ↓
GanttにTaskとして表示

GanttでTask名を変更
  ↓
MindMap Node名も変更

Ganttで開始日・終了日・担当者・進捗・依存を編集
  ↓
MindMap Nodeデータへ保存
```

MindMap ModeでNodeを削除した場合、対応するGantt Taskも削除される。

MindMap ModeでNode階層を変更した場合、Gantt ModeのTask階層も同じ構造に更新する。

---

## 9. Child MindMap と Gantt

Child MindMapは独立したMindMap Documentとして扱う。

Gantt Modeも現在開いているMindMap Document単位で表示する。

```text
Root MindMapのGantt
  Root MindMap内のNodeだけを表示

Work Child MindMapのGantt
  Work MindMap内のNodeだけを表示
```

Version 2.0 MVPでは、複数階層のChild MindMapを横断した統合Ganttは必須としない。

将来的な拡張として、Rootから全Child MindMapを集約したPortfolio Ganttを検討する。

---

## 10. 保存仕様

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

Gantt表示状態はNodeデータではなく、クライアントの `localStorage` に保存する。

```text
mindnest:gantt:view-mode
mindnest:gantt:fields-collapsed
```

---

## 11. JSON Export / Import

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

Import時は選択中Nodeを置き換えるか確認する。

```text
Yes / OK
  選択中NodeをImportしたNodeで置き換える。

No / Cancel
  ImportしたNodeを選択中Nodeの子として追加する。
```

ImportしたNodeは新しいNode IDを採番して取り込む。

Import時に依存先Node IDが存在しない場合は、その依存関係を破棄するか警告する。

Version 2.0 MVPでは以下とする。

```text
・Import後に存在しないdependsOn IDは削除する
・削除した依存がある場合は通知する
```

---

## 12. MindMap Mode 関連の更新仕様

### 12.1 ノードのコピー / 切り取り / ペースト

MindMap ModeではNodeのコピー、切り取り、ペーストをサポートする。

```text
Ctrl / Cmd + C
  選択中Nodeとその子孫Nodeをコピーする。

Ctrl / Cmd + X
  選択中Nodeとその子孫Nodeを切り取る。
  Root Nodeは切り取り不可とする。

Ctrl / Cmd + V
  コピー中Nodeまたは切り取り中Nodeを選択中Nodeの子として貼り付ける。
```

右クリックメニューにも `Copy Node`、`Cut Node`、`Paste as Child` を表示する。

コピーしたNodeを貼り付ける場合、コピー元とIDが衝突しないよう、貼り付けるNodeおよび子孫NodeのIDを再採番する。

切り取り中Nodeを貼り付ける場合、元のNodeを削除して貼り付け先Nodeの子へ移動する。この場合は既存Nodeの移動であるためIDを維持する。

切り取り中Nodeを自分自身または自分の子孫Nodeへ貼り付ける操作は、循環構造になるため禁止する。

Child MindMap参照および依存関係はコピー先で共有・不整合が起きやすいため、コピー貼り付け時には引き継がない。

### 12.2 Child MindMapポップアップ

Child MindMapを持つNodeを選択した場合、`Open MindMap` ポップアップを表示する。

表示位置：

```text
Leaf Node
  ノード右側に表示

Parent Node
  ノード下側に表示
```

Gantt Modeへ切り替えた場合、このポップアップは閉じる。

### 12.3 ダブルクリック

Nodeのダブルクリックはリネームに割り当てる。

Child MindMapへ入る操作には使用しない。

### 12.4 Child MindMapショートカット

```text
Ctrl + Enter
  Child MindMapが存在する場合: 開く
  Child MindMapが存在しない場合: 作成して、そのまま入る

Ctrl + Delete
  Child MindMapを削除する
```

Ctrl+EnterでChild MindMapを作成した場合、親Nodeと作成されたMindMapの紐付けを保存してから遷移する。

### 12.5 ノード色

ノード色は右クリックメニューから設定できる。

背景色と文字色は別行で表示する。

色パレット：

```text
Blue
Green
Yellow
Red
Slate
White
Black
```

ショートカット：

```text
Ctrl + 0: Reset Color
Ctrl + 1: 背景を赤
Ctrl + 2: 背景を黄
Ctrl + 3: 背景を緑
```

`Ctrl+1〜3` は右クリックメニューには表示しない。

### 12.6 右クリックメニュー

右クリックメニューには主要操作のキーボードショートカットを右側に表示する。

メニューが画面外にはみ出さないよう、表示位置をビューポート内に補正する。

### 12.7 ドラッグ操作

MindMap ModeではNodeのドラッグ移動とキャンバスのパン操作をサポートする。

ドラッグ中にMindMap領域外へ出た場合、ドラッグ状態を解除する。

解除対象：

```text
・メモ領域などアプリ内のMindMap外領域へ移動した場合
・ブラウザウィンドウ外へ移動した場合
・ウィンドウのフォーカスが外れた場合
```

Nodeドラッグ中は、MindMap内部パネル、ブラウザウィンドウ、`documentElement`、`body` のスクロール位置を固定し、ドラッグ操作によって画面全体やMindMap表示位置がスクロールしないようにする。

NodeドラッグをMindMap領域外でキャンセルした場合、Node移動は確定せず、ドラッグ開始前の構造を維持する。

### 12.8 メモ編集中のMindMap状態維持

メモ編集によりNodeデータが更新されても、MindMapの表示位置およびNodeの開閉状態は維持する。

```text
・MindMapのスクロール位置を維持する
・Nodeのexpanded/collapsed状態を維持する
・メモ入力キーがMindMapのショートカットや表示移動を発生させない
```

メモ editor は、Nodeごとに直前のカーソル位置および選択範囲を保持する。

```text
Ctrl / Cmd + M
  Preview表示中: 選択NodeのMemoをedit modeで開く。
  Memo edit中: Preview表示へ戻る。
```

`Ctrl / Cmd + M` でPreviewへ戻った後、再度edit modeへ入った場合、同じNodeでは前回のカーソル位置を復元する。保存済みカーソル位置がない初回編集では、従来どおり本文末尾へカーソルを置く。

### 12.9 ブラウザ表示

ブラウザタブのtitleは、現在開いているMindMap DocumentのRoot Node `topic` と同期する。`topic` が空白のみの場合は `MindNest` を表示する。

faviconは `public/favicon.png` を使用し、HTMLでは `type="image/png"` として参照する。

### 12.10 Workspace表示モードとレスポンシブレイアウト

Workspaceには以下の表示モードを設ける。

```text
Split
  MindMap / Gantt領域とMemo領域を同時に表示する。

Map
  MindMap / Gantt領域のみを表示する。

Memo
  Memo領域のみを表示する。
```

表示モードは画面上部のUIから切り替えられる。

保存先：

```text
localStorage: mindnest.workspaceLayout
```

SplitモードではMemo領域の幅をリサイズできる。MapモードおよびMemoモードではリサイズハンドルを表示しない。

画面幅が狭い場合、SplitモードではMindMap / Gantt領域とMemo領域を横並びではなく縦積みで表示する。

```text
上: MindMap / Gantt領域
下: Memo領域
```

縦積み表示時は両領域がそれぞれ表示行いっぱいに収まり、MindMap / Gantt領域が高さ0にならないようにする。

Memo領域は1カラム幅いっぱいに表示し、通常時のMemo幅リサイズ設定によって横幅が狭くならないようにする。

MapモードおよびMemoモードでは、表示対象の領域を1カラム・1行で画面いっぱいに表示する。

---

## 13. 設定

フォント設定で `Noto Sans JP` を選択できる。

`Noto Sans JP` はGoogle Fontsから読み込む。

---

## 14. Version 2.0 MVP 必須機能

```text
・MindMap Mode / Gantt Modeを切り替えられる
・MindMap NodeをGantt Taskとして一覧表示できる
・MindMap階層をGantt Task Tableでインデント表示できる
・Leaf TaskのFrom/To/Assignee/%/Depends onを編集・保存できる
・Parent TaskのFrom/To/Assignee/%を子Taskから自動計算できる
・Parent Taskの計算項目はテキスト表示にできる
・Taskの依存関係を編集・保存できる
・循環依存を防止できる
・TimelineにTaskバーと進捗を表示できる
・Timeline側のタスク名ラベルを非表示にできる
・Day/Week/Monthを切り替えられる
・Day表示で曜日を消し、土日を色分けできる
・Gantt詳細フィールドを折りたためる
・Gantt表示状態を保持できる
・Ganttモードでも選択TaskのMemoを右側に表示できる
・Ctrl / Cmd + MでMemo preview/editを切り替えたとき、NodeごとのMemo editorカーソル位置を復元できる
・ブラウザタブtitleを現在開いているMindMapのtopic名に同期できる
・faviconとしてpublic/favicon.pngを使用できる
・JSON Export / ImportにGantt用フィールドを含める
```

---

## 15. Version 2.0 MVP では必須にしない機能

```text
・依存関係に基づく日付の自動再計算
・クリティカルパス表示
・担当者マスタ管理
・担当者別カレンダー
・祝日カレンダー
・稼働日計算
・リソース負荷管理
・複数Child MindMapを横断した統合Gantt
・PDF Export
・画像Export
・クラウド共有
・Ganttヘッダーの完全な独自レンダリング
```

---

## 16. MVP受入シナリオ

```text
1. MindMap ModeでProject Nodeを作成する

2. Project配下に以下のNodeを作成する
   - Research
   - Design
   - Development
   - Release

3. Gantt Modeへ切り替える

4. Research / Design / Development / Release がTaskとして表示される

5. Leaf TaskにFrom/To/Assignee/%を入力する

6. Parent Taskの日付・担当者・進捗が子Taskから自動計算される

7. Design depends on Research を設定する

8. Development depends on Design を設定する

9. Timeline上にTaskバーと依存関係が表示される

10. Day / Week / Month を切り替える

11. Hide fields / Show fields を切り替える

12. MindMap Modeへ戻り、再度Gantt Modeへ入る

13. Day/Week/Month選択状態とfields折りたたみ状態が保持されている

14. Gantt行内の入力欄を選択すると、右側MemoがそのTaskのMemoに切り替わる

15. ブラウザをリロードする

16. Gantt情報が保持されている

17. JSON ExportするとGantt用フィールドも含まれる

18. Memo edit中にカーソルを本文途中へ移動し、Ctrl / Cmd + MでPreviewへ戻る

19. 再度Ctrl / Cmd + MでMemo editへ入ると、同じカーソル位置が復元される

20. Child MindMapを開いた場合、ブラウザタブtitleが開いているMindMapのtopic名へ変わる
```

---

## 17. テスト方針

E2EテストはPlaywrightで実行する。

```text
npm run test:e2e
```

Node.js APIを利用するE2Eテストは `tsconfig.e2e.json` で型チェック対象に含め、`@types/node` の型を有効にする。

回帰テストとして以下を確認する。

```text
・Ctrl / Cmd + MによるMemo editor cursor位置復元
・JSON Importのreplace / append分岐
・favicon参照およびHTML titleの基本動作
```

---

## 18. 実装方針

Version 2.0 MVPではGantt描画に `gantt-task-react` を利用する。

原則としてライブラリ標準機能を尊重する。ただし、以下は標準APIで対応できないため、限定的なDOM/CSS後処理を許容する。

```text
・Day表示の日付ヘッダーから曜日を消す
・Day表示の土日ラベルおよび土日列を色分けする
・Timeline側のタスク名ラベルを非表示にする
```

Week表示およびMonth表示については、可能な限りライブラリ標準表示を維持する。
