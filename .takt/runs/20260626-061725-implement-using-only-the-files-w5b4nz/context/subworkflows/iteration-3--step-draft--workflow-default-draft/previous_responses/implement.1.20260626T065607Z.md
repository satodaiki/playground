Implementation complete. All verification passed.

## 作業結果
- playground サイトにテーマ「自由（自由律）」の新規ページ「自由律俳句ジェネレーター」(`/haiku`) を追加しました。
- コアロジック（決定的 PRNG・自由律の句構成・韻律スコア）を **Rust** で実装し `wasm32-unknown-unknown` 向けに **WASM** 化。`extern "C"` で整数のみ受け渡し、wasm-bindgen 不要・**外部 import なし**（`WebAssembly.instantiate(buf, {})` で読み込み）。
- 既存テスト（`wasm/free-haiku/tests/*.rs`、計 19 件）がパスする実装を提供。ソースとビルドスクリプトをコミット対象に残し、wasm を再生成可能にしました。
- 再生成・コピー・お気に入り/履歴（localStorage）を実装。CSS は `.fh-root` 配下にスコープ。既存ページ（/joya・/chat・/gacha）には触れていません（App.tsx の追記のみ）。

## 変更内容
- 作成: `wasm/free-haiku/`（`Cargo.toml`／`src/rng.rs`・`compose.rs`・`score.rs`・`lib.rs`(FFI)／`build.sh`／`.gitignore`）
- 作成: `src/assets/free_haiku.wasm`（ビルド生成物）
- 作成: `src/components/pages/FreeHaiku.tsx`、`src/components/pages/FreeHaiku.css`
- 変更: `src/App.tsx`（`/haiku` ルート＋`PROJECTS` への作品登録）
- PRNG は xoroshiro64*（状態 u32×2）。Rust 側は構造のみ決定し、語の選択は TS が `pick()` で行う責務分割（`BANK_COUNT=6` ↔ `BANKS.length=6`）。

## ビルド結果
- `npm run build`（= `vite build`）: **成功**。`dist/assets/free_haiku-vtDv9NTm.wasm`（17.53 kB）がバンドルされ、既存 `gacha_core.wasm` も影響なし。
- wasm ビルド（`bash wasm/free-haiku/build.sh`）: **成功・警告なし**。`WebAssembly.Module.imports()` が `[]`、空 import でインスタンス化可能を確認。
- 新規 `FreeHaiku.tsx`/`App.tsx` は隔離型チェックで型エラー 0、`eslint` も 0 件（※プロジェクトの `__build` 内 `tsc -b` は対象外の既存 tetlis 群に既存エラーあり。canonical build は `vite build`）。

## テスト結果
- コマンド: `cargo test --manifest-path wasm/free-haiku/Cargo.toml`（rustup 1.80.1 ツールチェインを PATH 前置き）
- 結果: **全 19 件パス**（compose 7 / rng 7 / score 5、doctest 0）。`test result: ok` × 全モジュール、failed 0。
- 追加で実 wasm に対しフロント生成ロジックを node でシミュレートし、可変行数（2〜5 行）の自由律句と韻律スコアが生成されることを確認。