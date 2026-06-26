# タスク計画

## 元の要求
`.takt/runs/20260626-061725-implement-using-only-the-files-w5b4nz/context/task` 内のファイルのみを用いて実装する。主要仕様は同ディレクトリの `order.md`。

要約: playground サイト（ナナオのあそびば）に、テーマ「自由（= 自由律）」の新規ページ「自由律俳句ジェネレーター」を追加する。コアロジック（語彙の組み合わせ・韻律スコア・乱数）を **Rust** で実装し **WebAssembly** 化、フロントエンド完結で動かす。既存の Rust→WASM ページ `JiyuGacha.tsx` を手本に、`@/assets/*.wasm?url` で読み込む。Rust ソースとビルドスクリプトを必ずコミットし再生成可能にする。

## 分析結果

### 目的
`/haiku` ルートで動作する自由律俳句ジェネレーターを追加する。5-7-5 の定型に縛られず語彙の自由な組み合わせで俳句を生成する。コア（語彙選択・句構成・韻律/字数スコア・決定的PRNG）を Rust で `wasm32-unknown-unknown`／`extern "C"` 整数のみで実装し、React ページから空 import で `instantiate` する。再生成・コピー・お気に入り/履歴（localStorage）を備え、既存ページ（`/joya`・`/chat`・`/gacha`）に影響を与えない。Rust ソース＋ビルドスクリプトをコミットし再ビルド可能にする。

### 分解した要件
| # | 要件 | 種別 | 備考 |
|---|------|------|------|
| 1 | Rust ソースを `wasm/free-haiku/` に配置する | 明示 | |
| 2 | Rust ソースとビルドスクリプトを必ずコミットする | 明示 | JIYU GACHA がソースを残さず再ビルド不能になった反省 |
| 3 | `crate-type = ["cdylib", "rlib"]` で構成する | 明示 | cdylib=wasm / rlib=cargo test 用 |
| 4 | `wasm32-unknown-unknown` 向けにビルドできる（wasm-bindgen 不要、`extern "C"` 整数のみ） | 明示 | |
| 5 | 語彙バンクからの選択を純粋関数で実装 | 明示 | コアロジック |
| 6 | 自由律の句構成を純粋関数で実装 | 明示 | 5-7-5 非定型 |
| 7 | 韻律/字数のスコアリングを純粋関数で実装 | 明示 | コアロジック |
| 8 | 決定的（シード可能）PRNG を実装 | 明示 | |
| 9 | `cargo test` で PRNG の決定性を検証 | 明示 | |
| 10 | `cargo test` で PRNG の範囲を検証 | 明示 | |
| 11 | `cargo test` で句構成の妥当性を検証 | 明示 | |
| 12 | `cargo test` で分布を検証 | 明示 | |
| 13 | `FreeHaiku.tsx` を追加する | 明示 | |
| 14 | `@/assets/*.wasm?url` で WASM を読み込む（fetch→arrayBuffer→instantiate、`instantiateStreaming` 不可） | 明示 | gacha 踏襲 |
| 15 | `App.tsx` にルート `/haiku` を登録 | 明示 | |
| 16 | `App.tsx` の `PROJECTS` 作品一覧に登録 | 明示 | |
| 17 | CSS をページ単位にスコープ（`.fh-root` 配下） | 明示 | 他ページ漏洩防止 |
| 18 | 再生成機能 | 明示 | |
| 19 | コピー機能 | 明示 | |
| 20 | お気に入り機能（localStorage） | 明示 | |
| 21 | 履歴機能（localStorage） | 明示 | |
| 22 | 既存ページ（`/joya`・`/chat`・`/gacha`）の表示・ルーティングに影響を与えない | 明示 | |
| 23 | `.gitignore` に Rust 成果物（`target`）を追加する | 暗黙（#2・再生成可能性から導出） | ビルド成果物の誤コミット防止 |
| 24 | `package.json` に wasm ビルドスクリプト（`build:wasm`）を追加する | 暗黙（#2・既存スクリプト流儀踏襲から導出） | |

### 参照資料の調査結果
指示書「参考情報」で指定された手本を実コードで確認した。

- `src/components/pages/JiyuGacha.tsx`: Rust→WASM ページの手本。`fetch(url)`→`arrayBuffer()`→`WebAssembly.instantiate(buf, {})`（空 import）でロード（144-168行）。`extern "C"` 整数 API（`seed/next_u32/pick/roll_rarity/parts_count_for`）を呼ぶ（9-15行）。**語彙の表示文字列は TS 側 `CATEGORIES` が保持**し、Rust はインデックスのみ返す（27-78行）。1回生成の流れは `draw()`（118-131行）= `seed→ロール→pick ループ`。履歴/お気に入りは localStorage（`readList/writeList/HISTORY_KEY/FAV_KEY/HISTORY_LIMIT`、87-103・183-216行）。
- `src/assets/gacha_core.wasm`: 19KB のコンパイル済み wasm。**ソースが残っておらず**、これが今回の反省点の実物。
- `src/components/pages/JiyuGacha.css`: 全セレクタ・CSS変数を `.jg-root` 配下にスコープ（1-26行）。
- `src/App.tsx`: wouter の `<Switch>/<Route>`。`PROJECTS` 配列（12-58行）と `<Route>`（109-128行）に登録。既存は joya/chat/gacha の3エントリ。
- `vite.config.ts`/`tsconfig.app.json`: `@`→`src` エイリアス、`types:["vite/client"]` が `*.wasm?url` 型を提供（`JiyuGacha.tsx` がコンパイル成立している事実で裏取り、追加 d.ts 不要）。

**参照資料の意図の判断:** `JiyuGacha.tsx` は「採用すべき設計アプローチ」（指示書に「同様に」「流儀を踏襲」と明記）。スコープを狭めず、ロード方式・データ分割（文字列=TS／インデックス=Rust）・localStorage・CSSスコープの全パターンを踏襲する。

**現在の実装との主要差異:** 既存は wasm ソース未コミット・ビルドスクリプトなし。今回は Rust ソース一式＋`build.sh`＋`build:wasm` を新設し再生成可能にする。

### 環境事実（裏取り済み）
- Homebrew 版 `rustc`（`/usr/local/bin`、PATH 先頭）は wasm std を持たない（`/usr/local/lib/rustlib` に `wasm32` なし）。rustup 既定 `1.80.1`（`/Users/d_sato/.rustup/toolchains/1.80.1-x86_64-apple-darwin/bin`）に `wasm32-unknown-unknown` ターゲットがインストール済み。→ **ビルドスクリプトで rustup toolchain の bin を PATH 前置きする**必要がある（指示書の指摘どおり）。
- `.gitignore` に `target` エントリなし。
- JS テスト基盤なし。今回のテストは `cargo test` のみ。
- `src/index.css` に `body{display:flex;place-items:center}` のグローバル指定あり → 新ページも `.fh-root` で `min-height:100vh` のルートを張り自前レイアウトに閉じる（gacha と同様）。

### スコープ
新規: `wasm/free-haiku/`（`Cargo.toml`・`build.sh`・`src/lib.rs`・`src/rng.rs`・`src/compose.rs`・`src/score.rs`）、`src/assets/free_haiku.wasm`、`src/components/pages/FreeHaiku.tsx`、`src/components/pages/FreeHaiku.css`。
変更: `src/App.tsx`（import/PROJECTS/Route の3箇所）、`package.json`（`build:wasm` 追加）、`.gitignore`（`target` 追加）。
不変（維持）: 既存 Route/PROJECTS の joya・chat・gacha 行（`App.tsx:111-113`・26-32行）。`/haiku` は新規パスで衝突なし、CSS は `.fh-root` スコープで漏洩なし。

### 検討したアプローチ
| アプローチ | 採否 | 理由 |
|-----------|------|------|
| 語彙文字列を Rust 側に保持し wasm から返す | 不採用 | wasm-bindgen 不要・`extern "C"` 整数のみの制約に反する。文字列受け渡しで空 import インスタンス化が壊れる |
| 語彙文字列は TS 保持・Rust はインデックス/構造/スコアのみ（gacha 踏襲） | 採用 | 指示書の制約に適合。gacha が同方式で動作している事実で裏取り済み |
| スコアの mora/字数データを Rust に複製保持し内部完結 | 不採用 | TS の語彙と二重管理になり同期リスク。意図の重複 |
| 各行確定後に字数を TS で算出し Rust スコア関数へ投入（蓄積API） | 採用 | データ重複なし。スコアアルゴリズムは Rust 純粋関数で `cargo test` 可能 |
| `WebAssembly.instantiateStreaming` でロード | 不採用 | S3/CloudFront の content-type 非依存要件に反する（指示書明記）。fetch→arrayBuffer→instantiate を採用 |
| Rust を単一 `lib.rs` に集約 | 不採用 | 純粋コアと FFI を分離しテスト容易性を上げるため `rng/compose/score/lib` に分割 |

### 実装アプローチ
1. Rust クレート `wasm/free-haiku/` を作成。`Cargo.toml` で `crate-type=["cdylib","rlib"]`、`[profile.release]` に `panic="abort"`/`opt-level="s"`/`lto=true`/`strip=true`。**ヒープ割当・`Vec`・`format!`・`std::collections`・I/O を使わず**固定長 `static`/配列のみ（空 import を維持し `instantiate(buf,{})` を成立させる）。
2. 純粋コアを `rng.rs`（決定的 PRNG）・`compose.rs`（自由律の句構成）・`score.rs`（韻律/字数スコア `prosody_score(&[u32])->i32`）に実装。`lib.rs` が `#[no_mangle] pub extern "C"` の FFI 境界で薄くラップ。
3. WASM ABI（確定仕様 — write_tests と draft は本シグネチャに従う、すべて整数のみ・PRNG ストリーム1本・呼出順序固定）:
   - PRNG: `seed(s0:u32,s1:u32)` / `next_u32()->u32` / `pick(n:u32)->u32`（`n==0`→0、他は`[0,n)`）
   - 句構成: `generate()->u32`（行数 L、自由律のため可変。内部で各行テンプレートをロール保持）/ `line_len(i:u32)->u32` / `seg_bank(i:u32,j:u32)->u32`（`[0,BANK_COUNT)`）
   - スコア: `score_reset()` / `score_push_line(char_count:u32)` / `score_value()->i32`（5-7-5 一致を減点、行長変化と心地よい総字数を加点 → 自由律を体現）
   - 呼出順序の契約: `seed`→`generate`→各セグメントで TS が `pick(BANKS[bank].words.length)`→各行確定後 `score_push_line([...lineText].length)`→`score_value`
4. `build.sh`: `export PATH="$(dirname "$(rustup which cargo)"):$PATH"` で Homebrew rustc を回避 → `cargo build --release --target wasm32-unknown-unknown --manifest-path wasm/free-haiku/Cargo.toml` → 出力 `target/wasm32-unknown-unknown/release/free_haiku.wasm` を `src/assets/free_haiku.wasm` にコピー。`set -euo pipefail`・`$0` 基準の絶対パスで `cd` 非依存。
5. `package.json` に `"build:wasm":"bash wasm/free-haiku/build.sh"` を追加。`npm run build`(= `vite build`) はコミット済み `src/assets/free_haiku.wasm` を `?url` でバンドルするだけで Rust ツールチェインに非依存（gacha と同運用）。
6. `FreeHaiku.tsx` を作成。語彙バンクは TS 保持（gacha の `CATEGORIES` と同型、字数フィールドは持たず行確定後に `[...lineText].length` で算出）。WASM ロードは `JiyuGacha.tsx:144-168` を踏襲、`WasmExports` 型は本 ABI に合わせ定義。再生成（`pull` 相当）・コピー（`copyText` 相当）・お気に入り/履歴（`readList/writeList`、キーは `free_haiku_*`）を実装。
7. `FreeHaiku.css` を全セレクタ・CSS変数とも `.fh-root` 配下にスコープ。
8. `App.tsx`: `import FreeHaiku` 追加、`PROJECTS` に `/haiku` エントリを `coming-soon` の前に追加、`<Route path="/haiku" component={FreeHaiku} />` 追加。既存3エントリは不変。
9. `.gitignore` に `target` を追加。
10. write_tests ステップで `cargo test`（純粋コアを直接呼ぶ）: 決定性（同一シードで `next_u32` 列一致・異シードで相違）、範囲（`pick(n)∈[0,n)`・行数/`line_len`/`seg_bank` が有効範囲）、句構成の妥当性（全バンク ID が `[0,BANK_COUNT)`）、分布（多数シードで `pick` ほぼ一様・行数レンジ網羅）、スコア（5-7-5 一致入力より自由律的入力で高い等）。

### 到達経路・起動条件
| 項目 | 内容 |
|------|------|
| 利用者が到達する入口 | トップ `/`（`TopPage`）の `PROJECTS` カード一覧に「自由律俳句ジェネレーター」カードが表示され `Link href="/haiku"` で遷移。直接 URL `/haiku` でも `<Route>` がマッチ。ページ内「← トップに戻る」は `Link href="/"` |
| 更新が必要な呼び出し元・配線 | `src/App.tsx`（import 1行・`PROJECTS` 1エントリ・`<Route>` 1行の計3箇所） |
| 起動条件 | WASM ロード成功で生成ボタン活性（gacha の `ready` ステート踏襲）、失敗時はエラー表示。認証・権限なし |
| 未対応項目 | なし |

## 実装ガイドライン
- **参照すべき既存実装（ファイル:行）:** WASM ロード=`JiyuGacha.tsx:144-168`、`WasmExports` 型=`9-15`、語彙バンク=`27-78`、生成1回の流れ=`118-131`、localStorage=`87-103・183-216`、再生成/コピー=`170-192・209-211`、CSSスコープ=`JiyuGacha.css:1-26`、ルート/一覧登録=`App.tsx:6・26-32・113`。新ページの語彙バンク・キー・CSSルートは `free_haiku_*`/`.fh-root` に置換。
- **`/haiku` エントリは `coming-soon`（App.tsx:52-57）の前**に追加し、既存3エントリ（joya/chat/gacha）は変更しない。
- **アンチパターン回避:**
  - `WebAssembly.instantiateStreaming` を使わない（content-type 非依存のため fetch→arrayBuffer→instantiate 必須）。
  - Rust でヒープ割当・`Vec`・`format!`・`std::collections` を使わない（空 import を壊し `instantiate(buf,{})` が失敗）。固定長配列・整数演算のみ。
  - `#[no_mangle]` を付け忘れない（エクスポート名が壊れる）。
  - CSS を `.fh-root` の外に書かない（CSS変数も `.fh-root` 内に定義）。
  - TypeScript は `strict`＋`noUnusedLocals`＋`noUnusedParameters`。未使用変数/引数を残さない。
  - 既存 Route/PROJECTS の joya・chat・gacha 行を改変しない。
  - PRNG 呼出順序（`seed`→`generate`→`pick`…→`score_push_line`）を TS と `cargo test` で一致させる（順序が崩れると決定性が壊れる）。
- **Cargo.toml 要点:** edition 2021、`[lib] crate-type=["cdylib","rlib"]`、`[profile.release]` に `panic="abort"`/`opt-level="s"`/`lto=true`/`strip=true`。
- **build.sh 要点:** `set -euo pipefail`、`$0` 基準の絶対パス、rustup toolchain の bin を PATH 前置き、ビルド後に `src/assets/free_haiku.wasm` へコピー。
- **ファイル分割:** Rust は `rng.rs`/`compose.rs`/`score.rs`/`lib.rs`（各 200 行未満見込み、純粋コアと FFI を分離）。

## スコープ外
| 項目 | 除外理由 |
|------|---------|
| 既存ページ（joya/chat/gacha/未使用コメントアウト群）の改修 | 指示書は新規ページ追加のみ。既存非干渉が明示要件 |
| JS テストフレームワークの導入 | 指示書のテストは `cargo test` のみ。既存に JS テスト基盤なし |
| `deploy`（S3/CloudFront）実行 | 受け入れ基準は `npm run build` と `cargo test`。デプロイは運用範囲外 |
| 字数データの Rust 複製保持 | TS 字数算出＋Rust スコア関数で代替。二重管理回避 |

## 確認事項
なし（コード調査で全不明点を解決済み）。