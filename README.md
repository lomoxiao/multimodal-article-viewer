# multimodal-article-viewer

iPhone/iPad ブラウザ向けの、記事・Google Slides・NotebookLM 漫画導線をまとめる静的Webアプリの初期実装です。

## 使い方

`index.html` をブラウザで開くか、任意の静的サーバーでこのディレクトリを配信します。

```powershell
cd multimodal-article-viewer
npm.cmd run dev
```

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
