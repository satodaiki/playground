# ナナオのあそびば

小さなWeb作品を置くReact + Viteのplaygroundです。

## Subscription Scanner

Googleアカウントを1回連携すると、過去1年の請求・領収書メールから契約中と思われるサブスクを自動推定します。

- 既知サービスは送信元・件名・正規表現で判定
- 未判定メールだけをOpenAI Responses API（`gpt-5.6-luna`）で構造化
- 月額換算と年間の見直し余地を通貨別に表示
- DBなし。本アプリではOAuthアクセストークンとメール本文をLambdaの処理中だけ保持

構成は、S3 + CloudFrontのReact SPAと、Python 3.12のLambda Function URLです。LambdaはSDKを同梱せず、標準ライブラリからGoogle/OpenAIのREST APIを呼びます。

### 1. Google Cloudを設定する

1. Google Cloud Consoleでプロジェクトを作成し、Gmail APIを有効化します。
2. OAuth同意画面を作成し、スコープに `https://www.googleapis.com/auth/gmail.readonly` を追加します。
3. ハッカソン中は公開ステータスを「テスト」にして、利用するGoogleアカウントをテストユーザーへ追加します。
4. 「ウェブ アプリケーション」種類のOAuthクライアントを作成し、クライアントIDとシークレットを控えます。
5. 後述のTerraform適用後に出力される `subscription_scanner_oauth_callback_url` を、承認済みのリダイレクトURIへ完全一致で登録します。

一般公開する場合、`gmail.readonly` は制限付きスコープのためGoogleの審査が必要です。

### 2. OpenAI APIを設定する

[OpenAI Platform](https://platform.openai.com/api-keys)でAPIキーを作成します。Lambdaはルールで判定できなかったメールの送信元・件名・本文の先頭4,000文字だけを `gpt-5.6-luna` に送り、Responses APIのStructured OutputsでJSONを受け取ります。リクエストには `store: false` を指定します。

### 3. AWSへLambdaを作成する

AWS CLIの認証を済ませ、`tf/terraform.tfvars` を作成します。このファイルはGit管理対象外です。

```hcl
root_domain     = "example.com"
sub_domain_name = "playground"
project_name    = "playground"

google_client_id     = "...apps.googleusercontent.com"
google_client_secret = "..."
openai_api_key       = "sk-..."
oauth_state_secret   = "32文字以上のランダムな値"

# ローカル画面からOAuthを試す場合だけ追加
subscription_scanner_extra_origins = ["http://localhost:5173"]
subscription_scanner_max_messages  = 100
```

```bash
cd tf
terraform init
terraform apply
terraform output -raw subscription_scanner_function_url
terraform output -raw subscription_scanner_oauth_callback_url
```

シークレットはLambda環境変数とTerraform stateに入るため、stateは共有せず安全に保管してください。Secrets Managerはハッカソン用の最小構成では省略しています。

### 4. フロントエンドを接続する

プロジェクト直下の `.env.local` にFunction URLを設定します。

```dotenv
VITE_SUBSCRIPTION_SCANNER_API_URL=https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws
```

```bash
npm install
npm run dev:fast
```

本番へ反映する場合は、同じ環境変数を設定したシェルから `npm run deploy` を実行します。

### APIの流れ

- `GET /oauth/start?origin=...&mode=popup`: 署名付きstateを作りGoogle OAuthへ移動
- `GET /oauth/callback`: codeを交換し、Gmail走査と推定を実行
- `GET /health`: Lambdaの稼働状態を返す

画面ではOAuthをポップアップで開き、callbackが結果JSONを元画面へ `postMessage` して閉じます。API確認用に `mode=json` を指定するとcallbackはJSONを直接返します。

### データの扱い

- OAuthはオンラインアクセスだけを要求し、refresh tokenを取得しません。
- 本アプリはアクセストークンとメール本文をLambdaのメモリ内だけで使い、DB・S3・ブラウザストレージへ保存しません。
- Lambdaはトークン、認可コード、メール本文をログ出力しません。
- OpenAIへ送るのはルールで判定できない候補メールだけです。`store: false` でResponsesの状態保存を無効化しますが、通常のAPI利用では不正利用監視ログに内容が最大30日保持される場合があります。外部サービス側にも保持させない要件では、OpenAIの承認を受けたZero Data Retentionプロジェクトを使用してください。
- 1回の走査件数はLambdaの実行時間を守るため最大100件です。`subscription_scanner_max_messages` で1〜100件に変更できます。

### テスト

```bash
python -m unittest discover -s backend/subscription_scanner -p 'test_*.py'
npm test -- src/test/SubscriptionScanner.test.tsx --maxWorkers=1
npm run build
terraform -chdir=tf validate
```

## 除夜の鐘

2025年の終わりに「大晦日」というテーマで作成したゲームです。

最初はゲームでもなんでもなくて、ただWeb上で除夜の鐘を突ければいいかと思って作っていましたが、妻と「撞木が増えたりしたら面白いね」みたいな話をしてたらレベリングとか付いていつの間にかクリッカーゲームみたいになりました。

ちなみに鐘のことは正しくは梵鐘（ぼんしょう）、梵鐘を突く木の棒のことを撞木（しゅもく）といいます。
