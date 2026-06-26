# タスク完了サマリー

## タスク
playground サイト「ナナオのあそびば」に、テーマ「自由（自由律）」の新規ページ「自由律俳句ジェネレーター」（`/haiku`）を追加する。コア（決定的 PRNG・自由律句構成・韻律スコア）を Rust で実装して WebAssembly 化し、フロントエンド完結で動かす。

## 結果
完了

## 変更内容
| 種別 | ファイル | 概要 |
|------|---------|------|
| 作成 | `wasm/free-haiku/Cargo.toml` | `crate-type=["cdylib","rlib"]`、`panic=abort`/`opt-level=s`/`lto`/`strip` で外部 import なし wasm を生成 |
| 作成 | `wasm/free-haiku/src/lib.rs` | `extern "C"` 整数のみの FFI 境界（seed/pick/roll/line_len/seg_bank/score_reset/score_push/score_eval） |
| 作成 | `wasm/free-haiku/src/rng.rs` | 決定的シード可能 PRNG（xoroshiro64*、純粋） |
| 作成 | `wasm/free-haiku/src/compose.rs` | 自由律句構成（可変行数 2-5、純粋）。語選択は TS 側に委譲 |
| 作成 | `wasm/free-haiku/src/score.rs` | 韻律/字数スコア（5-7-5 減点・行長変化加点、純粋整数関数） |
| 作成 | `wasm/free-haiku/build.sh` | rustup ツールチェイン bin を PATH 前置きし Homebrew rustc を回避して wasm をビルド→`src/assets` へ配置 |
| 作成 | `wasm/free-haiku/.gitignore` | `/target` を除外 |
| 作成 | `wasm/free-haiku/tests/rng_test.rs` | PRNG 決定性・範囲・分布・非定数性（7件） |
| 作成 | `wasm/free-haiku/tests/compose_test.rs` | 句構成の妥当性・行数レンジ網羅・決定性（7件） |
| 作成 | `wasm/free-haiku/tests/score_test.rs` | 自由律>5-7-5・変化>一様・純粋性・エッジケース（5件） |
| 作成 | `src/assets/free_haiku.wasm` | ビルド成果物（17.5kB、imports なし） |
| 作成 | `src/components/pages/FreeHaiku.tsx` | `/haiku` ページ。生成/再生成/コピー/お気に入り/履歴（localStorage）、`@/assets/*.wasm?url`＋fetch→arrayBuffer→instantiate ロード |
| 作成 | `src/components/pages/FreeHaiku.css` | 全セレクタを `.fh-` 接頭辞・CSS変数を `.fh-root` 内に定義しページ単位にスコープ |
| 変更 | `src/App.tsx` | `import FreeHaiku`・`PROJECTS` に `/haiku` エントリ・`<Route path="/haiku">` を追加（計9行、既存 joya/chat/gacha は不変） |

## 検証証跡
- テスト: `cargo clean && cargo test` 実行 → **19 passed / 0 failed**（rng_test 7・compose_test 7・score_test 5）
- ビルド: `npm run build`（vite build）成功 → `dist/assets/free_haiku-vtDv9NTm.wasm`（17.53kB, gzip 7.61kB）をバンドル確認
- WASM 妥当性: 実測で `imports: []`（空 import）→ `WebAssembly.instantiate(buf, {})` 成立。exports（seed,pick,roll,line_len,seg_bank,score_reset,score_push,score_eval）が `FreeHaiku.tsx` の呼出名と完全一致
- 再生成可能性: `build.sh` 再実行で wasm がバイト一致再生成（sha `911b388ad0c34c6304b89b7f523bd3d3f32ccb19` 不変）→ JIYU GACHA の「ソース未残存で再ビルド不能」反省を解消。`target/` は `.gitignore` で除外
- 既存非干渉: `App.tsx:119-121` の `/joya`・`/chat`・`/gacha` Route 不変、PROJECTS 既存エントリ不変、CSS は `.fh-` スコープで漏洩なし、build 成功で既存ページの破壊なしを確認
- 全 31 分解要件を実コード（ファイル:行）と実行証跡で個別照合し充足を確認。ブロッキング指摘 0 件 → APPROVE