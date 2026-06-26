Done. Here's a summary of the work in this `write_tests` step.

## 作成したテスト（テストファイルのみ・プロダクションコード未作成）

Rust の `cargo test` 用インテグレーションテストを3ファイル作成しました。計画 §5 の引き継ぎ事項どおり、**純粋コア（`rng`/`compose`/`score`）を直接呼び**、FFI の `static mut` グローバルを介しません。場所は `wasm/free-haiku/tests/` で、`draft` が `Cargo.toml` を作成すれば cargo が自動でインテグレーションテストとして拾います。

| ファイル | 観点 | テスト数 |
|---|---|---|
| `tests/rng_test.rs` | 決定性（同シード一致／異シード相違）、範囲（`pick(0)=0`・`pick(1)=0`・`pick(n)∈[0,n)`）、分布（固定シードで非flaky、±40%以内の一様性）、定数化検出 | 7 |
| `tests/compose_test.rs` | 自由律＝可変行数（`MIN_LINES < MAX_LINES`）、決定性、行数レンジ内、各行≥1セグメント、`seg_bank∈[0,BANK_COUNT)`、行数レンジの網羅 | 7 |
| `tests/score_test.rs` | 5-7-5 < 自由律（同字数で隔離）、変化のある行 > 一様な行（同字数で隔離）、純粋性、空入力/単行のエッジケース非panic | 5 |

スコア比較は **行数・総字数を揃えて交絡項を消し**、各テストが単一の性質だけを検証するようにしています。

## 検証結果

- 実装前のため、リポジトリで `cargo test` は **`Cargo.toml` 不在エラー**（想定内・期待される pre-implementation 状態）。
- テストの構文妥当性と契約の実装可能性は、**`/tmp` の使い捨てクレート**（リポジトリ外・非コミット）に契約を満たす stub 実装を置いて検証 → **全19テストがコンパイル・パス**。property アサーションが妥当な PRNG/スコアラーで満たせることを確認済み。検証後 `/tmp` は削除。

## draft ステップへの引き継ぎ（テストが要求する公開API契約）

テストが pin した契約です。`draft` はこれを満たす形で実装してください（`lib.rs` で `pub mod rng; pub mod compose; pub mod score;`）。

- `rng::Rng::new(s0: u32, s1: u32) -> Rng` / `next_u32(&mut self) -> u32` / `pick(&mut self, n: u32) -> u32`（`n==0`→0、それ以外 `[0,n)`）
- `compose::{BANK_COUNT, MIN_LINES, MAX_LINES}: u32`（`MIN_LINES < MAX_LINES`）、`compose::compose(&mut Rng) -> Composition`、`Composition::{line_count() , line_len(i), seg_bank(i,j)}`
- `score::prosody_score(lines: &[u32]) -> i32`（5-7-5 を減点、行長変化を加点、純粋関数）

## 判断の記録

- **JS/TSX テストは作成せず**：計画どおり JS テスト基盤が存在せず、導入は設計判断・プロダクションツーリングに当たるため。テストは `cargo test` のみという計画スコープに準拠。
- **Rust 側インテグレーションテストは不要と判断**：`compose`→`score` の橋渡し（バンクID→語→文字数）は **TS 側**で行われ、Rust 内に3モジュール横断のデータフローは存在しない。3モジュールはそれぞれ独立した純粋ユニットとして検証可能。
- **`Cargo.toml`/`build.sh`/`src/*` は未作成**：これらはプロダクション資産（計画 §4.1 で実装側所有）であり、本ステップの「テストファイルのみ」制約に従って `draft` に委ねます。
- **シードは全て非ゼロ**：64bit 状態 PRNG の全ゼロ縮退は計画が規定しないため、テストはそこに依存させていません（draft 実装の自由度を残す）。

(Phase 2 でレポートが自動生成されます。)