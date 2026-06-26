# 変更スコープ宣言

## タスク
playground に「自由律俳句ジェネレーター」ページ（/haiku）を追加。コアを Rust→WASM 化しフロント完結で動かす。

## 変更予定
| 種別 | ファイル |
|------|---------|
| 作成 | `wasm/free-haiku/Cargo.toml` |
| 作成 | `wasm/free-haiku/src/lib.rs`（FFI: extern "C" 整数のみ） |
| 作成 | `wasm/free-haiku/src/rng.rs`（決定的 PRNG: xoroshiro64*） |
| 作成 | `wasm/free-haiku/src/compose.rs`（自由律の句構成） |
| 作成 | `wasm/free-haiku/src/score.rs`（韻律/字数スコア） |
| 作成 | `wasm/free-haiku/build.sh`（rustup toolchain を前置きして wasm ビルド→src/assets へ配置） |
| 作成 | `wasm/free-haiku/.gitignore`（/target） |
| 作成 | `src/assets/free_haiku.wasm`（ビルド生成物） |
| 作成 | `src/components/pages/FreeHaiku.tsx` |
| 作成 | `src/components/pages/FreeHaiku.css`（`.fh-root` 配下にスコープ） |
| 変更 | `src/App.tsx`（`/haiku` ルートと PROJECTS 登録） |

## 推定規模
Medium

## 影響範囲
- 新規ページ追加のみ。既存ページ（/joya・/chat・/gacha）のコードには触れない（App.tsx の追記のみ）
- 既存テスト（`wasm/free-haiku/tests/*.rs`）がパスする実装を提供