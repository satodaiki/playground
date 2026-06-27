# takt order.md テンプレート（playground / Rust→WASM ページ）

playground（ナナオのあそびば）に Rust→WASM の作品ページを追加する takt タスクを作る際の
雛形。`.takt/tasks/<slug>/order.md` にこの内容をコピーし、`{{...}}` を埋めて使う。

ここに書いた規約は `.takt/facets/policies/coding.md`・`testing.md` にも反映済みだが、
order.md は確実に agent に渡る経路なので、要件として明記しておく（二重の担保）。

---

以下をコピーして order.md にする ↓↓↓

```markdown
# タスク仕様

## 目的

playground サイト（ナナオのあそびば）に、{{テーマ・概要を1〜2文}}を新規ページとして
追加する。コアロジック（{{乱数・状態・判定など}}）を **Rust** で実装して **WebAssembly**
化し、描画・UI はフロントエンド完結で動かす。

## ページ内容

- {{ユーザー体験・操作・画面の説明を箇条書き}}
- {{永続したいもの（localStorage）があれば記す}}

## 要件

### Rust / WASM コア
- [ ] Rust ソースを `wasm/{{crate-name}}/` に置き、ソースとビルドスクリプトを必ずコミットする（再生成可能にする）
- [ ] `crate-type = ["cdylib", "rlib"]`、`wasm32-unknown-unknown` 向けにビルド（wasm-bindgen 不要）
- [ ] WASM は外部 import なしで `WebAssembly.instantiate(buf, {})` できる構成（ヒープ/Vec/format!/std::collections を避け、固定長配列＋数値演算、`panic = "abort"`）
- [ ] **グローバル状態は `thread_local! + RefCell` で保持し、`unsafe` を使わない**（`static mut`+`addr_of!` 禁止。既存 `wasm/jiyu-gacha`・`wasm/free-haiku`・`wasm/leap-to-freedom` と同方式）
- [ ] `extern "C"` の整数/浮動小数 ABI を公開する
- [ ] `cargo test` でコアの単体テストを用意（決定性・範囲・状態遷移・境界・不変条件など）
- [ ] FFI（`extern "C"`）層にも characterization テストを置く（内部 struct だけでなく公開関数を駆動する）

### フロントエンド
- [ ] React ページ `src/components/pages/{{PageName}}.tsx` を追加し、`@/assets/{{name}}.wasm?url` を読む
- [ ] **WASM ロードは `src/hooks/useWasm.ts`（`{exports, status}`）を使う**（各ページで `fetch→instantiate` を再実装しない）
- [ ] **ページはアトミックデザインで分解**：データ/純粋ロジック/WASM 型は別モジュール、UI は atoms（`src/components/atoms`）/ molecules（`src/components/molecules`・共有は prefix/className でスコープ対応）/ organisms（ページフォルダに co-locate）。pages は組み立てに徹する
- [ ] **共通ユーティリティを再実装しない**：localStorage は `src/lib/storage.ts`、シードは `src/lib/seed.ts`
- [ ] 描画側に属する値（色・ラベル等）は TS 側に置き、Rust は数値状態に徹する
- [ ] CSS はページ単位にスコープ（`.{{prefix}}-root` 配下にネスト、CSS 変数も内側）
- [ ] `src/App.tsx` のルーティング（`/{{path}}`）と作品一覧 `PROJECTS` に登録（既存行は変更しない）
- [ ] `package.json` の `build:wasm` に本クレートのビルドを追加（`... && bash wasm/{{crate-name}}/build.sh`）

### テスト（フロント）
- [ ] **`src/test/{{PageName}}.test.tsx` を追加**（Rust の `cargo test` だけで終えない）
- [ ] `src/test/wasm.ts` の `mockWasmFetch`/`mockWasmFetchFailure` で実 `.wasm` を使い、実 Rust ロジックを UI 越しに検証する
- [ ] 観点：ロード→ready 遷移、主要操作、localStorage 永続、エラー状態表示（canvas/rAF は getContext・rAF をスタブし決定的に）

## 受け入れ基準

- `npm run build`（= `vite build`）成功、`{{name}}.wasm` が `dist/assets` にバンドルされる
- `cargo test` がパスする
- `npm test`（vitest run）がパスする（追加したページテストを含む）
- `/{{path}}` で期待通り動作する
- 既存ページ（joya/chat/gacha/haiku/leap）のルーティング・表示が壊れていない
- Rust ソースとビルドスクリプトがコミットされ、`npm run build:wasm` で wasm を再生成できる
- 実コードに `unsafe`/`static mut`/`addr_of` が無い（コメント中の語のみ可）

## 参考情報

- 手本になる既存実装：`src/components/pages/{JiyuGacha,FreeHaiku,LeapToFreedom}.tsx` と
  各ページフォルダ（`jiyu-gacha/`・`free-haiku/`・`leap-to-freedom/`）、`wasm/*` のクレート、
  共有基盤（`src/hooks/useWasm.ts`・`src/lib/`・`src/components/atoms`・`molecules/ListPanel.tsx`）
- WASM ロードは S3/CloudFront 配信で content-type 非依存にするため `fetch(url).arrayBuffer()` →
  `WebAssembly.instantiate(buf, {})`（`instantiateStreaming` は使わない）
- ビルドは rustup + cargo のみ。この端末は Homebrew 版 rustc が `/usr/local/bin` で PATH を
  奪い wasm std を解決できないため、build.sh で
  `export PATH="$(dirname "$(rustup which cargo)"):$PATH"` のように rustup ツールチェインの
  bin を前置きする（既存 build.sh を踏襲）
```
