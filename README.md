い# multimodal-article-viewer

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
- `slides.status`: Google Slides生成状態
- `slides.url`: Google Slides URL
- `manga.status`: NotebookLM/漫画生成状態
- `manga.url`: NotebookLM外部URL
- `updatedAt`: 最終更新日時

## NotebookLM URLの手動登録

Firebase上の`manga.status`が`pending`、`processing`、`failed`の記事は、詳細画面からNotebookLM URLを登録できます。`completed`の記事では既存URLを修正できます。

保存形式:

```json
{
  "manga": {
    "status": "completed",
    "url": "https://notebooklm.google.com/notebook/.../artifact/...",
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

配布用Rules雛形は`database.rules.json`です。Firebase ConsoleまたはFirebase CLIで本番Rulesへ反映してください。viewerには`manga`と記事の`updatedAt`だけを書き換える権限を与え、`slides`、`title`、`source`、記事削除は許可しません。

手動登録したURLは`origin: "manual"`、`locked: true`となります。将来の自動漫画連携では、この状態のURLを通常更新で上書きしないでください。
