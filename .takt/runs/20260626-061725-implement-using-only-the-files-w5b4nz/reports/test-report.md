# テスト作成レポート

## 作成テスト
| ファイル | 種別 | テスト数 | 概要 |
|---------|------|---------|------|
| `wasm/free-haiku/tests/rng_test.rs` | 単体 | 7 | 決定的PRNG純粋コア（`rng::Rng`）。同シード一致／異シード相違、`pick(0)=0`・`pick(1)=0`・`pick(n)∈[0,n)`、固定シードでの一様性（非flaky・±40%）、定数化検出 |
| `wasm/free-haiku/tests/compose_test.rs` | 単体 | 7 | 自由律句構成純粋コア（`compose`）。可変行数（`MIN_LINES<MAX_LINES`）、決定性、行数レンジ内、各行≥1セグメント、`seg_bank∈[0,BANK_COUNT)`、行数レンジの網羅 |
| `wasm/free-haiku/tests/score_test.rs` | 単体 | 5 | 韻律スコア純粋コア（`score::prosody_score`）。5-7-5<自由律（同字数で隔離）、変化のある行>一様な行（同字数で隔離）、純粋性、空入力/単行のエッジケース非panic |

統合テストは作成しない判断。`compose`→`score` の橋渡し（バンクID→語→文字数）は TS 側で行われ、Rust 内に3モジュール横断のデータフロー・新規状態の合流・末端伝搬オプションのいずれも存在しないため。3モジュールは独立した純粋ユニットとして単体検証可能。

## 実行結果（参考）
実装前のためテスト失敗・import エラーは想定内。

| 状態 | 件数 | 備考 |
|------|------|------|
| Pass | 0 | リポジトリ上は未実装のため実行不可 |
| Fail / Import Error（想定内） | 19 | `wasm/free-haiku/Cargo.toml` および `free_haiku` クレート（`rng`/`compose`/`score`）が未実装。`cargo test` は「manifest path does not exist」で失敗（pre-implementation の期待状態） |
| Error（要対応） | 0 | なし |

補足: 構文妥当性と契約の実装可能性は、リポジトリ外の使い捨てクレート（`/tmp`・非コミット、検証後削除）に契約充足の stub 実装を置いて検証 → 全19テストがコンパイル・パスすることを確認済み。property アサーションが妥当なPRNG/スコアラーで満たせることを裏取りした。

## 備考（判断がある場合のみ）
- **テストファイルのみ作成**：`Cargo.toml`・`build.sh`・`src/*` はプロダクション資産（計画 §4.1 で実装側所有）のため未作成。`draft` ステップが作成する。テストは標準レイアウト `wasm/free-haiku/tests/` に配置済みで、`Cargo.toml` 作成後に cargo が自動でインテグレーションテストとして拾う。
- **テストが pin した公開API契約（draft への引き継ぎ）**：`lib.rs` で `pub mod rng; pub mod compose; pub mod score;` を公開し、以下を満たすこと。
  - `rng::Rng::new(s0: u32, s1: u32) -> Rng` / `next_u32(&mut self) -> u32` / `pick(&mut self, n: u32) -> u32`（`n==0`→0、それ以外 `[0,n)`）
  - `compose::{BANK_COUNT, MIN_LINES, MAX_LINES}: u32`（`MIN_LINES < MAX_LINES`）、`compose::compose(&mut Rng) -> Composition`、`Composition::{line_count(), line_len(i), seg_bank(i,j)}`
  - `score::prosody_score(lines: &[u32]) -> i32`（5-7-5 減点・行長変化加点・純粋関数）
- **スコア比較は交絡項を隔離**：行数・総字数を揃えた入力同士を比較し、各テストが単一性質（5-7-5減点／変化加点）のみを検証。これにより draft のスコア式の細部を過剰拘束しない。
- **シードは全て非ゼロ**：64bit 状態PRNGの全ゼロ縮退は計画が規定しないため、テストはそこに依存させず draft の実装自由度を残した。
- **JS/TSX テストは未作成**：JSテスト基盤が存在せず、導入は設計判断・ツーリング追加に当たる。計画スコープ（テストは `cargo test` のみ）に準拠。