# Notion HOME Today widget

Notion HOME の Daily と Today’s ToDo を、Notionデスクトップアプリでも表示できるようにするウィジェットです。

- 表示: GitHub Pages の `today.html`
- データ処理: Google Apps Script のWeb API
- 保存先: 既存のNotion Daily / Tasksデータソース
- 秘密情報: GASのスクリプト プロパティだけに保存

公開HTMLにNotionトークンやアクセスキーは含めません。GASは「ウェブアプリにアクセスできるユーザー: 全員」で公開しますが、すべてのデータ取得・更新は32文字以上の `WIDGET_KEY` がないと実行できません。GETリクエストはヘルスチェックだけを返し、Notionデータを返しません。

## ファイル

- `/today.html`: Notionに埋め込む公開UI
- `/notion-home-widget/Code.gs`: 認証付きGAS API
- `/notion-home-widget/Index.html`: 旧GAS内UI（新構成では未使用）
- `/notion-home-widget/appsscript.json`: GAS設定

## 初回設定

### 1. GASのスクリプト プロパティ

Apps Scriptの「プロジェクトの設定」→「スクリプト プロパティ」に次の2項目を設定します。

- `NOTION_TOKEN`: 既存のNotion内部インテグレーショントークン
- `WIDGET_KEY`: 推測されにくい32文字以上のランダムな文字列（既存値をそのまま利用できます）

`WIDGET_KEY` はGitHub、HTML、URL、コミット、ログに書かないでください。

### 2. GASコードとデプロイ

1. Apps Scriptの `Code.gs` をこのフォルダの内容で置き換えます。
2. 「デプロイ」→「デプロイを管理」→既存デプロイの編集を開きます。
3. 新しいバージョンを選び、実行ユーザーを「自分」、アクセスできるユーザーを「全員」にします。
4. デプロイ後もURLが `https://script.google.com/macros/s/.../exec` であることを確認します。

匿名ユーザーはGAS URLへ到達できますが、`WIDGET_KEY` が一致しない限りDaily/Tasksの読み書きはできません。

### 3. GitHub Pages

公開URL:

`https://murmux54.github.io/notion-widgets/today.html`

初回表示時に `WIDGET_KEY` を入力します。「この端末に保存する」をオンにすると、キーはそのブラウザのローカルストレージだけに保存されます。共有端末ではオフにしてください。

### 4. Notion HOME

1. 既存のGAS URLの埋め込みは、検証が終わるまで残します。
2. `/embed` で上記GitHub Pages URLを埋め込みます。
3. Notionデスクトップアプリ上でキーを入力し、次を確認します。
   - 今日の日付・天気・体重・体脂肪率・血圧・歩数が表示される
   - Daily編集が既存Daily DBに反映される
   - タスク追加が既存Tasks DBに反映される
   - 完了操作で既存Tasks DBの状況が「完了」になる
4. 確認後、旧GAS埋め込みを削除します。

## DB対応

- Daily data source: `292b6d9e-ed1d-80ab-9d8d-000b936c2fce`
- Tasks data source: `37cb6d9e-ed1d-801a-8afe-000b9027f387`

更新できるのは当日分だけです。Dailyは許可した6項目だけ、Tasksはタスク名・日付・状況・優先度だけを扱います。完了APIは、当日の未完了タスクとしてTasksデータソースから確認できたページだけを更新します。

## セキュリティ上の注意

- `NOTION_TOKEN` と `WIDGET_KEY` を公開HTMLやGitHubへ置かない。
- GASの実行ログへリクエスト本文やトークンを出力しない。
- `WIDGET_KEY` を共有した疑いがある場合は、スクリプト プロパティの値だけを交換する。
- NotionインテグレーションはDaily DBとTasks DBだけに接続する。
- 共有端末では「この端末に保存する」をオフにし、利用後に「キー変更」を押して保存キーを消す。
