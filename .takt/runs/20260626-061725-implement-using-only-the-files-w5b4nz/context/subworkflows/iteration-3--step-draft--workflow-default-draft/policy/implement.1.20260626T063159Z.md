# コーディングポリシー

速さより丁寧さ、実装の楽さよりコードの正確さを優先する。

## 原則

| 原則 | 基準 |
|------|------|
| Simple > Easy | 書きやすさより読みやすさを優先 |
| DRY | 本質的な重複は排除する |
| コメント | Why のみ。What/How は書かない |
| 関数サイズ | 1関数1責務。30行目安 |
| ファイルサイズ | 目安として300行。タスクに応じて柔軟に |
| ボーイスカウト | 触った箇所は少し改善して去る |
| Fail Fast | エラーは早期に検出。握りつぶさない |
| プロジェクトスクリプト優先 | ツール実行はプロジェクト定義のスクリプトを使う。直接実行は最後の手段 |
| 状態の正規化 | 同じ事実を複数の状態として保持しない |

## フォールバック・デフォルト引数の禁止

値の流れを不明瞭にするコードは書かない。ロジックを追わないと値が分からないのは悪いコード。

### 禁止パターン

| パターン | 例 | 問題 |
|---------|-----|------|
| 必須データへのフォールバック | `user?.id ?? 'unknown'` | エラーになるべき状態で処理が進む |
| デフォルト引数の濫用 | `function f(x = 'default')` で全呼び出し元が省略 | 値がどこから来るか分からない |
| null合体で渡す口がない | `options?.cwd ?? process.cwd()` で上位から渡す経路なし | 常にフォールバックになる（意味がない） |
| try-catch で空値返却 | `catch { return ''; }` | エラーを握りつぶす |
| 不整合な値のサイレントスキップ | `if (a !== expected) return undefined` | 設定ミスが実行時に黙って無視される |

### 正しい実装

```typescript
// ❌ 禁止 - 必須データへのフォールバック
const userId = user?.id ?? 'unknown'
processUser(userId)  // 'unknown' で処理が進んでしまう

// ✅ 正しい - Fail Fast
if (!user?.id) {
  throw new Error('User ID is required')
}
processUser(user.id)

// ❌ 禁止 - デフォルト引数で全呼び出し元が省略
function loadConfig(path = './config.json') { ... }
// 全呼び出し元: loadConfig()  ← path を渡していない

// ✅ 正しい - 必須引数にして明示的に渡す
function loadConfig(path: string) { ... }
// 呼び出し元: loadConfig('./config.json')  ← 明示的

// ❌ 禁止 - null合体で渡す口がない
class Engine {
  constructor(config, options?) {
    this.cwd = options?.cwd ?? process.cwd()
    // 問題: options に cwd を渡す経路がない場合、常に process.cwd() になる
  }
}

// ✅ 正しい - 上位から渡せるようにする
function createEngine(config, cwd: string) {
  return new Engine(config, { cwd })
}
```

### 許容されるケース

- 外部入力（ユーザー入力、API応答）のバリデーション時のデフォルト値
- 設定ファイルのオプショナル値（明示的に省略可能と設計されている）
- 一部の呼び出し元のみがデフォルト引数を使用（全員が省略している場合は禁止）

### 判断基準

1. **必須データか？** → フォールバックせず、エラーにする
2. **全呼び出し元が省略しているか？** → デフォルト引数を削除し、必須にする
3. **上位から値を渡す経路があるか？** → なければ引数・フィールドを追加
4. **関連する値に不変条件があるか？** → ロード・セットアップ時にクロスバリデーションする

## 解決責務の一元化

設定、Option、provider、パス、権限のような「早い段階で決められる値」は、境界で一度だけ解決する。同じ値を複数の層で再解決しない。

| パターン | 判定 | 理由 |
|---------|------|------|
| 入口で解決した値を下位層へ明示的に渡す | OK | 値の出所が追える |
| 解決専用のメソッド/オブジェクトに委譲する | OK | SSOTが保たれる |
| 上位と下位で同じ設定を別々に解決する | REJECT | 優先順位のズレを生む |
| ログ表示用と実行用で別々に解決する | REJECT | 表示と挙動が乖離する |
| メイン処理内で `if` を重ねて設定解決する | REJECT | オーケストレーションに詳細が漏れる |

```typescript
// REJECT - 各層がそれぞれ設定を解決
function executeTask(options) {
  const provider = options.provider ?? loadGlobalConfig().provider;
  return runAgent({
    provider,
    stepProvider: resolveProviderForStep(options.step),
  });
}

function runAgent(options) {
  const provider = options.provider ?? resolveProviderFromConfig();
  return getProvider(provider).call();
}

// OK - 境界で解決し、以降は解決済みの値だけを使う
function executeTask(options) {
  const resolved = resolveExecutionContext(options);
  return runAgent({
    resolvedProvider: resolved.provider,
    resolvedModel: resolved.model,
  });
}

function runAgent(options) {
  return getProvider(options.resolvedProvider).call();
}
```

判断基準:
1. この値は実行前に確定できるか？ → できるなら境界で解決する
2. 同じ優先順位ロジックが2箇所以上にあるか？ → 専用メソッド/オブジェクトに集約する
3. 下位層が設定ソースそのものを知っているか？ → 解決済みの値だけを渡す
4. 表示・実行・保存で別々に解決しているか？ → 同じ解決結果を共有する

## フェーズ分離

入力の収集、解釈・正規化、実行、出力・副作用は段階で分ける。ループやメイン処理の途中で未解決の入力を受け取り直して、その場で解釈しない。

| パターン | 判定 | 理由 |
|---------|------|------|
| `RawOptions -> ResolvedOptions -> ExecutionContext` の順で段階を分ける | OK | 各段階の責務が明確 |
| ループ前に入力をまとめて正規化する | OK | 各反復が同じ前提で動く |
| ループ内で毎回 `options ?? config ?? env` を解決する | REJECT | 各反復の前提が揺れる |
| 反復ごとに入力解釈と実行ロジックが混在する | REJECT | 処理の意図が読めない |
| 1件ずつ「入力→解釈→実行→出力」を繰り返すしかない場合でも、解釈処理を専用メソッドに隔離する | OK | 最低限の責務分離を保てる |

```typescript
// REJECT - ループ内で毎回入力を解釈
for (const step of steps) {
  const provider = options.provider
    ?? step.provider
    ?? projectConfig.provider
    ?? globalConfig.provider;
  const result = await executeStep(step, { provider });
  printResult(result);
}

// OK - 先に解決し、ループ内は実行だけ
const context = resolveExecutionContext(rawOptions, steps);

for (const step of context.steps) {
  const result = await executeStep(step, {
    resolvedProvider: step.resolvedProvider,
  });
  printResult(result);
}
```

判断基準:
1. ループ内の分岐は「業務判断」か「入力解釈」か？ → 入力解釈ならループ外へ出す
2. 同じ入力解釈が各反復で繰り返されているか？ → 先にまとめて正規化する
3. 実行関数が raw input を直接受け取っているか？ → `Resolved*` 型へ変換してから渡す
4. 最適化で逐次処理が必要か？ → 解釈だけでも先に関数へ抽出する

## 抽象化

### 条件分岐を追加する前に考える

- 同じ条件が他にもあるか → あればパターンで抽象化
- 今後も分岐が増えそうか → Strategy/Mapパターンを使う
- 型で分岐しているか → ポリモーフィズムで置換

```typescript
// ❌ 条件分岐を増やす
if (type === 'A') { ... }
else if (type === 'B') { ... }
else if (type === 'C') { ... }  // また増えた

// ✅ Mapで抽象化
const handlers = { A: handleA, B: handleB, C: handleC };
handlers[type]?.();
```

### 抽象化しすぎない

抽象化は重複や変更軸を減らすだけでなく、概念に名前を与えて理解しやすくするためにも使う。ただし、数件の具体処理を「設定オブジェクト + 関数オブジェクト + ループ」に変換して、業務上の違いが読みづらくなるだけなら抽象化ではない。

| 基準 | 判定 |
|------|------|
| 少数の分岐がイベント種別・状態・業務概念ごとに異なる | `when` / `switch` で明示する |
| 同じ処理を同じ引数構造で3箇所以上繰り返す | 抽象化を検討 |
| 1箇所でしか使わない設定配列・関数オブジェクト | REJECT。まず明示分岐 |
| 設定オブジェクトを読まないと副作用や削除対象が分からない | REJECT |
| Strategy が業務概念に名前を与え、複数実装の差し替え点を明確にしている | OK |
| 分岐名がドメイン概念として読める | OK |

```typescript
// ❌ 過剰抽象化 - 何が起きるかを設定配列とループの両方から読む必要がある
const operations = [
  { kind: 'create', normalize: ['owner'], remove: [] },
  { kind: 'revise', normalize: ['owner'], remove: ['legacyOwner'] },
]
for (const operation of operations) {
  applyOperation(record, operation)
}

// ✅ 分岐ごとの意味が重要なら明示する
switch (record.kind) {
  case 'create':
    normalizeOwner(record)
    break
  case 'revise':
    removeLegacyOwner(record)
    normalizeOwner(record)
    break
}
```

### 抽象度を揃える

1つの関数内では同じ粒度の処理を並べる。詳細な処理は別関数に切り出す。「何をするか」と「どうやるか」を混ぜない。

```typescript
// ❌ 抽象度が混在
function processOrder(order) {
  validateOrder(order);           // 高レベル
  const conn = pool.getConnection(); // 低レベル詳細
  conn.query('INSERT...');        // 低レベル詳細
}

// ✅ 抽象度を揃える
function processOrder(order) {
  validateOrder(order);
  saveOrder(order);  // 詳細は隠蔽
}
```

オーケストレーション関数（Step 1 → Step 2 → Step 3 と処理を並べる関数）では特に注意する。あるStepの内部に条件分岐が膨らんでいたら、そのStepを関数に抽出する。判定基準は分岐の数ではなく、**その分岐がその関数の抽象レベルに合っているか**。

```typescript
// ❌ オーケストレーション関数に詳細な分岐が露出
async function executePipeline(options) {
  const task = resolveTask(options);      // Step 1: 高レベル ✅

  // Step 2: 低レベル詳細が露出 ❌
  let execCwd = cwd;
  if (options.createWorktree) {
    const result = await confirmAndCreateWorktree(cwd, task, true);
    execCwd = result.execCwd;
    branch = result.branch;
  } else if (!options.skipGit) {
    baseBranch = getCurrentBranch(cwd);
    branch = generateBranchName(config, options.issueNumber);
    createBranch(cwd, branch);
  }

  await executeTask({ cwd: execCwd, ... }); // Step 3: 高レベル ✅
}

// ✅ 詳細を関数に抽出し、抽象度を揃える
async function executePipeline(options) {
  const task = resolveTask(options);
  const ctx = await resolveExecutionContext(options);
  await executeTask({ cwd: ctx.execCwd, ... });
}
```

### 言語・フレームワークの作法に従う

- Pythonなら Pythonic に、KotlinならKotlinらしく
- フレームワークの推奨パターンを使う
- 独自の書き方より標準的な書き方を選ぶ
- 不明なときはリサーチする。推測で実装しない

### インターフェース設計

インターフェースは利用側の都合で設計する。実装側の内部構造を露出しない。

| 原則 | 基準 |
|------|------|
| 利用者視点 | 呼び出し側が必要としないものを押し付けない |
| 構成と実行の分離 | 「何を使うか」はセットアップ時に決定し、実行APIはシンプルに保つ |
| メソッド増殖の禁止 | 同じことをする複数メソッドは構成の違いで吸収する |

```typescript
// ❌ メソッド増殖 — 構成の違いを呼び出し側に押し付けている
interface NotificationService {
  sendEmail(to, subject, body)
  sendSMS(to, message)
  sendPush(to, title, body)
  sendSlack(channel, message)
}

// ✅ 構成と実行の分離
interface NotificationService {
  setup(config: ChannelConfig): Channel
}
interface Channel {
  send(message: Message): Promise<Result>
}
```

### 抽象化の漏れ

特定実装が汎用層に現れたら抽象化が漏れている。汎用層はインターフェースだけを知り、分岐は実装側で吸収する。

```typescript
// ❌ 汎用層に特定実装のインポートと分岐
import { uploadToS3 } from '../aws/s3.js'
if (config.storage === 's3') {
  return uploadToS3(config.bucket, file, options)
}

// ✅ 汎用層はインターフェースのみ。非対応は生成時にエラー
const storage = createStorage(config)
return storage.upload(file, options)
```

## 構造

### 分割の基準

- 独自のstateを持つ → 分離
- 50行超のUI/ロジック → 分離
- 複数の責務がある → 分離

### 機能追加時の到達経路

新しい機能や画面を追加したら、実装と同じ変更セットで利用者が到達する経路も更新する。フレームワーク固有の配線方法は各ドメイン知識に従う。

| 基準 | 判定 |
|------|------|
| 新機能の実装だけ追加し、呼び出し側・導線・到達経路の更新を忘れる | REJECT |
| 利用者がどこから到達するか未定義のまま公開機能を追加する | REJECT |
| 実装追加と同じ変更セットで導線と到達経路を更新する | OK |
| 一時導線を追加した場合、その用途と除去条件を記録する | OK |

### 依存の方向

- 上位層 → 下位層（逆方向禁止）
- データ取得はルート（View/Controller）で行い、子に渡す
- 子は親のことを知らない

### 実行条件と依存条件の一致

依存やトリガーは、実際にその処理を再実行したい条件と一致させる。静的ルールや実装都合のためだけに依存を増やし、意図しない再実行を起こさない。

| 基準 | 判定 |
|------|------|
| lint や実装都合だけで依存やトリガーを増やし、再実行ループを生む | REJECT |
| 無関係な state 変化や callback 再生成で初期処理が再実行される | REJECT |
| 再実行条件が URL・フィルタ・明示的更新操作などの仕様に対応している | OK |
| 初期化と再取得のトリガーを分けて設計している | OK |

## 契約変更の整合性

型、インターフェース、API、設定スキーマ、永続化形式、イベント、ファイル形式など、他のコードや利用者が依存する契約を変更する場合は、定義側・生成側・利用側・検証側を同じ変更で整合させる。

| 基準 | 判定 |
|------|------|
| 契約定義だけを変更し、呼び出し元・生成元・読み取り側を更新していない | REJECT |
| 新しい引数・フィールド・設定値を追加したが、利用側へ値を渡す経路がない | REJECT |
| 文書化されたスキーマや設定形式に存在しないフィールド・値を使っている | REJECT |
| モック、fixture、テストデータが実際の契約と異なる形を返している | REJECT |
| 契約変更と呼び出し元・生成元・テスト更新が同じ変更で行われている | OK |

## 状態管理

- 状態は使う場所に閉じ込める
- 子は状態を直接変更しない（イベントを親に通知）
- 状態の流れは単方向
- 正規状態から計算できる派生値を、独立した状態として保持しない
- 複数フィールド間に常時同期が必要なら、状態モデルを見直す

| 基準 | 判定 |
|------|------|
| ある状態から常に計算できる値を別の状態として保持している | REJECT |
| 複数の状態間に「常に一致すべき」不変条件がある | REJECT |
| 保存・送信・差分判定が派生値に依存している | REJECT |
| 正規状態だけを保持し、派生値は利用箇所や境界で生成している | OK |

## 未完成コード

TODO/FIXME、空実装、スタブ、コメントアウトされた旧実装を、完成した実装の代わりに残さない。今必要な処理は今実装し、不要な処理は削除する。

| 基準 | 判定 |
|------|------|
| Issue番号・外部制約・除去条件のない TODO/FIXME | REJECT |
| 認可、バリデーション、永続化、エラー処理を TODO で先送りしている | REJECT |
| 空実装、`return null`、`pass`、コメントアウトされた旧実装が残っている | REJECT |
| 外部依存や既知バグにより今は実装不能で、Issue番号と除去条件が明記されている | 許容 |
| 将来拡張のためだけの TODO | REJECT |

## 機密情報の扱い

パスワード、トークン、APIキー、セッションID、認証ヘッダ、個人情報などの機密情報をコード、ログ、エラーレスポンス、テスト出力に露出させない。

| 基準 | 判定 |
|------|------|
| 機密情報をソースコードや設定ファイルにハードコードしている | REJECT |
| ログ、例外、エラーレスポンス、テストスナップショットに機密情報が含まれる | REJECT |
| リクエストやDTO全体をログ出力し、機密フィールドが混入しうる | REJECT |
| 機密フィールドを明示的に除外またはマスクしている | OK |
| デバッグログに個人情報が含まれるが本番では無効化される想定 | 警告。設定ミスで露出しないか確認 |

## エラーハンドリング

エラーは一元管理する。各所でtry-catchしない。

```typescript
// ❌ 各所でtry-catch
async function createUser(data) {
  try {
    const user = await userService.create(data)
    return user
  } catch (e) {
    console.error(e)
    throw new Error('ユーザー作成に失敗しました')
  }
}

// ✅ 上位層で一元処理
// Controller/Handler層でまとめてキャッチ
// または @ControllerAdvice / ErrorBoundary で処理
async function createUser(data) {
  return await userService.create(data)  // 例外はそのまま上に投げる
}
```

### エラー処理の配置

| 層 | 責務 |
|----|------|
| ドメイン/サービス層 | ビジネスルール違反時に例外をスロー |
| Controller/Handler層 | 例外をキャッチしてレスポンスに変換 |
| グローバルハンドラ | 共通例外（NotFound, 認証エラー等）を処理 |

## 変換処理の配置

変換メソッドはDTO側に持たせる。

```typescript
// ✅ Request/Response DTOに変換メソッド
interface CreateUserRequest {
  name: string
  email: string
}

function toUseCaseInput(req: CreateUserRequest): CreateUserInput {
  return { name: req.name, email: req.email }
}

// Controller
const input = toUseCaseInput(request)
const output = await useCase.execute(input)
return UserResponse.from(output)
```

変換の方向:
```
Request → toInput() → UseCase/Service → Output → Response.from()
```

## 共通化の判断

基本的に重複は排除する。本質的に同じロジックであり、まとめるべきと判断したら DRY にする。回数で機械的に判断しない。

### 共通化すべきもの

- 本質的に同じロジックの重複
- 同じスタイル/UIパターン
- 同じバリデーションロジック
- 同じフォーマット処理

### 共通化すべきでないもの

- ドメインが異なる重複（例: 顧客用バリデーションと管理者用バリデーションは別物）
- 表面的に似ているが変更理由が異なるコード
- 「将来使うかも」という予測に基づくもの

```typescript
// ❌ 過度な汎用化
function formatValue(value, type, options) {
  if (type === 'currency') { ... }
  else if (type === 'date') { ... }
  else if (type === 'percentage') { ... }
}

// ✅ 用途別に関数を分ける
function formatCurrency(amount: number): string { ... }
function formatDate(date: Date): string { ... }
function formatPercentage(value: number): string { ... }
```

## 同一実装の別名関数（DRY 違反）

AIは同じ処理を異なる関数名で複数定義しがちである。

| パターン | 例 | 判定 |
|---------|-----|------|
| 同一実装の別名関数 | `copyFacets()` と `placeFacetFiles()` が同じ処理 | REJECT |
| 引数シグネチャが同一で本体も同一 | 2つの関数が同じパラメータを受け取り同じ処理を行う | REJECT |

```typescript
// REJECT - 同じ実装が別名で存在
function copyFiles(src: string, dest: string): void {
  for (const f of readdirSync(src)) {
    copyFileSync(join(src, f), join(dest, f));
  }
}
function placeFiles(src: string, dest: string): void {
  for (const f of readdirSync(src)) {
    copyFileSync(join(src, f), join(dest, f));
  }
}

// OK - 1つの関数にまとめる
function copyFiles(src: string, dest: string): void {
  for (const f of readdirSync(src)) {
    copyFileSync(join(src, f), join(dest, f));
  }
}
```

検証アプローチ:
1. 新規追加された関数の本体が、既存関数と同一または酷似していないか確認
2. 同じファイル内の関数同士、および同じモジュール内の関数同士を比較
3. 重複があれば1つにまとめ、呼び出し元を統一

## Stateful Regex の危険なパターン

`/g` フラグ付き正規表現はステートフル（`lastIndex` を保持する）。モジュールスコープに定義して `test()` と `replace()` を混用すると予期しない結果になる。

| パターン | 例 | 判定 |
|---------|-----|------|
| モジュールスコープの `/g` 正規表現を `test()` で使用 | `const RE = /x/g; if (RE.test(s)) ...` | REJECT |
| `/g` 正規表現を `test()` と `replace()` で使い回し | `RE.test(s)` の後に `s.replace(RE, ...)` | REJECT |

```typescript
// REJECT - モジュールスコープの /g 正規表現を test() で使用
const PATTERN = /\{\{facet:(\w+)\}\}/g;
function hasFacetRef(text: string): boolean {
  return PATTERN.test(text);  // lastIndex が進み、次回の呼び出しで結果が変わる
}

// OK - test() には /g を付けない、または関数内で new RegExp
const PATTERN_CHECK = /\{\{facet:(\w+)\}\}/;  // /g なし
const PATTERN_REPLACE = /\{\{facet:(\w+)\}\}/g;  // replace 用は /g
function hasFacetRef(text: string): boolean {
  return PATTERN_CHECK.test(text);
}
function replaceFacetRefs(text: string): string {
  return text.replace(PATTERN_REPLACE, ...);
}
```

検証アプローチ:
1. モジュールスコープの正規表現に `/g` フラグがあるか確認
2. `/g` 付き正規表現が `test()` で使われていないか確認
3. 同一の正規表現が `test()` と `replace()` の両方で使われていないか確認

## 禁止事項

- **フォールバックは原則禁止** - `?? 'unknown'`、`|| 'default'`、`try-catch` で握りつぶすフォールバックを書かない。エラーは上位に伝播させる。どうしても必要な場合はコメントで理由を明記する
- **説明コメント** - コードで意図を表現する。What/How のコメントは書かない
- **未使用コード** - 「念のため」のコードは書かない
- **未完成コード** - Issue番号・外部制約・除去条件のない TODO/FIXME、空実装、コメントアウト旧実装を残さない
- **any型** - 型安全を破壊しない
- **オブジェクト/配列の直接変更** - スプレッド演算子で新規作成
- **console.log** - 本番コードに残さない
- **機密情報の露出** - ハードコード、ログ、エラーレスポンス、テスト出力に機密情報を含めない
- **契約文字列のハードコード散在** - ファイル名・設定キー名は定数で1箇所管理。リテラルの散在は禁止
- **各所でのtry-catch** - エラーは上位層で一元処理
- **後方互換・Legacy対応の自発的追加** - 明示的な指示がない限り不要
- **内部実装のパブリック API エクスポート** - 公開するのはドメイン操作の関数・型のみ。インフラ層の関数や内部クラスをエクスポートしない
- **リファクタリング後の旧コード残存** - 置き換えたコード・エクスポートは削除する。明示的に残すよう指示されない限り残さない
- **安全機構を迂回するワークアラウンド** - 根本修正が正しいなら追加の迂回は不要
- **プロジェクトスクリプトを迂回するツール直接実行** - `npx tool` 等の直接実行は lockfile を迂回しバージョン不一致を起こす。プロジェクトが定義したスクリプト（npm scripts, Makefile 等）を探して使う。見つからない場合のみ直接実行を検討する
- **配線忘れ** - 新しいパラメータやフィールドを追加したら、呼び出しチェーン全体を検索して確認する。呼び出し元が値を渡していないと `options.xxx ?? fallback` で常にフォールバックが使われる
- **冗長な条件分岐** - if/else で同一関数を呼び出し引数の差異のみの場合、三項演算子やスプレッド構文で統一する
- **コピペパターン** - 新しいコードを書く前に同種の既存実装を検索し、既存パターンに合わせる。独自の書き方を持ち込まない


---

# テストポリシー

全ての振る舞いの変更には対応するテストが必要であり、全てのバグ修正にはリグレッションテストが必要。

## 原則

| 原則 | 基準 |
|------|------|
| Given-When-Then | テストは3段階で構造化する |
| 1テスト1概念 | 複数の関心事を1テストに混ぜない |
| 振る舞いを検証 | 実装の詳細ではなく振る舞いをテストする |
| 独立性 | 他のテストや実行順序に依存しない |
| 再現性 | 時間やランダム性に依存せず、毎回同じ結果 |
| 非実行資産を固定しない | 実行時の振る舞いを定義しない本文や章構成を CI の失敗条件にしない |

## カバレッジ基準

| 対象 | 基準 |
|------|------|
| 新しい振る舞い | テスト必須。テストがなければ REJECT |
| バグ修正 | リグレッションテスト必須。テストがなければ REJECT |
| 振る舞いの変更 | テストの更新必須。更新がなければ REJECT |
| ビルド（型チェック） | ビルド成功必須。失敗は REJECT |
| エッジケース・境界値 | テスト推奨（Warning） |

## テスト優先度

| 優先度 | 対象 |
|--------|------|
| 高 | ビジネスロジック、状態遷移 |
| 中 | エッジケース、エラーハンドリング |
| 低 | 単純なCRUD |

**注意:** デザイン参照が指定されている場合、UIの見た目の検証は中優先度に格上げする。デザイン忠実再現ポリシーを参照。

## 非実行資産のテスト

説明文、ガイド、README、Markdown ドキュメントなど、実行時の振る舞いを定義しない非実行資産の本文・見出し・構成を固定するテストは原則禁止。
これらは表現改善や整理で頻繁に変わるため、本文差分を CI 失敗条件にすると保守コストが高くなる。

| 基準 | 判定 |
|------|------|
| 非実行資産の本文・見出し・章構成の一致検証 | REJECT |
| 表記ゆれ検出だけを目的に非実行資産全体を走査するテスト | REJECT |
| 削除・統合され得る説明ファイルの存在前提テスト | REJECT |
| 実行契約を持たない docs-only 変更にテストを追加する | REJECT |
| CLI例・設定例・生成物など、実行可能または機械処理される契約の検証 | OK |
| schema、設定、コード、生成器など実行時挙動に関わる契約検証 | OK |
| 実行契約を持たない docs-only 変更でテストを追加しない判断 | OK |

非実行資産の変更確認は、必要に応じてレビュー、Markdown lint、リンクチェック、サンプルコマンドの実行で行う。

## テスト構造: Given-When-Then

```typescript
test('ユーザーが存在しない場合、NotFoundエラーを返す', async () => {
  // Given: 存在しないユーザーID
  const nonExistentId = 'non-existent-id'

  // When: ユーザー取得を試みる
  const result = await getUser(nonExistentId)

  // Then: NotFoundエラーが返る
  expect(result.error).toBe('NOT_FOUND')
})
```

## テスト品質

| 観点 | 良い | 悪い |
|------|------|------|
| 独立性 | 他のテストに依存しない | 実行順序に依存 |
| 型安全 | コードはビルド（型チェック）が通ること |
| 再現性 | 毎回同じ結果 | 時間やランダム性に依存 |
| 明確性 | 失敗時に原因が分かる | 失敗しても原因不明 |
| 焦点 | 1テスト1概念 | 複数の関心事が混在 |

## テストデータとフィクスチャ

テストデータは、テストごとに必要最小限の事実を明示して生成する。共有フィクスチャの破壊的変更や、実契約と異なるモックはテストの信頼性を下げる。

| 基準 | 判定 |
|------|------|
| テスト間で共有する fixture を変更して使い回している | REJECT |
| モック、fixture、factory が実際の型・API契約と異なる形を返している | REJECT |
| テストごとに巨大な全項目 fixture を直書きしている | 警告。factory 化を検討 |
| factory でデフォルトを用意し、テストに関係するフィールドだけ上書きしている | OK |
| 契約変更時に fixture、mock、snapshot を同じ変更で更新している | OK |

### 命名

テスト名は期待される振る舞いを記述する。`should {期待する振る舞い} when {条件}` パターンを使う。

### 構造

- Arrange-Act-Assert パターン（Given-When-Then と同義）
- マジックナンバー・マジックストリングを避ける

## 再取得ループのリグレッション

画面の初期取得がある場合、無関係な再レンダ、loading 切替、Context callback の参照変化で API が再実行されないことをテストで担保する。

| 基準 | 判定 |
|------|------|
| 初期取得バグ修正に対し、重複 API 呼び出しの回帰テストがない | REJECT |
| 1回呼ばれたことだけを確認し、再レンダ後の安定性を見ていない | 警告 |
| rerender や state 更新後も呼び出し回数が増えないことを検証している | OK |

## 到達経路のリグレッション

利用者向け機能や画面を追加・変更した場合、利用者がその機能へ到達できることをテストまたは同等の検証で担保する。

| 基準 | 判定 |
|------|------|
| 新規の画面・機能を追加したのに、到達経路や起動条件の検証がない | REJECT |
| 画面ファイル単体の描画だけを見て、入口からの到達確認をしていない | 警告 |
| route、メニュー、ボタン、リンク、外部呼び出しなど実際の入口から対象機能へ到達できることを確認している | OK |

## UIライブラリ統合のリグレッション

DataGrid、日付ピッカー、仮想リスト、チャートなど、外部 UI ライブラリの主要コンポーネントを導入・変更した場合は、実コンポーネントをマウントするテストでクラッシュしないことを担保する。

| 基準 | 判定 |
|------|------|
| 外部 UI ライブラリの主要コンポーネントを追加・変更したのに、実マウントの回帰テストがない | REJECT |
| ライブラリの props 整合性を、浅いモックや存在確認だけで済ませている | 警告 |
| route から対象画面を描画し、主要 UI が例外なくマウントされることを確認している | OK |
| 主要 UI コンポーネント単体でも、代表的な props で実 render している | OK |

## テスト戦略

- ロジックにはユニットテスト、境界にはインテグレーションテストを優先
- ユニットテストでカバーできるものにE2Eテストを使いすぎない
- 新しいロジックにE2Eテストしかない場合、ユニットテストの追加を提案する

### インテグレーションテストが必須な場面

ユニットテストだけでは検証できないデータフローの結合を検証する。

| 条件 | 判定 |
|------|------|
| 3つ以上のモジュールを横断するデータフロー | インテグレーションテスト必須 |
| 新しいステータス／状態が既存のワークフローに合流する | 遷移フロー全体のインテグレーションテスト必須 |
| 新しいオプションが呼び出しチェーンを通じて末端まで伝搬する | チェーン全体の結合テスト必須 |
| 各モジュールのユニットテストが全てパスしている | ユニットテストのみで十分（上記に該当しない場合） |

## ユニットテスト基準

| 基準 | 判定 |
|------|------|
| テスト対象の内部実装をモックする（振る舞いではなく実装を検証） | REJECT |
| テスト間でフィクスチャを共有して変更する | REJECT。テスト独立性の喪失 |
| モックの戻り値が実際の型と乖離している | 警告。型安全なモックを使う |
| 正常系のみテストして境界値がない | 警告 |

## E2Eテスト基準

E2E は、利用者が実際に入る起点から設計する。ドキュメント上の想定だけでなく、route、command、endpoint、navigation、button、external callback などコード上の入口を基準にする。

| 基準 | 判定 |
|------|------|
| 起点を確認せず、想像上の操作フローだけで E2E を書いている | REJECT |
| 外部API呼び出しをモックせず本番APIを叩く | REJECT。テストの再現性が失われる |
| テスト対象のコア処理をモックする | REJECT。E2Eの意味がなくなる |
| 固定 sleep でタイミングを合わせる | REJECT。状態ベースの待機を使う |
| テスト間で共有状態を持つ | 警告。テストの独立性が損なわれる |
| 正常フローだけテストして異常フローがない | 警告 |
| ユニットテストでカバーできるロジック検証をE2Eで書く | 警告 |

## テスト環境の分離

テストインフラの設定はテストシナリオのパラメータに連動させる。ハードコードされた前提は別シナリオで壊れる。

| 原則 | 基準 |
|------|------|
| パラメータ連動 | テストの入力パラメータに応じてフィクスチャ・設定を生成する |
| 暗黙の前提排除 | 特定の環境（ユーザーの個人設定等）に依存しない |
| 整合性 | テスト設定内の関連する値は互いに矛盾しない |
| プロセス終了保証 | テストランナーにタイムアウトと強制終了を設定し、プロセスリークを防ぐ |

```typescript
// ❌ ハードコードされた前提 — 別のバックエンドでテストすると不整合になる
writeConfig({ backend: 'postgres', connectionPool: 10 })

// ✅ パラメータに連動
const backend = process.env.TEST_BACKEND ?? 'postgres'
writeConfig({ backend, connectionPool: backend === 'sqlite' ? 1 : 10 })
```
