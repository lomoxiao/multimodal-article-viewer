# multimodal-article-viewer

iPhone/iPad ブラウザ向けの、記事・Google Slides・NotebookLM 漫画導線をまとめる静的Webアプリの初期実装です。

## 使い方

`index.html` をブラウザで開くか、任意の静的サーバーでこのディレクトリを配信します。

```powershell
cd multimodal-article-viewer
npm.cmd run dev
```

## 画面下のタブ

画面下の 4 つのタブで、記事の置き場所を切り替えます（部品は `shelf-nav.js`）。どの記事もちょうど 1 つのタブに属します。

| タブ | 出る記事 |
|---|---|
| 受信箱 | 保存しただけで、まだ何も生成していない記事。行に 3 行要約と「生成する／深掘り／削除」が出る（`inbox-row.js`） |
| 記事一覧 | スライド・漫画・動画のどれかを作った記事と、束。今までの一覧と同じ |
| 定期購読 | 毎朝の「1日のまとめ」 |
| 深掘り | 深掘りレポート。作成中は段階（「出典を確認中（2/5）」など）が出る |

- 生成を依頼した時点で、記事は受信箱から記事一覧へ移ります。
- 受信箱は件数、定期購読と深掘りは未読の件数がバッジに出ます。選んだタブは次に開いたときも保たれます。
- 種別の絞り込み（Web / YouTube / 束）は記事一覧のタブでだけ使えます。

## 深掘り

- 受信箱の「深掘り」か、記事の詳細の「この記事を深掘りする」から開きます（`research-ask.js`）。観点（関連する記事・世間の評価・反対意見・懸念・技術的な裏付け・その後の動き・自分の仕事への影響）を 1 つ以上選び、補足・音声・Vault 候補を付けて依頼します。依頼は `/generationRequests` に `kind: "research"` で書かれ、常駐プロセス（article-to-slides-automation）が作ります。
- レポートの詳細には、元の記事・使った出典・確認できなかった出典（レポートには使っていない）が出ます。出典の「保存」で受信箱に入れられます（`research-view.js`。保存は `kind: "save"`）。
- 元の記事の詳細には、その記事から作った深掘りへの入口が出ます。
- 束や深掘りレポートは深掘りの元にできません。

## v1 の範囲

- Web/YouTube記事の一覧、検索、種別フィルター
- iPhoneでは詳細ボトムシート
- iPad以上では一覧 + 詳細/ビューアの2カラム
- Google Slidesは既存 `google-slides-speakerdeck-viewer` の閲覧体験を想定したページ移動・サムネイル・スピーカーノート表示
- 漫画はNotebookLM外部URL遷移

## 入力データ

静的サーバー配信時は `articles.json` を読み込みます。`file://` で直接開いた場合や読み込みに失敗した場合は、`app.js` 内のサンプルデータにフォールバックします。

- `articleId`: 記事の一意ID
- `canonicalUrl`: 正規化済みの元記事URL
- `originalUrl`: 投入時のURL
- `title`: 記事タイトル
- `source.kind`: `web` または `youtube`
- `source.headline`: 一覧/詳細に表示するヘッドライン
- `slides.status`: `pending | processing | action_required | failed | completed`
- `slides.stage`: 現在の処理工程（例: `slides_generation`）
- `slides.statusMessage`: viewer向けの安全な説明
- `slides.url`: Google Slides URL
- `manga.status`: `pending | processing | action_required | failed | completed`
- `manga.stage`: `preparing | drive_registration | source_registration | deck_generation | url_retrieval`
- `manga.statusMessage`: viewer向けの安全な説明
- `manga.url`: NotebookLM外部URL
- `updatedAt`: 最終更新日時

`processing`、`action_required`、`failed`は詳細画面のステータスチップから処理状況を確認できます。技術的なエラーは`/artifactDiagnostics/{articleId}/{artifactType}`へ分離して保存され、editorだけが閲覧できます。

## Kobo向け保存本文Reader

保存済み本文は、一覧の「保存済み本文」から開けるほか、次のパーマリンクで直接開けます。

```text
https://lomoxiao.github.io/multimodal-article-viewer/?reader=<articleId>
```

Readerは19px・行間1.85・最大42remの本文幅、端末のライト／ダーク設定、3行要約、元記事リンクに対応します。構造化された保存本文では、見出し、段落、番号付き／番号なしリスト、引用、コード、区切り線をKobo向けの余白で表示します。本文は`textContent`からDOMを組み立て、生HTMLを実行しません。

パーマリンクを開いて未ログインの場合は、既存のFirebase Authenticationでログインした後に同じ記事を表示します。本文の`/articleSources`は、Realtime Database Rulesにより`/access/viewers/{uid} = true`の利用者だけが読めます。

## 成果物URLの手動登録

editor権限を持つユーザーは、詳細画面の編集スイッチからGoogle SlidesとNotebookLMのURLを登録・修正できます。閲覧モードではURL未登録の成果物は非活性になります。

保存形式:

```json
{
  "slides": {
    "status": "completed",
    "url": "https://docs.google.com/presentation/d/.../edit",
    "origin": "manual",
    "locked": true,
    "updatedAt": "2026-06-21T00:00:00.000Z"
  }
}
```

手動登録を許可する本人UIDをRealtime Databaseへ追加してください。

```text
/access/viewers/{uid} = true
/access/editors/{uid} = true
```

`config.js`の`NOTEBOOKLM_URL`には、処理状況パネルの「NotebookLMを開く」で使用する固定ノートブックURLを設定できます。未設定時はNotebookLMトップページを使用します。

配布用Rules雛形は`database.rules.json`です。Firebase ConsoleまたはFirebase CLIで本番Rulesへ反映してください。既存のviewer/editor権限モデルを使い、editorには`slides`、`manga`、記事の`updatedAt`、論理削除用の`deletedAt`と`deletedBy`だけを書き換える権限を与えます。`title`、`source`、記事ノードの物理削除は許可しません。

記事一覧の削除操作は、記事に`deletedAt`と`deletedBy`を保存してViewerから非表示にします。Google Slides、NotebookLM、Drive上の成果物と`artifactDiagnostics`は削除しません。削除直後は画面下部の「元に戻す」から両フィールドを解除できます。

手動登録したURLは`origin: "manual"`、`locked: true`となります。automationは、この状態のcompleted URLを通常更新で上書きしません。
