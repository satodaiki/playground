調査完了。実装計画を以下にまとめます。

---

# 実装計画: 自由律俳句ジェネレーター（`/haiku`）

## 1. 参照資料の確認結果

タスク指示書「参考情報」で指定された手本を実際に確認した:

| 参照資料 | 確認結果 |
|---|---|
| `src/components/pages/JiyuGacha.tsx` | 存在。Rust→WASM ページの手本。`fetch→arrayBuffer→WebAssembly.instantiate(buf, {})` でロード、`extern "C"` 整数 API（`seed/next_u32/pick/roll_rarity/parts_count_for`）を呼ぶ。語彙（`CATEGORIES`）は **TS 側**が保持し、Rust はインデックスのみ返す。履歴/お気に入りは localStorage（`readList/writeList`）。`@/assets/gacha_core.wasm?url` で読込 |
| `src/assets/gacha_core.wasm` | 存在（19KB、コンパイル済み・**ソースなし** = 今回の反省点の実物） |
| `src/App.tsx` | wouter の `<Switch>/<Route>`。`PROJECTS` 配列＋`<Route path="/gacha">` の2箇所に登録する形 |
| `src/components/pages/JiyuGacha.css` | 全セレクタを `.jg-root` 配下にスコープ。CSS変数もルート内で定義 |
| `vite.config.ts` / `tsconfig.app.json` | `@`→`src` エイリアス。`types: ["vite/client"]` が `*.wasm?url` の型を提供（追加 d.ts 不要、`JiyuGacha.tsx` がコンパイルできている事実で裏取り済み） |

**参照資料の意図の判断:** `JiyuGacha.tsx` は「採用すべき設計アプローチ」として指定されている（指示書本文に「同様に」「流儀を踏襲」と明記）。スコープを狭めず、ロード方式・データ分割・localStorage・CSSスコープの全パターンを踏襲する。

## 2. 環境事実（裏取り済み）

- Rust ツールチェイン: Homebrew 版 `rustc` が `/usr/local/bin`（PATH 先頭、wasm std を**持たない** — `/usr/local/lib/rustlib` に `wasm32` なし）。rustup 管理の既定 `1.80.1` が `/Users/d_sato/.rustup/toolchains/1.80.1-x86_64-apple-darwin/bin` にあり、`wasm32-unknown-unknown` ターゲットがインストール済み（`rustup target list --installed` で確認）。→ **ビルドスクリプトは rustup toolchain の bin を PATH 前置きする必要がある**（指示書の指摘どおり）。
- `.gitignore` に **`target` エントリなし** → Rust ビルド成果物が誤コミットされる。要追加。
- JS テスト基盤なし。今回のテストは **`cargo test`** のみ（指示書どおり）。
- `body { display:flex; place-items:center }`（`src/index.css`、グローバル）がある → 新ページも `.jg-root` 同様に `min-height:100vh` でルートを張り、自前レイアウトに閉じる。

## 3. 要件ごとの変更要否判定

| 要件 | 判定 | 内容 |
|---|---|---|
| Rust ソース配置（`wasm/free-haiku/`）＋ソース・スクリプトをコミット | **変更要（新規）** | クレート一式 + `build.sh` を新規作成 |
| `crate-type=["cdylib","rlib"]` / wasm32向け / wasm-bindgen不要 / extern "C" 整数のみ | **変更要（新規）** | `Cargo.toml` で構成 |
| コアロジックを純粋関数で実装（語彙選択・自由律句構成・韻律/字数スコア）＋決定的PRNG | **変更要（新規）** | `lib.rs`（+分割）で実装 |
| `cargo test` で単体テスト（決定性・範囲・句構成・分布） | **変更要（write_testsステップ）** | クレート内テスト |
| `FreeHaiku.tsx` 追加・gachaと同様の wasm 読込 | **変更要（新規）** | ページコンポーネント |
| `App.tsx` ルート `/haiku` ＋ `PROJECTS` 登録 | **変更要** | `App.tsx` 2箇所 |
| CSS をページ単位スコープ（`.fh-root` 配下） | **変更要（新規）** | `FreeHaiku.css` |
| 再生成・コピー・お気に入り/履歴（localStorage） | **変更要（新規）** | `FreeHaiku.tsx` 内（gacha の `readList/writeList` パターン踏襲） |
| 既存ページ（`/joya`・`/chat`・`/gacha`）非干渉 | **変更不要（維持）** | `App.tsx:111-113` の既存 Route は触らない。新ページCSSは `.fh-root` スコープで漏れ防止。`/haiku` は新規パスで衝突なし |

暗黙要求（明示要求から直接導出）:
- **`.gitignore` に `target` 追加** ← 「ソースとビルドスクリプトを**必ず**コミット」かつ「再ビルド可能」から、ビルド成果物（`target/`）の誤コミット防止が直接導かれる。
- **`package.json` に wasm ビルドスクリプト追加** ← 「ビルドスクリプトを必ずコミット」＋「`build`/`__build`/`deploy` の流儀を踏襲」から導出。

## 4. 設計

### 4.1 ファイル構成（新規・変更）

```
wasm/free-haiku/
├── Cargo.toml          # 新規: crate-type=["cdylib","rlib"], profile.release
├── build.sh            # 新規: rustup toolchain bin を前置き→cargo build→src/assets へコピー
└── src/
    ├── lib.rs          # 新規: FFI境界(#[no_mangle] extern "C") + モジュール束ね
    ├── rng.rs          # 新規: 決定的PRNG（純粋）
    ├── compose.rs      # 新規: 自由律の句構成（純粋）
    └── score.rs        # 新規: 韻律/字数スコア（純粋）
src/assets/free_haiku.wasm   # 新規: build.sh が生成・コミット（vite がバンドル）
src/components/pages/
├── FreeHaiku.tsx       # 新規
└── FreeHaiku.css       # 新規: 全セレクタ .fh-root 配下
src/App.tsx             # 変更: import / PROJECTS / Route 追加
package.json            # 変更: build:wasm スクリプト追加
.gitignore              # 変更: target 追加
```

Rust を `rng/compose/score/lib` に分割する理由: 1モジュール1責務、純粋コアを FFI から分離（テストは純粋コアを直接叩き `static mut` 依存を避ける）。各ファイル 200行未満を見込む。

### 4.2 データ分割の方針（gacha 踏襲・裏取り済み）

`extern "C"` 整数のみの制約上、**表示文字列は TS 側が保持**（`JiyuGacha.tsx:27-78` の `CATEGORIES` と同型）、**Rust はインデックス・構造・スコアのみ**を扱う。これにより wasm を文字列受け渡しなしで `instantiate(buf, {})`（空 import）でインスタンス化可能にする（gacha が同方式で動作している事実で裏取り）。

### 4.3 WASM ABI（確定仕様 — write_tests と draft は本シグネチャに従うこと）

すべて `#[no_mangle] pub extern "C"`、整数のみ。PRNG ストリームは1本、呼出順序固定で決定性を担保する。

**PRNG**
- `seed(s0: u32, s1: u32)` — シード設定
- `next_u32() -> u32`
- `pick(n: u32) -> u32` — `n==0` なら 0、それ以外 `[0, n)`

**句構成（自由律: 行数・各行のセグメント構成を PRNG で決定し static に保持）**
- `generate() -> u32` — 行数 L を返す（自由律のため可変、例: 2..=4）。内部で各行のテンプレートをロールし保存
- `line_len(i: u32) -> u32` — 行 i のセグメント数
- `seg_bank(i: u32, j: u32) -> u32` — 行 i セグメント j が使う語彙バンク ID（`[0, BANK_COUNT)`）

呼出順序（決定性の契約）: `seed` → `generate` → 各セグメントで TS が `pick(BANKS[bank].words.length)`。

**スコア（韻律/字数・自由律らしさを評価する純粋ロジック）**
- `score_reset()`
- `score_push_line(char_count: u32)` — 各行の確定後、その行の文字数（`[...lineText].length`）を投入
- `score_value() -> i32` — 蓄積から韻律スコアを算出（例: 5-7-5 への一致を減点、行長の変化と心地よい総字数を加点 → 自由律を体現）

内部実装: `score::prosody_score(&[u32]) -> i32` を純粋関数で実装し、FFI 層が薄くラ���プ。`cargo test` は純粋関数を直接検証する。

### 4.4 Cargo.toml 要点

```toml
[lib]
crate-type = ["cdylib", "rlib"]

[profile.release]
panic = "abort"     # import を増やさず wasm を空importで instantiate 可能に保つ
opt-level = "s"
lto = true
strip = true
```

edition 2021。**ヒープ割当・std::collections・I/O を使わない**（固定長 `static`/配列のみ）こと。これにより allocator/env import が増えず、`instantiate(buf, {})` が成立する（gacha と同条件）。

### 4.5 build.sh 要点

```sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$(dirname "$(rustup which cargo)"):$PATH"   # Homebrew rustc を回避し wasm std を解決
cargo build --release --target wasm32-unknown-unknown --manifest-path "$DIR/Cargo.toml"
cp "$DIR/target/wasm32-unknown-unknown/release/free_haiku.wasm" "$DIR/../../src/assets/free_haiku.wasm"
```

`package.json` に `"build:wasm": "bash wasm/free-haiku/build.sh"` を追加（既存スクリプト流儀に合わせ命名）。**`npm run build`（= `vite build`）はコミット済み `src/assets/free_haiku.wasm` をバンドルするだけ**で Rust ツールチェインに依存しない（gacha と同じ運用 = 受け入れ基準「dist/assets にバンドル」「再生成可能」を両立）。

## 5. Coder 向け実装ガイドライン

**参照すべき既存実装パターン（ファイル:行）:**
- WASM ロード: `src/components/pages/JiyuGacha.tsx:144-168`（`fetch`→`arrayBuffer`→`instantiate(buf, {})`、`instantiateStreaming` 不可）。`WasmExports` 型は `JiyuGacha.tsx:9-15` を範にして本計画 4.3 のシグネチャで定義。
- 語彙バンク（TS保持）: `JiyuGacha.tsx:27-78`（`CATEGORIES`）と同型で俳句用バンクを定義。各語に**字数フィールドは持たせず**、行確定後に `[...lineText].length` で算出して `score_push_line` に渡す。
- 生成1回の流れ: `JiyuGacha.tsx:118-131`（`draw`）が手本。`seed→generate→ループで pick` の順序を厳守。
- localStorage 履歴/お気に入り: `JiyuGacha.tsx:87-103, 183-216`（`readList/writeList/HISTORY_KEY/FAV_KEY/HISTORY_LIMIT`）。キーは `free_haiku_*` に変える。
- 再生成・コピー: `pull`(170-192)・`copyText`(209-211) を踏襲。
- CSS スコープ: `JiyuGacha.css:1-26`（`.jg-root` 配下に全セレクタ＋CSS変数）。本ページは **`.fh-root`** に置換して同様にスコープ。
- ルート/一覧登録: `App.tsx:6`(import), `App.tsx:26-32`(PROJECTS の gacha エントリ), `App.tsx:113`(Route)。**`/haiku` を `coming-soon`(52-57) の前**に追加し、既存3エントリ（joya/chat/gacha）は変更しない。

**変更の影響範囲（配線が必要な全箇所）:**
1. `App.tsx`: `import FreeHaiku` 追加 / `PROJECTS` に `{id:"haiku", title, description, path:"/haiku"}` 追加 / `<Route path="/haiku" component={FreeHaiku} />` 追加（計3箇所）。
2. `package.json`: `scripts` に `build:wasm` 追加。
3. `.gitignore`: `target` 追加（Rust 成果物の誤コミット防止）。
4. 新規 wasm 資産 `src/assets/free_haiku.wasm` を `build.sh` で生成してコミット。

**利用者の到達経路（入口・起動条件）:**
- 入口: トップページ `/`（`TopPage`）の `PROJECTS` カード一覧に「自由律俳句ジェネレーター」カードが現れ、`Link href="/haiku"` で遷移。
- 直接 URL `/haiku` でも `<Route>` がマッチ。ページ内「← トップに戻る」は `Link href="/"`（gacha の `jg-back` 相当 `fh-back`）。
- 起動条件: WASM ロード成功で生成ボタン活性（gacha の `ready` ステート踏襲）、失敗時はエラー表示（`JiyuGacha.tsx:249-253`）。

**特に注意すべきアンチパターン:**
- `WebAssembly.instantiateStreaming` を使わない（S3/CloudFront の content-type 非依存のため fetch→arrayBuffer→instantiate 必須）。
- Rust 側でヒープ割当・`Vec`・`format!`・`std::collections` を使わない（空 import を壊し `instantiate(buf,{})` が失敗する）。固定長配列・整数演算のみ。
- `#[no_mangle]` を付け忘れない（エクスポート名が壊れる）。
- CSS を `.fh-root` の外に書かない（他ページ漏洩）。CSS変数も `.fh-root` 内に定義。
- TypeScript は `strict`＋`noUnusedLocals`＋`noUnusedParameters`（`tsconfig.app.json`）。未使用変数/引数を残さない。
- 既存 Route/PROJECTS の joya・chat・gacha 行を改変しない。
- PRNG 呼出順序（seed→generate→pick…）を TS と cargo test で一致させる（順序が崩れると決定性が壊れる）。

**write_tests ステップへの引き継ぎ（`cargo test` 対象）:**
- 決定性: 同一シードで `next_u32` 列が一致、異シードで相違。
- 範囲: `pick(n) ∈ [0,n)`、`generate()` の行数が規定レンジ内、`line_len`/`seg_bank` が有効範囲。
- 句構成の妥当性: 全行・全セグメントのバンク ID が `[0,BANK_COUNT)`。
- 分布: 多数シードで `pick` がほぼ一様、行数が取りうる範囲を網羅。
- スコア: `prosody_score` が 5-7-5 一致入力より自由律的入力で高い等、既知入力に対する性質。
- テストは純粋コア（`rng`/`compose`/`score`）を直接呼ぶ（`static mut` を介さない）。

## 6. 受け入れ基準との対応

- `npm run build` 成功・wasm が `dist/assets` に出力 → コミット済み `src/assets/free_haiku.wasm` を vite が `?url` でバンドル（gacha 実績と同方式）。
- `cargo test` パス → 純粋コアの単体テスト（write_tests で作成）。
- `/haiku` で生成・再生成・自由律体現 → `FreeHaiku.tsx` + 韻律スコアが 5-7-5 を回避。
- 既存ページ非破壊 → App.tsx の既存行不変、CSS は `.fh-root` スコープ。
- Rust ソース＋ビルドスクリプトをコミット・再生成可能 → `wasm/free-haiku/` 一式 + `build.sh` + `build:wasm`、`target` は gitignore。

## 7. 確認事項

なし（コード調査で全不明点を解決済み）。