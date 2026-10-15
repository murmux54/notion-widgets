# Notion HOME Today widget

Daily と Today’s ToDo を同じ画面にまとめる Google Apps Script ウェブアプリです。ソースは GitHub で管理し、Notion API トークンは GAS のスクリプトプロパティだけに保存します。

## 必要な設定

1. Notionで内部インテグレーションを作成し、Daily DBとTasks DBへ接続を追加する。
2. Apps Scriptプロジェクトを作成し、`Code.gs`、`Index.html`、`appsscript.json`を配置する。
3. Apps Scriptの「プロジェクトの設定」→「スクリプト プロパティ」に `NOTION_TOKEN` を登録する。
4. ウェブアプリとしてデプロイする。実行ユーザーは所有者、アクセス権は原則「自分のみ」にする。
5. デプロイURLをブラウザで開き、Dailyの保存、タスク追加、完了の3操作をテストする。
6. 動作確認後にNotion HOMEへデプロイURLを埋め込む。既存ビューは検証完了まで残す。

## DB対応

- Daily data source: `292b6d9e-ed1d-80ab-9d8d-000b936c2fce`
- Tasks data source: `37cb6d9e-ed1d-801a-8afe-000b9027f387`
- 今日のタスクは既存Tasks DBへ作成されるため、HOMEのINBOX/NEXTと正本が分かれません。

## セキュリティ

- `NOTION_TOKEN` をHTML、GitHub、URL、ログへ書かない。
- GASは許可したプロパティだけを読み書きする。
- 公開前にアクセス権を確認する。匿名公開は避ける。
