All 19 tests pass (7 rng / 7 compose / 5 score), the wasm has zero imports, and CSS is fully scoped under `.fh-root`. I've now reviewed every section of the Knowledge/Policy against the cumulative diff (base `52e50d5` → working tree). Here is my review.

---

# AI アンチパターンレビュー（1回目・網羅レビュー）

## レビュー対象（ベースからの累積差分）
- 変更: `src/App.tsx`（import / PROJECTS / Route の追記のみ）
- 新規: `wasm/free-haiku/`（Cargo.toml, build.sh, .gitignore, src/{lib,rng,compose,score}.rs, tests/*.rs, Cargo.lock）
- 新規: `src/assets/free_haiku.wasm`、`src/components/pages/FreeHaiku.tsx`、`FreeHaiku.css`

## Knowledge 全セクションの照合結果

| セクション | 判定 | 根拠 |
|---|---|---|
| 仮定の検証 | OK | 「自由＝自由律」解釈は order.md §目的/参考情報と一致。行数 [2,5]・字数ばらつきで自由律を体現 |
| もっともらしいが間違っている | OK | `node` で実 wasm 検証 → `imports: []`、export 9 件すべて TS から使用。FFI 配線漏れなし |
| 幻覚API | OK | `WebAssembly.instantiate`, `addr_of/addr_of_mut`, `rotate_left`, wouter `Link` いずれも実在 |
| コピペ/一貫性 | OK | `JiyuGacha.tsx` の構造（WasmExports型・readList/writeList・makeSeed・effect ロード）を踏襲 |
| 冗長な条件分岐 | OK | 該当なし |
| コールバック+外部変数キャプチャ | OK | `generate()` は戻り値で `Poem` を返す。キャプチャ代入なし |
| インテグレーション一貫性 | OK | WASM ロードは fetch→arrayBuffer→instantiate（order 要件どおり、JiyuGacha と同方式） |
| スコープクリープ | OK | 要求機能（再生成・コピー・お気に入り/履歴）のみ。余計な抽象化・設定・Legacy対応なし |
| 早すぎるキャッシュ | OK | 該当なし（localStorage は要件指定の永続化であってキャッシュ層ではない） |
| デッドコード | OK | FFI export 9 件全使用。`next_u32`(tests+内部)、`from_state`/`EMPTY`(静的初期化)、定数群すべて使用 |
| フォールバック/デフォルト引数濫用 | OK | `?? 'unknown'` 型の必須データ握り潰しなし。`catch{return []}` は壊れた localStorage の正当な処理（参照実装と同一）。`navigator.clipboard?.` は API 非存在対策で妥当 |
| 未使用コード | OK | grep 相当で全シンボル使用を確認 |
| 不要な後方互換 | OK | `@deprecated`・旧API・互換マップなし |
| 決定トレーサビリティ | OK | `coder-decisions.md` に PRNG選定/責務分割/スコア式/lazy-init を理由・代替案つきで記録 |

## 個別の事実確認
- **PRNG**: `rng.rs` は xoroshiro64* の正準実装（`s0*0x9E3779BB`, `rotl(s0,26)^s1^(s1<<9)`, `rotl(s1,13)`）と一致。全ゼロ状態を `new` で退避。
- **スコア論理**: 手計算で検証 — `[5,7,5]=8 < [4,7,6]=12`、`[7,7,7]=4 < [5,9,7]=16`。テスト契約を満たす。バグなし。
- **境界安全**: `compose` の行数 [2,5]・segs [1,3]・bank [0,6) は固定長配列内。`SCORE_CAP=MAX_LINES=5` で TS の push 数（=行数≤5）も収まる。
- **契約整合**: Rust `BANK_COUNT=6` ↔ TS `BANKS.length=6` を確認（添字 `seg_bank ∈ [0,6)` が `BANKS[0..5]` に対応）。
- **既存ページ非干渉**: `/joya`・`/chat`・`/gacha` のコードは未変更。App.tsx は追記のみ。CSS は全セレクタ `.fh-root` 配下でスコープ済み。
- **テスト**: `cargo test` 実行 → 19件 pass（rng7/compose7/score5）、failed 0。

## 補足（非ブロッキング・参考情報）
- `coder-decisions.md §5`: localStorage 読み込みを参照実装の effect 内 setState から lazy `useState` 初期化子へ変更。order の「JiyuGacha と同様」要件は **WASM ロード方式**に対する指定であり、そこは同方式を維持しているため契約違反ではない。lint error 回避目的で機能等価、文書化済み。妥当な判断と評価。
- `setHistory`/`setFavorites` の updater 内で `writeList` を呼ぶ副作用は参照実装 `JiyuGacha.tsx` と同一パターン（冪等な localStorage 書き込み）。新規導入の劣化ではなく既存規約の踏襲。

## 判定: **APPROVE**

`new` / `persists` のブロッキング指摘は **0 件**。幻覚API・配線漏れ・デッドコード・フォールバック濫用・スコープクリープ・過剰抽象化のいずれも検出されず、テスト・wasm import・CSS スコープを実地で確認した。差し戻し事由なし。

（次ステップ `ai-antipattern-fix` への引き継ぎ: 修正対象なし。）