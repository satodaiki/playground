# FREE THE BIRDS（籠の外へ）設計書

日付: 2026-07-02
ステータス: 承認済み

## 概要

テーマ「自由」の新作1ページ。画面中央の鳥かごをクリックすると鳥の群れが解き放たれ、
boids アルゴリズム（分離・整列・結合）で自己組織化して舞うインタラクティブアート。
「自由とは、放たれた後に自分たちで秩序を生むこと」を創発で表現する。

既存の自由テーマ3作品（JIYU GACHA・自由律俳句・LEAP TO FREEDOM）と同じ
Rust→WASM 構成に揃える。boids は毎フレームの近傍探索計算が重く、WASM を使う
必然性がある。

## UX

- ルート: `/birds`。タイトル「FREE THE BIRDS（籠の外へ）」と短い詩的なコピーを添えた1ページ。
- 初期状態: 画面中央に鳥かご。中で約200羽の小鳥がジッター（羽ばたき待機）している。
- かごをクリック/タップ → 扉が開き、鳥が一斉に飛び出して boids の群れになる。
- マウス/タッチポインタは「風」: 群れはポインタを避けて流れる（反発力）。
- 「もう一度かごに戻す」ボタンで初期状態へリセット。
- `prefers-reduced-motion` 時はシミュレーション速度を落とした低速モードにする。

## アーキテクチャ

既存3作品のパターンを踏襲する（wasm-bindgen 不使用・外部 import なしの cdylib、
`thread_local! + RefCell` によるワールド状態保持、描画・色は TS 側、数値状態は Rust 側）。

### Rust クレート: `wasm/free-birds/`

- `src/rng.rs` — 既存作品と同じ決定的 PRNG（xorshift 系）。初期配置と羽ばたき揺らぎに使う。
- `src/boids.rs` — 純粋ロジック。鳥の状態 `Vec<Bird>`（x, y, vx, vy）、かご状態
  （Caged / Released）、更新則:
  - Caged: かご矩形内でのジッター（PRNG による小さなランダムウォーク、かご壁で反射）
  - Released: boids 3 則（分離・整列・結合）＋ポインタ反発＋画面端の緩い反発（ソフト境界）
  - 速度は最小/最大でクランプし、群れが停止も発散もしないようにする
- `src/lib.rs` — extern "C" ABI:
  - `init(s0: u32, s1: u32, w: f32, h: f32)` — シードと画面サイズで初期化
  - `resize(w: f32, h: f32)` — 画面リサイズ反映
  - `release()` — かごを開けて群れを解放
  - `reset()` — かごに戻す（同一シードで再初期化）
  - `set_pointer(x: f32, y: f32, active: u32)` — ポインタ（風）の位置と有効フラグ
  - `tick(dt_ms: f32)` — 世界を進める
  - `bird_count() -> u32` — 鳥の数
  - `birds_ptr() -> *const f32` — 鳥バッファ（鳥ごとに x, y, vx, vy の4値）の先頭ポインタ
  - `is_released() -> u32` — 解放済みか
- `build.sh` — 既存と同じく wasm32-unknown-unknown で release ビルドし
  `src/assets/free_birds.wasm` へコピー。`package.json` の `build:wasm` に追加する。
- `Cargo.toml` — `crate-type = ["cdylib", "rlib"]`、`panic = "abort"`、`opt-level = "s"`、
  `lto = true`、`strip = true`（leap-to-freedom と同一プロファイル）。

### TS 側: `src/components/pages/`

leap-to-freedom のアトミックデザイン分解に倣う。

- `FreeBirds.tsx` — ページ本体。`useWasm` で `free_birds.wasm` をロードし、
  ステータス表示（loading / error）と各コンポーネントの束ねを担う。
- `free-birds/Hero.tsx` — タイトル・コピー・トップへ戻るリンク。
- `free-birds/FlockCanvas.tsx` — Canvas と rAF ループ、クリック/ポインタイベント、
  リセットボタン。
- `free-birds/render.ts` — 描画関数（かご・扉・鳥・背景）。鳥は速度方向を向いた
  小さな三角形（鳥形）で描く。
- `free-birds/constants.ts` — 鳥数、色、かご寸法などの定数。

ビジュアルデザイン（配色・タイポグラフィ・レイアウト・モーションの質感）は
frontend-design スキル（frontend-design@claude-plugins-official）のガイドラインに
従って実装する。

### ルーティング・カード

- `App.tsx` に `<Route path="/birds" component={FreeBirds} />` を追加。
- `PROJECTS` にカードを追加（「次の作品を制作中...」カードの前）:
  タイトル「FREE THE BIRDS（籠の外へ）」、説明はテーマ「自由」を boids の創発で
  表現した旨と Rust→WASM 製であることを記す。

## データフロー

1. `FlockCanvas` がマウント時に `init(seed, w, h)` を呼ぶ。
2. 毎フレーム（rAF）: `tick(dt_ms)` → `birds_ptr()` と `bird_count()` で wasm メモリ上の
   バッファを `Float32Array` としてゼロコピーで参照 → `render.ts` が Canvas 2D に描画。
3. `Float32Array` ビューは毎フレーム作り直す（wasm メモリの grow で ArrayBuffer が
   detach される可能性への防御。作成コストは無視できる）。
4. ポインタ移動 → `set_pointer(x, y, 1)`、離脱 → `set_pointer(0, 0, 0)`。
5. かごクリック → `release()`、リセットボタン → `reset()`。
6. ウィンドウリサイズ → Canvas の実寸を更新し `resize(w, h)` を呼ぶ。

## エラー処理

- WASM ロード失敗: `useWasm` の `status: 'error'` を既存ページと同様の文言で表示。
- Canvas サイズ 0（非表示タブ等）: rAF 内で幅高さを確認しスキップ。
- `dt_ms` はタブ復帰時に巨大になり得るため、Rust 側で上限（例: 64ms）にクランプ。

## テスト

### Rust（`wasm/free-birds/tests/`、既存作品の構成に倣う）

- `rng_test.rs` — 決定性（同一シード→同一列）。
- `boids_test.rs` —
  - 同一シードで init した2つの世界が同一状態になる
  - release 前: tick してもすべての鳥がかご矩形内に留まる
  - release 後: tick で鳥が移動し、かご外へ広がる
  - 十分な tick 後もすべての鳥が画面境界の許容範囲内に収まる
  - ポインタ反発: ポインタ近傍の鳥が離れる方向の速度を得る
  - 速度クランプ: 最大速度を超えない
- `ffi_test.rs` — init → release → tick → birds_ptr/bird_count の一連呼び出しが
  整合する（カウント×4 要素が読める、is_released が遷移する）。

### TS

- ロジックは Rust 側に閉じるためフロントは軽め。`render.ts` に純粋な補助関数
  （例: 鳥の向き計算）があれば vitest で単体テストする。

## スコープ外

- 音・効果音
- 鳥の種類分け、捕食者モード
- モバイル向けジャイロ連動
