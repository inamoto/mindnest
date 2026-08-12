# MindNest ソフトウェア仕様書
Version 1.0 仕様：階層型MindMap、Markdown Memo、Child MindMap、設定、ノード色、JSON Export/Import

## 1. ノードの基本モデル

本アプリケーションでは、すべてのMindMapノードに1つのメモを対応付ける。

各ノードは以下の情報を持つ。

```typescript
interface MindMapNode {
  id: string;
  topic: string;

  memo?: string;

  childMindMapId?: string;

  /** ノード背景色および枠線色 */
  'background-color'?: string;

  /** ノード文字色 */
  'foreground-color'?: string;

  children?: MindMapNode[];
}
```

各フィールドの意味：

```text
topic
  MindMap上に表示するノードタイトル

memo
  ノードに紐づくMarkdown形式のメモ

childMindMapId
  ノードから遷移できるChild MindMapのID

background-color
  ノードの背景色および枠線色。代表色パレットから設定する。
  エッジ色には影響しない。

foreground-color
  ノードの文字色。代表色パレットから設定する。
```

したがって1つのノードは、

```text
┌──────────────────────┐
│ Project A            │
├──────────────────────┤
│ Markdown Memo        │
├──────────────────────┤
│ Child MindMap        │
└──────────────────────┘
```

という3つの情報を持つことができる。

---

# 2. Markdownメモ

すべてのノードは1つのMarkdownメモを持つ。

メモが存在しない場合は空文字列として扱う。

例：

```json
{
  "id": "node-project-a",
  "topic": "Project A",
  "memo": "## Overview\n\nThis project develops a new AI service."
}
```

---

# 3. ノード選択時の動作

アプリケーション名は `MindNest` とする。

MindMap上でノードを選択すると、そのノードに対応するメモを表示する。

基本画面は以下の構成とする。

```text
┌─────────────────────────────────────────────────────────────┐
│ MindNest / Work / Project A                                │
├──────────────────────────────────────┬──────────────────────┤
│                                      │                      │
│                                      │  Project A           │
│                                      │                      │
│          MindMap                     │  ## Overview         │
│                                      │                      │
│       Project A                      │  This project...     │
│       /       \                      │                      │
│  Planning     Dev                    │                      │
│                                      │                      │
│                                      │                      │
├──────────────────────────────────────┴──────────────────────┤
│                              Memo / Preview / Edit           │
└─────────────────────────────────────────────────────────────┘
```

推奨レイアウトは、

```text
左：MindMap

右：選択NodeのMarkdownメモ
```

とする。

---

# 4. メモ表示モード

メモには最低限以下の2モードを設ける。

```text
Preview
Edit
```

## Preview

MarkdownをHTMLへ変換して閲覧する。

例：

保存されているMarkdown：

```markdown
# Project A

## Purpose

Create a new **AI-powered service**.

### Tasks

- Research
- Prototype
- Test
```

表示：

```text
Project A

Purpose

Create a new AI-powered service.

Tasks

• Research
• Prototype
• Test
```

---

# 5. Editモード

EditモードではMarkdownソースを直接編集できる。

例：

```markdown
## Meeting Notes

- Discuss API design
- Check schedule
- Review prototype

### Next Action

Talk with the development team.
```

編集内容はNodeに保存する。

---

# 6. Markdown対応範囲

Version 1.0では一般的なMarkdown記法をサポートする。

最低限以下を対象とする。

```text
Heading

# Heading
## Heading
### Heading

Bold

**bold**

Italic

*italic*

Bullet List

- Item 1
- Item 2

Numbered List

1. Item
2. Item

Checkbox

- [ ] Todo
- [x] Done

※ Version 1.0ではタスクリストのチェックボックスUI化は行わず、テキストとして表示してよい。

Link

[OpenAI](https://openai.com)

Inline Code

`const a = 1`

Code Block

```typescript
const hello = "world";
```

Blockquote

> Note

Horizontal Rule

---

Table

| A | B |
|---|---|
| 1 | 2 |

Strikethrough

~~deleted~~

Math

Inline: $x^2$
Display: $$x^2$$
```

表示数式 `$$...$$` は1行で入力された場合も、表示数式として描画されるように正規化する。数式描画にはKaTeXを使用する。

---

# 7. Markdownライブラリ

Markdown描画には専用ライブラリを利用する。

Reactを使用する場合の候補：

```text
react-markdown
```

または、

```text
marked
```

を利用する。

セキュリティ上、Markdownに含まれるHTMLをそのまま実行しない。

Version 1.0ではMarkdown内の生HTMLは原則無効とする。

Markdown Previewでは以下のライブラリを利用する。

```text
react-markdown
remark-gfm
remark-math
rehype-katex
highlight.js / lowlight
```

サポート対象外：

```text
Mermaid diagrams
HTML実行
タスクリストのチェックボックスUI化
```

---

# 8. Markdown Editor

初期バージョンでは通常のtextareaを利用してよい。

例：

```tsx
<textarea
  value={memo}
  onChange={handleMemoChange}
/>
```

ただし将来的には、

```text
CodeMirror

Monaco Editor
```

等への置き換えを可能な設計とする。

Markdown Editor固有処理は独立したComponentへ分離する。

---

# 9. Memo Component

構成：

```text
NodeMemo
 │
 ├─ MemoToolbar
 │
 ├─ MarkdownEditor
 └─ MarkdownPreview
```

Reactの場合：

```text
NodeMemo.tsx

MemoToolbar.tsx

MarkdownEditor.tsx

MarkdownPreview.tsx
```

---

# 10. ノード切り替え

Node Aを選択：

```text
Node A

Memo:
---------
This is memo A.
```

Node Bを選択：

```text
Node B

Memo:
---------
## Meeting

Meeting at 10:00.
```

というように、選択ノードに応じて右側メモ領域を切り替える。

---

# 11. メモ自動保存

Markdownメモは自動保存する。

編集後、

```text
500ms程度
```

のdebounceを行い、IndexedDBへ保存する。

処理：

```text
Markdown入力

↓

React State更新

↓

500ms debounce

↓

現在のNode.memo更新

↓

MindMap Document保存

↓

IndexedDB
```

明示的なSaveボタンは必須としない。

---

# 12. MindMap DocumentとMemo

Version 1.0ではMemoをMindMapのNodeデータ内に保存する。

例：

```json
{
  "id": "map-project",
  "name": "Project",
  "data": {
    "meta": {
      "name": "Project"
    },
    "format": "node_tree",
    "data": {
      "id": "root",
      "topic": "Project",
      "memo": "# Project\n\nProject overview.",
      "children": [
        {
          "id": "node-planning",
          "topic": "Planning",
          "memo": "## Planning\n\n- Schedule\n- Budget"
        }
      ]
    }
  }
}
```

メモを別IndexedDBテーブルに分離する必要はない。

---

# 13. Child MindMapとの併用

NodeはMemoとChild MindMapを同時に持てる。

例：

```json
{
  "id": "backend",
  "topic": "Backend",
  "memo": "## Backend\n\nBuilt using TypeScript.",
  "childMindMapId": "map-backend"
}
```

UI上では、

```text
Backend ↗
```

というNodeを選択すると右側にMarkdown Memoが表示される。

Child MindMapを持つNodeを選択した場合は、Node付近に `Open MindMap` ポップアップを表示する。ポップアップの表示位置は以下とする。

```text
子Nodeを持たない葉Node
  Nodeの右側

子Nodeを持つNode
  Nodeの下側
```

`Open MindMap` を押すと、該当Nodeに紐づくChild MindMapへ移動する。

Double ClickはChild MindMapへの移動には使用せず、NodeのRenameに割り当てる。

Child MindMap作成時のMindMap名は、選択Nodeの `topic` をそのまま使用する。名前に `Child MindMap` などの接尾辞は付与しない。

したがって、

```text
Single Click
    ↓
Memo表示
    ↓
Child MindMapが存在する場合はOpen MindMapポップアップ表示

Open MindMap
    ↓
Child MindMapを開く

Double Click
    ↓
Node名をRename
```

という操作体系とする。

---

# 14. Node操作

通常Node：

```text
Add Sibling Node
Add Child Node
Rename
Edit Memo
Create MindMap
Delete
```

Child MindMapを持つNode：

```text
Add Sibling Node
Add Child Node
Rename
Edit Memo
Open MindMap
Delete MindMap
Delete
```

ただし「Edit Memo」はコンテキストメニューだけでなく、Nodeを選択すれば常時右ペインから編集できるものとする。

`Add Sibling Node` は選択Nodeの直後に兄弟Nodeを追加する。Root Node選択時はRootの兄弟を作れないため、Root配下のChild Node追加として扱う。

`Add Child Node` は選択Nodeの子としてNodeを追加する。

右クリックメニューは表示後にサイズを測定し、画面下端・右端からはみ出す場合はビューポート内に収まる位置へ自動補正する。

右クリックメニューでは、主要操作の右側にキーボードショートカットを表示する。

```text
+ Sibling Node      Enter
+ Child Node        Tab
Delete              Del
Reset colors        Ctrl+0
Open MindMap        Ctrl+Enter
Create MindMap      Ctrl+Enter
Delete MindMap      Ctrl+Delete
```

ただし `Ctrl + 1`、`Ctrl + 2`、`Ctrl + 3` の背景色変更ショートカットは右クリックメニューには表示しない。

---

# 15. UI例

```text
┌────────────────────────────────────────────────────────────────────┐
│ MindNest / Work / Project A                                       │
├──────────────────────────────────────────┬─────────────────────────┤
│                                          │ Project A               │
│                                          │                         │
│                 Project A                │ [Preview] [Edit]        │
│                /         \               │                         │
│         Planning       Backend ↗         │ ## Overview             │
│           /                              │                         │
│      Schedule                            │ This project is...      │
│                                          │                         │
│                                          │ ### Todo                │
│                                          │ - [ ] Design            │
│                                          │ - [x] Prototype         │
│                                          │                         │
├──────────────────────────────────────────┴─────────────────────────┤
│ [+ Sibling Node] [+ Child Node] [Create MindMap] [Hide Memo] [Export JSON] │
└────────────────────────────────────────────────────────────────────┘
```

---

# 16. メモパネルサイズ

MindMapとMemoパネルの境界はドラッグして変更できる。

例：

```text
MindMap 70% | Memo 30%

↓

MindMap 50% | Memo 50%
```

Memoパネル表示時は、MindMapパネルとMemoパネルの間にリサイズ用ハンドルを表示する。

ドラッグ操作によりMemoパネル幅を変更できる。幅は極端に狭く/広くなりすぎないよう、最小・最大幅を設ける。

---

# 17. Memoパネルの開閉

MindMapを広く使いたい場合に備えて、Memoパネルは折りたたみ可能とする。

例：

```text
[Hide Memo]
```

折りたたみ時：

```text
┌──────────────────────────────────────────────┐
│                                              │
│                  MindMap                     │
│                                              │
└──────────────────────────────────────────────┘
```

再表示：

```text
[Show Memo]
```

Memoパネル非表示時はMindMapパネルを全幅表示する。Memoパネルを再表示した場合は、選択中NodeのMemoを再び右側に表示する。

---

# 18. Node Memoの存在表示

メモが存在するNodeについて、MindMap上で小さなインジケータを表示してもよい。

例：

```text
Project A 📝
```

Child MindMapも存在する場合：

```text
Project A 📝 ↗
```

ただしNodeのtopic自体には、

```text
📝
↗
```

を保存しない。

表示時のCSSまたはDOM decorationとして実現する。

---

# 19. データモデル

推奨TypeScriptモデル：

```typescript
interface MindMapDocument {
  id: string;
  name: string;
  data: JsMindData;
  createdAt: number;
  updatedAt: number;
}

interface MindMapNodeData {
  id: string;
  topic: string;

  memo?: string;

  childMindMapId?: string;

  'background-color'?: string;
  'foreground-color'?: string;

  children?: MindMapNodeData[];
}
```

実際にはjsMindのNode拡張属性として、

```typescript
{
  id: "node-001",
  topic: "Project A",
  memo: "...",
  childMindMapId: "map-002"
}
```

を保持する。

---

# 20. データ構造イメージ

最終的な概念は以下となる。

```text
                         My Knowledge
                              │
                  ┌───────────┴───────────┐
                  │                       │
                Work                    Study
                  │                       │
             [Markdown]               [Markdown]
                  │
             Child MindMap
                  ↓

                Work
                  │
          ┌───────┴────────┐
          │                │
      Project A        Project B
          │
       [Markdown]
          │
       Child MindMap
          ↓

             Project A
              /      \
         Planning   Backend
           │           │
        [Memo]      [Memo]
                       │
                   Child MindMap
                       ↓
```

すべてのNodeが、

```text
Node
 ├─ Topic
 ├─ Markdown Memo
 └─ Child MindMap（optional）
```

という共通モデルを持つ。

---

# 21. キーボード操作

以下のキーボード操作をサポートする。

```text
Enter
    選択NodeのSibling Nodeを追加

Insert / Tab
    選択NodeのChild Nodeを追加

Ctrl + Enter
    Child MindMapが存在する場合は開く
    存在しない場合は作成し、そのまま作成したChild MindMapへ入る

Ctrl + Delete
    選択Nodeに紐づくChild MindMapを削除する

Ctrl + 0
    選択Nodeの背景色・文字色をリセットする

Ctrl + 1
    選択Nodeの背景色をRedにする

Ctrl + 2
    選択Nodeの背景色をYellowにする

Ctrl + 3
    選択Nodeの背景色をGreenにする

Ctrl + M
    MindMapとMemo Editor間でフォーカスを切り替える

Esc
    Memo EditorからMindMapへフォーカスを戻す

Ctrl + Z
    Undo

Ctrl + Y / Ctrl + Shift + Z
    Redo
```

ブラウザ標準ショートカットとの競合がないよう調整する。

---

# 22. Export

MindMapをJSONとしてExportする場合、Memoも含める。

例：

```json
{
  "id": "node-001",
  "topic": "Project A",
  "memo": "# Project A\n\nProject memo...",
  "childMindMapId": "map-project-a"
}
```

したがってExportしたJSONから、

```text
MindMap構造
Nodeタイトル
Markdown Memo
Child MindMapへの参照
```

を復元できる形式とする。

---

# 23. Version 1.0必須機能

Markdown Memoに関して以下を必須とする。

```text
・すべてのNodeにMemoを持てる

・MemoはMarkdown形式

・Node選択時にMemoを表示

・Markdown Editモード

・Markdown Previewモード

・Memo自動保存

・Memoを含むJSON Export

・Child MindMapとMemoを同時に保持可能

・Memoパネルの表示/非表示を切り替え可能

・Memoパネル幅をドラッグで変更可能

・Sibling NodeとChild Nodeを明示的に追加可能

・設定画面からTheme、Font、MindMap文字サイズ、Memo文字サイズを変更可能

・ノード右クリックメニューから背景色と文字色を代表色パレットで変更可能

・ノード背景色は不透明とし、枠線色と常に一致する

・ノード背景色を変更してもエッジ色は変更しない

・Child MindMapを持つノードを削除する場合は確認ダイアログを表示する
```

---

# 24. MVP受入シナリオ

```text
1. Root MindMapを開く

2. 「Work」Nodeを作成

3. Workを選択

4. MemoへMarkdownを入力

   # Work

   ## Todo

   - [ ] Project A
   - [ ] Project B

5. 別Nodeを選択

6. 再度Workを選択

7. Memoが保持されている

8. WorkからChild MindMapを作成

9. Work MindMapを開く

10. Project A Nodeを作成

11. Project AにMarkdown Memoを書く

12. ブラウザを終了

13. 再度起動

14. MindMap階層とMemoがすべて保持されている

15. JSON ExportするとMemoも含まれる
```

以上をVersion 1.0の受入条件に追加する。

---

# 25. 設定画面

画面右上の設定ボタンから設定ダイアログを開ける。

設定項目：

```text
Theme
  System / Light / Dark

Font
  System / Serif / Sans Serif / Noto Sans JP / Monospace

MindMap font size
  8px - 24px

Memo font size
  12px - 24px
```

設定は `localStorage` に保存し、リロード後も保持する。

保存キー：

```text
hierarchicalMindMap.settings
```

Reset操作により初期値へ戻せる。

`Noto Sans JP` はGoogle Fontsから読み込む。ネットワークが利用できない場合はブラウザのフォールバックフォントを使用する。

---

# 26. ノード色設定

ノードの右クリックメニューから、背景色と文字色を代表色パレットで選択できる。

代表色：

```text
Blue
Green
Yellow
Red
Slate
White
Black
```

仕様：

```text
・背景色は不透明色とする
・背景色と枠線色は常に一致させる
・文字色は背景色とは独立して設定できる
・背景色を変更してもエッジ色は変更しない
・Reset colorsでノード個別の背景色・文字色を解除する
・Ctrl + 0でノード個別の背景色・文字色を解除する
・Ctrl + 1で背景色をRedにする
・Ctrl + 2で背景色をYellowにする
・Ctrl + 3で背景色をGreenにする
・Ctrl + 1〜3は右クリックメニューには表示しない
・ノード色はIndexedDB上のMindMap Nodeデータに保存する
・JSON Export/Importにノード色を含める
```

---

# 27. キーボード操作詳細

MindMapにフォーカスがある場合：

```text
Enter
  選択NodeのSibling Nodeを追加

Insert / Tab
  選択NodeのChild Nodeを追加

Delete
  選択Nodeを削除

Arrow keys
  Node間を移動

Ctrl + Enter
  Child MindMapが存在する場合は開く
  存在しない場合は作成し、そのまま作成したChild MindMapへ入る

Ctrl + Delete
  選択Nodeに紐づくChild MindMapを削除する

Ctrl + 0
  選択Nodeの背景色・文字色をリセットする

Ctrl + 1
  選択Nodeの背景色をRedにする

Ctrl + 2
  選択Nodeの背景色をYellowにする

Ctrl + 3
  選択Nodeの背景色をGreenにする

Ctrl + M
  Memo Editorへフォーカス

Ctrl + Z
  Undo

Ctrl + Y / Ctrl + Shift + Z
  Redo
```

Memo Editorにフォーカスがある場合：

```text
Enter / Backspace / Delete / Arrow keys
  textarea内の通常編集として動作する

Tab
  フォーカス移動ではなくタブ文字を挿入する

Escape
  Memo EditorからMindMapへフォーカスを戻す

Ctrl + M
  Preview表示へ戻り、MindMapへフォーカスする
```

Memo Editor内のキー操作はMindMapショートカットを発火させてはならない。

---

# 28. 削除時の確認

`childMindMapId` を持つNodeを削除する場合は確認ダイアログを表示する。

```text
Cancel
  Nodeを削除しない

OK
  Nodeを削除する
```

コンテキストメニュー経由とDeleteキー経由のどちらでも同じ確認を行う。

Child MindMapのみを削除する操作は、Node削除とは別の確認フローを持つ。右クリックメニューの `Delete MindMap` または `Ctrl + Delete` から実行できる。

---

# 29. 永続化

MindMap DocumentはIndexedDBへ保存する。

```text
Database: hierarchicalMindMap
Table: mindMaps
```

保存対象：

```text
MindMap Document
Node topic
Node memo
Child MindMap参照
Node背景色
Node文字色
```

アプリ設定はlocalStorageへ保存する。

```text
Key: hierarchicalMindMap.settings
```

JSON Exportは `mindmap-bundle` として、選択NodeをrootNodeにし、参照されるChild MindMap群を `maps` に含める。

---

# 30. Version 1.0 Playwright回帰テスト観点

Version 1.0では最低限以下を自動テストで保証する。

```text
・設定変更が画面へ反映される
・設定変更がリロード後も保持される
・ノード背景色/文字色が右クリックメニューから変更できる
・Ctrl + 0〜3でノード色を変更・リセットできる
・Ctrl + 0〜3でMemo EditorやNode Renameに入らない
・ノード背景色/文字色がリロード後も保持される
・背景色と枠線色が一致する
・背景色変更でエッジ色が変化しない
・1行の$$...$$が表示数式として描画される
・Memo Editor内のキー操作がMindMap構造を変更しない
・Child MindMap付きNode削除時に確認ダイアログを表示する
・Deleteキー経由でも同じ確認ダイアログを表示する
・Ctrl + DeleteでChild MindMapのみを削除できる
・Child MindMapを持つNode選択時にOpen MindMapポップアップから遷移できる
・Ctrl + EnterでChild MindMapを作成した場合、そのままChild MindMapへ入り、戻った後もNodeとの紐づきが保持される
・Double ClickでNode Renameに入る
・Export JSONにMemo、Child MindMap参照、Node色が含まれる
```

---

# 31. 既知の制限事項

```text
・クラウド同期は行わない
・複数端末同期は行わない
・共同編集は行わない
・Mermaid diagramsは描画しない
・タスクリストのチェックボックスUI化は行わない
・設定情報はJSON Exportに含めない
```
