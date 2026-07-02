# FREE THE BIRDS（籠の外へ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鳥かごをクリックすると200羽の鳥が解き放たれ、boidsアルゴリズムで群れとして舞う「自由」テーマの1ページ `/birds` を追加する。

**Architecture:** 既存3作品（gacha/haiku/leap）と同一パターン。Rust クレート `wasm/free-birds/` が数値状態（籠・boids）を持ち、外部 import なしの extern "C" ABI を公開。TS 側は `useWasm` でロードし、wasm 線形メモリ上の鳥バッファを `Float32Array` でゼロコピー参照して Canvas 2D に描画する。

**Tech Stack:** Rust (wasm32-unknown-unknown, no wasm-bindgen) / React 19 + TypeScript / Canvas 2D / wouter / vitest + Testing Library / cargo test

**Spec:** `docs/superpowers/specs/2026-07-02-free-birds-design.md`

## Global Constraints

- wasm-bindgen 禁止。cdylib は外部 import なし（`panic = "abort"`、leap-to-freedom と同一プロファイル）。
- 描画に属する値（色・鳥の形）は TS 側、数値状態は Rust 側（既存方針）。
- レイアウトの単一定義点は Rust（籠の矩形は `cage_x/y/w/h` ゲッターで公開）。
- CSS は全セレクタを `.ftb-root` 配下にスコープし CSS 変数も内側で定義（他ページへ漏らさない）。
- 既存 atoms（`BackLink` / `PageFooter`）を再利用する。
- cargo コマンドは rustup ツールチェインを PATH 前置きで使う:
  `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo <...>`
  （Homebrew 版 rustc が PATH を奪う端末対策。build.sh 内も同様）
- TS テストは `src/test/*.test.{ts,tsx}`（vitest, jsdom）。実 wasm バイトを `mockWasmFetch` で読ませる既存方式に従う。
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## デザイン計画（frontend-design スキルによる）

**主題:** 籠の鳥を夜明けの空に放つ瞬間。ページの仕事はただ一つ「扉を開けさせること」。

**カラートークン（4〜6色）:**
- `--ftb-sky: #dfe7f2` 夜明けの空（ページ地・キャンバス上部）
- `--ftb-haze: #f2e7d6` 地平の靄（キャンバス下部）
- `--ftb-ink: #22262e` 墨 — 鳥とテキスト
- `--ftb-muted: #66707f` 補助テキスト
- `--ftb-lapis: #2f5db3` 瑠璃 — アクセント（CTA・キッカー）
- `--ftb-line: rgba(34,38,46,.16)` 罫線

既存3ページはすべて暗色（夜の紺・深緑・濃紺）なので、このページだけ明色の「朝」。
AI 定番の「クリーム地＋テラコッタ」は避け、寒色の朝空＋瑠璃で構成する。

**タイポグラフィ:**
- Display: "Shippori Mincho B1" 800 — 題字「籠の外へ」
- Body: "Zen Kaku Gothic New" 400/500
- Utility: "IBM Plex Mono" — キッカー・フッタの英字ラベル

**レイアウト:**
```
┌──────────────────────────────┐
│ ← トップに戻る                  │
│      FREE THE BIRDS (mono)     │
│        籠の外へ (明朝・大)       │
│   扉を開けたとき、…… (1行)      │
│ ┌──────────────────────────┐ │
│ │        空（Canvas）          │ │
│ │      中央下に鳥かご           │ │
│ └──────────────────────────┘ │
│        [ 扉を開ける ]           │
│  RUST → WEBASSEMBLY · BOIDS    │
└──────────────────────────────┘
```

**署名要素:** 解放のオーケストレーション — 扉を開けた瞬間、(1) 鳥が一斉に飛び出し、
(2) 題字「籠の外へ」の字間（letter-spacing）が 1.6 秒かけてほどけて広がり、
(3) タグラインが「誰も命じていないのに、群れは形を見つける。」に変わる。
動きはこの一箇所に集中させ、他は静かに保つ。`prefers-reduced-motion` では
字間トランジションを無効化し、シミュレーション速度を 0.4 倍にする。

---

### Task 1: Rust クレート雛形と決定的 PRNG

**Files:**
- Create: `wasm/free-birds/Cargo.toml`
- Create: `wasm/free-birds/build.sh`（実行権付与）
- Create: `wasm/free-birds/src/lib.rs`（この時点では `pub mod rng;` のみ）
- Create: `wasm/free-birds/src/rng.rs`
- Test: `wasm/free-birds/tests/rng_test.rs`

**Interfaces:**
- Produces: `free_birds::rng::Rng` — `new(s0: u32, s1: u32)`, `const from_state(s0, s1)`, `next_u32() -> u32`, `pick(n: u32) -> u32`（Task 2 が使用）

- [ ] **Step 1: クレートの器を作る**

`wasm/free-birds/Cargo.toml`:

```toml
[package]
name = "free-birds"
version = "0.1.0"
edition = "2021"
description = "FREE THE BIRDS のコア（決定的 PRNG・籠・boids 群れシミュレーション）"

[lib]
name = "free_birds"
crate-type = ["cdylib", "rlib"]

# wasm32-unknown-unknown 向け cdylib を「外部 import なし」で生成するための設定。
# panic=abort で panic 経路を unreachable に畳み、env 等のインポートを発生させない。
[profile.release]
opt-level = "s"
lto = true
panic = "abort"
strip = true
```

`wasm/free-birds/src/lib.rs`:

```rust
//! FREE THE BIRDS のコア（籠の解放と boids 群れ）。

pub mod rng;
```

- [ ] **Step 2: 失敗するテストを書く**

`wasm/free-birds/tests/rng_test.rs`:

```rust
//! 決定的 PRNG（xoroshiro64*）のテスト。free-haiku / leap-to-freedom と同一アルゴリズム。

use free_birds::rng::Rng;

#[test]
fn same_seed_produces_same_sequence() {
    let mut a = Rng::new(12, 34);
    let mut b = Rng::new(12, 34);
    for _ in 0..1000 {
        assert_eq!(a.next_u32(), b.next_u32());
    }
}

#[test]
fn different_seeds_diverge() {
    let mut a = Rng::new(12, 34);
    let mut b = Rng::new(12, 35);
    let same = (0..100).filter(|_| a.next_u32() == b.next_u32()).count();
    assert!(same < 5, "系列がほぼ一致している: {same}/100");
}

#[test]
fn zero_seed_is_replaced_with_nonzero_state() {
    let mut r = Rng::new(0, 0);
    // 全ゼロ状態は退化ケース（常に 0）。置換されていれば非ゼロが出る。
    assert!((0..10).any(|_| r.next_u32() != 0));
}

#[test]
fn pick_stays_in_range_and_handles_zero() {
    let mut r = Rng::new(9, 9);
    for _ in 0..1000 {
        assert!(r.pick(7) < 7);
    }
    assert_eq!(r.pick(0), 0);
}
```

- [ ] **Step 3: テストが失敗（コンパイルエラー）することを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: FAIL（`rng.rs` が無い / 未実装でコンパイルエラー）

- [ ] **Step 4: rng.rs を実装（leap-to-freedom と同一の手本）**

`wasm/free-birds/src/rng.rs`:

```rust
//! 決定的 PRNG（xoroshiro64*）。
//!
//! 64bit 状態（2 つの u32）をシードに取り、同一シードから同一系列を再現する。
//! WASM へは整数のみを受け渡すため、状態も生成値もすべて u32 で扱う。
//! `wasm/leap-to-freedom/src/rng.rs` と同一アルゴリズムを採用する（決定性の手本）。

/// xoroshiro64* 生成器。状態は 2 つの u32（合計 64bit）。
pub struct Rng {
    s0: u32,
    s1: u32,
}

impl Rng {
    /// 与えられたシードから生成器を作る。
    ///
    /// 全ゼロ状態は xoroshiro 系の退化ケース（常に 0 を返す）なので、
    /// その場合のみ既知の非ゼロ定数で置き換える。
    pub fn new(s0: u32, s1: u32) -> Self {
        if (s0 | s1) == 0 {
            return Rng { s0: 0x9e37_79b9, s1: 0x1234_5679 };
        }
        Rng { s0, s1 }
    }

    /// 生の状態から生成器を作る（静的初期値用の const コンストラクタ）。
    pub const fn from_state(s0: u32, s1: u32) -> Self {
        Rng { s0, s1 }
    }

    /// 次の 32bit 乱数を返し、状態を更新する。
    pub fn next_u32(&mut self) -> u32 {
        let s0 = self.s0;
        let mut s1 = self.s1;
        let result = s0.wrapping_mul(0x9e37_79bb);

        s1 ^= s0;
        self.s0 = s0.rotate_left(26) ^ s1 ^ (s1 << 9);
        self.s1 = s1.rotate_left(13);

        result
    }

    /// `[0, n)` の一様乱数を返す。`n == 0` のときは 0（ゼロ除算・panic を避ける）。
    pub fn pick(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        self.next_u32() % n
    }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: PASS（4 tests）

- [ ] **Step 6: build.sh を作る（leap-to-freedom のコピー＋名前差し替え）**

`wasm/free-birds/build.sh`:

```bash
#!/usr/bin/env bash
# free_birds.wasm を wasm32-unknown-unknown 向けにビルドし src/assets へ配置する。
#
# この端末は Homebrew 版 rustc が /usr/local/bin で PATH を奪い、wasm の std を
# 解決できない。そのため rustup の現行ツールチェイン bin を PATH 前置きして、
# rustup 管理の rustc/cargo（wasm std 同梱）を確実に使う。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# rustup が解決する cargo の bin ディレクトリを PATH 先頭に置く。
TOOLCHAIN_BIN="$(dirname "$(rustup which cargo)")"
export PATH="$TOOLCHAIN_BIN:$PATH"

cargo build \
  --manifest-path "$SCRIPT_DIR/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

cp "$SCRIPT_DIR/target/wasm32-unknown-unknown/release/free_birds.wasm" \
  "$REPO_ROOT/src/assets/free_birds.wasm"

echo "built: src/assets/free_birds.wasm"
```

Run: `chmod +x wasm/free-birds/build.sh`

- [ ] **Step 7: コミット**

```bash
git add wasm/free-birds
git commit -m "feat(birds): free-birds クレート雛形と決定的 PRNG を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: boids コア（籠の中）

**Files:**
- Create: `wasm/free-birds/src/boids.rs`
- Modify: `wasm/free-birds/src/lib.rs`（`pub mod boids;` を追加）
- Test: `wasm/free-birds/tests/boids_test.rs`

**Interfaces:**
- Consumes: `free_birds::rng::Rng`（Task 1）
- Produces（Task 3・4 が使用）:
  - `pub const BIRD_COUNT: usize = 200`
  - `#[repr(C)] pub struct Bird { pub x: f32, pub y: f32, pub vx: f32, pub vy: f32 }`
  - `pub struct Cage { pub x, pub y, pub w, pub h: f32 }`
  - `World::EMPTY`, `World::new(s0, s1, w, h)`, `tick(&mut self, dt_ms: f32)`,
    `reset(&mut self)`, `resize(&mut self, w, h)`,
    `released() -> bool`, `count() -> usize`, `bird(i) -> Bird`, `cage() -> Cage`,
    `birds_ptr() -> *const f32`

- [ ] **Step 1: 失敗するテストを書く**

`wasm/free-birds/tests/boids_test.rs`:

```rust
//! boids コアの純粋ロジックテスト（籠の中の挙動）。

use free_birds::boids::{World, BIRD_COUNT};

const W: f32 = 800.0;
const H: f32 = 600.0;

fn all_in_cage(w: &World) -> bool {
    let c = w.cage();
    (0..w.count()).all(|i| {
        let b = w.bird(i);
        b.x >= c.x - 0.01
            && b.x <= c.x + c.w + 0.01
            && b.y >= c.y - 0.01
            && b.y <= c.y + c.h + 0.01
    })
}

fn positions(w: &World) -> Vec<(u32, u32)> {
    (0..w.count())
        .map(|i| {
            let b = w.bird(i);
            (b.x.to_bits(), b.y.to_bits())
        })
        .collect()
}

#[test]
fn init_creates_full_flock_inside_cage() {
    let w = World::new(1, 2, W, H);
    assert_eq!(w.count(), BIRD_COUNT);
    assert!(!w.released());
    assert!(all_in_cage(&w));
}

#[test]
fn cage_sits_inside_field() {
    let w = World::new(1, 2, W, H);
    let c = w.cage();
    assert!(c.w > 0.0 && c.h > 0.0);
    assert!(c.x >= 0.0 && c.x + c.w <= W);
    assert!(c.y >= 0.0 && c.y + c.h <= H);
}

#[test]
fn same_seed_replays_identically() {
    let run = || {
        let mut w = World::new(7, 11, W, H);
        for _ in 0..120 {
            w.tick(16.0);
        }
        positions(&w)
    };
    assert_eq!(run(), run());
}

#[test]
fn caged_birds_jitter_but_stay_in_cage() {
    let mut w = World::new(3, 4, W, H);
    let before = positions(&w);
    for _ in 0..600 {
        w.tick(16.0);
    }
    assert_ne!(positions(&w), before, "籠の中なのに全く動いていない");
    assert!(all_in_cage(&w));
}

#[test]
fn reset_replays_initial_state() {
    let mut w = World::new(20, 21, W, H);
    let initial = positions(&w);
    for _ in 0..100 {
        w.tick(16.0);
    }
    w.reset();
    assert!(!w.released());
    assert_eq!(positions(&w), initial);
}

#[test]
fn empty_world_ignores_tick() {
    let mut w = World::EMPTY;
    w.tick(16.0); // panic しないこと
    assert_eq!(w.count(), 0);
}
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: FAIL（`boids` モジュールが無い）

- [ ] **Step 3: boids.rs（籠の中まで）を実装**

`wasm/free-birds/src/boids.rs`:

```rust
//! 群れ（boids）の純粋ロジック。
//!
//! 籠の中では小さなランダムウォーク、解放後は boids 3 則（分離・整列・結合）
//! ＋ポインタ（風）反発＋画面端の緩い反発で群れが自己組織化する。
//! 描画に属する値（色・鳥の形）は TS 側に置き、ここは数値状態に徹する。

use crate::rng::Rng;

/// 鳥の数。バッファは `BIRD_COUNT * 4` 要素（x, y, vx, vy）。
pub const BIRD_COUNT: usize = 200;

/// 1 tick の最大 dt（ms）。タブ復帰などの巨大 dt での吹き飛びを防ぐ。
pub const MAX_DT_MS: f32 = 64.0;

// --- 籠の中（単位は px / 秒） ---
const CAGED_SPEED: f32 = 28.0;
const JITTER_ACCEL: f32 = 220.0;

/// 1 羽の状態。`#[repr(C)]` で x, y, vx, vy が連続する平坦なレイアウトを保証し、
/// TS 側から Float32Array として直接読めるようにする。
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct Bird {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
}

/// 籠の矩形（左上原点）。
#[derive(Clone, Copy, Default)]
pub struct Cage {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// 世界の全状態。シードを保持し、reset で初期状態を決定的に再現する。
pub struct World {
    seed: (u32, u32),
    rng: Rng,
    w: f32,
    h: f32,
    released: bool,
    pointer: (f32, f32, bool),
    cage: Cage,
    birds: Vec<Bird>,
}

/// `[0, 1)` の一様乱数。
fn frand(rng: &mut Rng) -> f32 {
    (rng.next_u32() >> 8) as f32 / (1u32 << 24) as f32
}

/// 速度の大きさを `[min, max]` に収める。速度ゼロは向きが定まらないのでそのまま。
fn clamp_speed(b: &mut Bird, min: f32, max: f32) {
    let s2 = b.vx * b.vx + b.vy * b.vy;
    if s2 <= 1e-9 {
        return;
    }
    let s = s2.sqrt();
    let k = if s > max {
        max / s
    } else if s < min {
        min / s
    } else {
        return;
    };
    b.vx *= k;
    b.vy *= k;
}

impl World {
    /// thread_local の静的初期値。init 前に tick されても何もしない空世界。
    pub const EMPTY: World = World {
        seed: (0, 0),
        rng: Rng::from_state(1, 2),
        w: 0.0,
        h: 0.0,
        released: false,
        pointer: (0.0, 0.0, false),
        cage: Cage { x: 0.0, y: 0.0, w: 0.0, h: 0.0 },
        birds: Vec::new(),
    };

    /// シードと画面サイズで世界を作る。全羽を籠の中にランダム配置する。
    pub fn new(s0: u32, s1: u32, w: f32, h: f32) -> Self {
        let mut rng = Rng::new(s0, s1);
        let cage = Self::cage_for(w, h);
        let mut birds = Vec::with_capacity(BIRD_COUNT);
        for _ in 0..BIRD_COUNT {
            let x = cage.x + frand(&mut rng) * cage.w;
            let y = cage.y + frand(&mut rng) * cage.h;
            let a = frand(&mut rng) * core::f32::consts::TAU;
            birds.push(Bird {
                x,
                y,
                vx: a.cos() * CAGED_SPEED,
                vy: a.sin() * CAGED_SPEED,
            });
        }
        World {
            seed: (s0, s1),
            rng,
            w,
            h,
            released: false,
            pointer: (0.0, 0.0, false),
            cage,
            birds,
        }
    }

    /// 画面サイズから籠の矩形を決める（中央やや下）。
    fn cage_for(w: f32, h: f32) -> Cage {
        let m = w.min(h);
        let cw = m * 0.26;
        let ch = m * 0.30;
        Cage {
            x: (w - cw) * 0.5,
            y: h * 0.52 - ch * 0.5,
            w: cw,
            h: ch,
        }
    }

    /// 保存済みシードで初期状態を再現する（籠に戻す）。
    pub fn reset(&mut self) {
        *self = World::new(self.seed.0, self.seed.1, self.w, self.h);
    }

    /// 画面リサイズ。籠を再配置し、鳥を新しい領域（籠の中なら籠）に収め直す。
    pub fn resize(&mut self, w: f32, h: f32) {
        if !(w > 0.0 && h > 0.0) {
            return;
        }
        self.w = w;
        self.h = h;
        self.cage = Self::cage_for(w, h);
        let cage = self.cage;
        let released = self.released;
        for b in &mut self.birds {
            if released {
                b.x = b.x.clamp(0.0, w);
                b.y = b.y.clamp(0.0, h);
            } else {
                b.x = b.x.clamp(cage.x, cage.x + cage.w);
                b.y = b.y.clamp(cage.y, cage.y + cage.h);
            }
        }
    }

    /// 世界を dt_ms ミリ秒進める。
    pub fn tick(&mut self, dt_ms: f32) {
        if self.birds.is_empty() || !(dt_ms > 0.0) {
            return;
        }
        let dt = dt_ms.min(MAX_DT_MS) / 1000.0;
        if self.released {
            self.tick_released(dt);
        } else {
            self.tick_caged(dt);
        }
    }

    /// 籠の中：小さなランダムウォーク。籠の壁で反射する。
    fn tick_caged(&mut self, dt: f32) {
        let cage = self.cage;
        for i in 0..self.birds.len() {
            let jx = (frand(&mut self.rng) - 0.5) * 2.0 * JITTER_ACCEL;
            let jy = (frand(&mut self.rng) - 0.5) * 2.0 * JITTER_ACCEL;
            let b = &mut self.birds[i];
            b.vx += jx * dt;
            b.vy += jy * dt;
            clamp_speed(b, 0.0, CAGED_SPEED);
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if b.x < cage.x {
                b.x = cage.x;
                b.vx = b.vx.abs();
            }
            if b.x > cage.x + cage.w {
                b.x = cage.x + cage.w;
                b.vx = -b.vx.abs();
            }
            if b.y < cage.y {
                b.y = cage.y;
                b.vy = b.vy.abs();
            }
            if b.y > cage.y + cage.h {
                b.y = cage.y + cage.h;
                b.vy = -b.vy.abs();
            }
        }
    }

    /// 解放後の挙動。Task 3 で実装する。
    fn tick_released(&mut self, _dt: f32) {}

    // --- 読み取り ---

    pub fn released(&self) -> bool {
        self.released
    }

    pub fn count(&self) -> usize {
        self.birds.len()
    }

    pub fn bird(&self, i: usize) -> Bird {
        self.birds[i]
    }

    pub fn cage(&self) -> Cage {
        self.cage
    }

    /// 鳥バッファ（[x, y, vx, vy] × BIRD_COUNT）の先頭ポインタ。
    /// init 以降 Vec の再確保は起きないため、次の init/reset までは安定している。
    pub fn birds_ptr(&self) -> *const f32 {
        self.birds.as_ptr() as *const f32
    }
}
```

`wasm/free-birds/src/lib.rs` を更新:

```rust
//! FREE THE BIRDS のコア（籠の解放と boids 群れ）。

pub mod boids;
pub mod rng;
```

- [ ] **Step 4: テストが通ることを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: PASS（rng 4 + boids 6 tests）

- [ ] **Step 5: コミット**

```bash
git add wasm/free-birds
git commit -m "feat(birds): boids コアの籠内挙動（ジッター・壁反射・決定的リセット）を実装

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: boids コア（解放後の群れ）

**Files:**
- Modify: `wasm/free-birds/src/boids.rs`
- Test: `wasm/free-birds/tests/boids_test.rs`（テスト追加）

**Interfaces:**
- Produces（Task 4 が使用）:
  - `World::release(&mut self)`
  - `World::set_pointer(&mut self, x: f32, y: f32, active: bool)`
  - `pub const MAX_SPEED: f32` / `pub const MIN_SPEED: f32` / `pub const POINTER_RADIUS: f32`

- [ ] **Step 1: 失敗するテストを追加する**

`wasm/free-birds/tests/boids_test.rs` の末尾に追記:

```rust
use free_birds::boids::{MAX_SPEED, POINTER_RADIUS};

#[test]
fn release_spreads_birds_beyond_cage() {
    let mut w = World::new(5, 6, W, H);
    w.release();
    assert!(w.released());
    for _ in 0..300 {
        w.tick(16.0);
    }
    assert!(!all_in_cage(&w), "解放後も全羽が籠内のまま");
}

#[test]
fn released_birds_stay_in_field() {
    let mut w = World::new(8, 9, W, H);
    w.release();
    for _ in 0..2000 {
        w.tick(16.0);
    }
    for i in 0..w.count() {
        let b = w.bird(i);
        assert!(
            b.x >= 0.0 && b.x <= W && b.y >= 0.0 && b.y <= H,
            "bird {i} out of field: ({}, {})",
            b.x,
            b.y
        );
    }
}

#[test]
fn speed_never_exceeds_max() {
    let mut w = World::new(10, 11, W, H);
    w.release();
    for _ in 0..500 {
        w.tick(16.0);
    }
    for i in 0..w.count() {
        let b = w.bird(i);
        let s = (b.vx * b.vx + b.vy * b.vy).sqrt();
        assert!(s <= MAX_SPEED * 1.001, "bird {i} too fast: {s}");
    }
}

#[test]
fn released_run_is_deterministic() {
    let run = || {
        let mut w = World::new(14, 15, W, H);
        w.release();
        w.set_pointer(W * 0.5, H * 0.5, true);
        for _ in 0..200 {
            w.tick(16.0);
        }
        positions(&w)
    };
    assert_eq!(run(), run());
}

#[test]
fn pointer_wind_pushes_nearby_birds_away() {
    let mut w = World::new(12, 13, W, H);
    w.release();
    for _ in 0..60 {
        w.tick(16.0);
    }
    // 群れの重心に風を置き、近くにいた鳥たちの平均距離が広がることを確認する。
    let (mut cx, mut cy) = (0.0f32, 0.0f32);
    for i in 0..w.count() {
        let b = w.bird(i);
        cx += b.x;
        cy += b.y;
    }
    cx /= w.count() as f32;
    cy /= w.count() as f32;

    let dist = |w: &World, i: usize| {
        let b = w.bird(i);
        ((b.x - cx).powi(2) + (b.y - cy).powi(2)).sqrt()
    };
    let near: Vec<usize> =
        (0..w.count()).filter(|&i| dist(&w, i) < POINTER_RADIUS * 0.8).collect();
    assert!(!near.is_empty(), "重心付近に鳥がいない（テスト前提が崩れている）");

    let before: f32 = near.iter().map(|&i| dist(&w, i)).sum::<f32>() / near.len() as f32;
    w.set_pointer(cx, cy, true);
    for _ in 0..30 {
        w.tick(16.0);
    }
    let after: f32 = near.iter().map(|&i| dist(&w, i)).sum::<f32>() / near.len() as f32;
    assert!(after > before, "風で押し返されていない: before={before} after={after}");
}

#[test]
fn reset_after_release_returns_to_cage() {
    let mut w = World::new(22, 23, W, H);
    let initial = positions(&w);
    w.release();
    for _ in 0..100 {
        w.tick(16.0);
    }
    w.reset();
    assert!(!w.released());
    assert_eq!(positions(&w), initial);
}

#[test]
fn resize_keeps_released_birds_inside_new_bounds() {
    let mut w = World::new(30, 31, W, H);
    w.release();
    for _ in 0..200 {
        w.tick(16.0);
    }
    w.resize(320.0, 240.0);
    for i in 0..w.count() {
        let b = w.bird(i);
        assert!(b.x >= 0.0 && b.x <= 320.0 && b.y >= 0.0 && b.y <= 240.0);
    }
}
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: FAIL（`release` / `set_pointer` / 公開定数が無い）

- [ ] **Step 3: 解放後の挙動を実装**

`wasm/free-birds/src/boids.rs` — 定数ブロック（`JITTER_ACCEL` の下）に追記:

```rust
// --- 解放後（boids）。単位は px / 秒 ---
/// 近傍とみなす距離。
const VIEW_RADIUS: f32 = 64.0;
/// これより近い相手からは強く離れる（分離）。
const SEP_RADIUS: f32 = 20.0;
/// 解放後の最大速度。
pub const MAX_SPEED: f32 = 150.0;
/// 解放後の最小速度（群れが失速して止まらないように）。
pub const MIN_SPEED: f32 = 60.0;
/// 扉が開いた瞬間の射出速度。
const LAUNCH_SPEED: f32 = 130.0;
const W_SEP: f32 = 900.0;
const W_ALI: f32 = 3.0;
const W_COH: f32 = 1.6;
/// ポインタ（風）が届く半径。
pub const POINTER_RADIUS: f32 = 130.0;
const W_POINTER: f32 = 1600.0;
/// 画面端でソフト反発を始める幅。
const EDGE_MARGIN: f32 = 90.0;
const W_EDGE: f32 = 420.0;
```

`impl World` に追記（`tick_released` のスタブは置き換え）:

```rust
    /// 扉を開ける。全羽に籠中心から外向きの初速を与える。
    pub fn release(&mut self) {
        if self.released || self.birds.is_empty() {
            return;
        }
        self.released = true;
        let cx = self.cage.x + self.cage.w * 0.5;
        let cy = self.cage.y + self.cage.h * 0.5;
        for i in 0..self.birds.len() {
            let jitter = (frand(&mut self.rng) - 0.5) * 0.8;
            let fallback = frand(&mut self.rng) * core::f32::consts::TAU;
            let b = &mut self.birds[i];
            let (dx, dy) = (b.x - cx, b.y - cy);
            let a = if dx * dx + dy * dy > 1e-6 {
                dy.atan2(dx) + jitter
            } else {
                fallback
            };
            b.vx = a.cos() * LAUNCH_SPEED;
            b.vy = a.sin() * LAUNCH_SPEED;
        }
    }

    /// ポインタ（風）の位置と有効フラグ。
    pub fn set_pointer(&mut self, x: f32, y: f32, active: bool) {
        self.pointer = (x, y, active);
    }
```

`tick_released` の実装（スタブを置き換え）:

```rust
    /// 解放後：boids 3 則＋風＋ソフト境界。
    /// 加速度を全羽ぶん先に計算してから積分し、更新順序による非対称を避ける。
    fn tick_released(&mut self, dt: f32) {
        let n = self.birds.len();
        let (px, py, pactive) = self.pointer;
        let mut acc = vec![(0.0f32, 0.0f32); n];

        for i in 0..n {
            let bi = self.birds[i];
            let (mut sep_x, mut sep_y) = (0.0f32, 0.0f32);
            let (mut sum_vx, mut sum_vy) = (0.0f32, 0.0f32);
            let (mut sum_x, mut sum_y) = (0.0f32, 0.0f32);
            let mut neighbors = 0.0f32;

            for j in 0..n {
                if i == j {
                    continue;
                }
                let bj = self.birds[j];
                let dx = bi.x - bj.x;
                let dy = bi.y - bj.y;
                let d2 = dx * dx + dy * dy;
                if d2 > VIEW_RADIUS * VIEW_RADIUS {
                    continue;
                }
                neighbors += 1.0;
                sum_vx += bj.vx;
                sum_vy += bj.vy;
                sum_x += bj.x;
                sum_y += bj.y;
                if d2 < SEP_RADIUS * SEP_RADIUS {
                    let d2c = d2.max(1.0);
                    sep_x += dx / d2c;
                    sep_y += dy / d2c;
                }
            }

            let (mut ax, mut ay) = (sep_x * W_SEP, sep_y * W_SEP);
            if neighbors > 0.0 {
                ax += (sum_vx / neighbors - bi.vx) * W_ALI;
                ay += (sum_vy / neighbors - bi.vy) * W_ALI;
                ax += (sum_x / neighbors - bi.x) * W_COH;
                ay += (sum_y / neighbors - bi.y) * W_COH;
            }

            // ポインタ＝風。近いほど強く押し返す。
            if pactive {
                let dx = bi.x - px;
                let dy = bi.y - py;
                let d = (dx * dx + dy * dy).sqrt();
                if d < POINTER_RADIUS && d > 1e-3 {
                    let k = (1.0 - d / POINTER_RADIUS) * W_POINTER / d;
                    ax += dx * k;
                    ay += dy * k;
                }
            }

            // 画面端の緩い反発（ソフト境界）
            if bi.x < EDGE_MARGIN {
                ax += (1.0 - bi.x / EDGE_MARGIN) * W_EDGE;
            }
            if bi.x > self.w - EDGE_MARGIN {
                ax -= (1.0 - (self.w - bi.x) / EDGE_MARGIN) * W_EDGE;
            }
            if bi.y < EDGE_MARGIN {
                ay += (1.0 - bi.y / EDGE_MARGIN) * W_EDGE;
            }
            if bi.y > self.h - EDGE_MARGIN {
                ay -= (1.0 - (self.h - bi.y) / EDGE_MARGIN) * W_EDGE;
            }

            acc[i] = (ax, ay);
        }

        let (w, h) = (self.w, self.h);
        for i in 0..n {
            let (ax, ay) = acc[i];
            let b = &mut self.birds[i];
            b.vx += ax * dt;
            b.vy += ay * dt;
            clamp_speed(b, MIN_SPEED, MAX_SPEED);
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            // ソフト境界を突き抜けた場合の保険（位置の硬いクランプ）
            b.x = b.x.clamp(0.0, w);
            b.y = b.y.clamp(0.0, h);
        }
    }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: PASS（rng 4 + boids 13 tests）。パラメータ起因で
`release_spreads_birds_beyond_cage` や `pointer_wind_pushes_nearby_birds_away` が
落ちる場合は重み定数（W_*）を調整してよいが、テスト側は変更しない。

- [ ] **Step 5: コミット**

```bash
git add wasm/free-birds
git commit -m "feat(birds): 解放後の boids（3則・風反発・ソフト境界・速度クランプ）を実装

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: FFI 層と WASM ビルド組み込み

**Files:**
- Modify: `wasm/free-birds/src/lib.rs`
- Modify: `package.json`（`build:wasm` に free-birds を追加）
- Create: `src/assets/free_birds.wasm`（ビルド成果物）
- Test: `wasm/free-birds/tests/ffi_test.rs`

**Interfaces:**
- Consumes: `boids::World`（Task 2・3 の全 API）
- Produces（TS 側 Task 5・6 が使用する wasm エクスポート）:
  `init(s0, s1, w, h)`, `resize(w, h)`, `release()`, `reset()`,
  `set_pointer(x, y, active: u32)`, `tick(dt_ms)`, `bird_count() -> u32`,
  `birds_ptr() -> *const f32`, `is_released() -> u32`,
  `cage_x/cage_y/cage_w/cage_h() -> f32`, ＋線形メモリ `memory`（cdylib 既定でエクスポートされる）

- [ ] **Step 1: 失敗するテストを書く**

`wasm/free-birds/tests/ffi_test.rs`:

```rust
//! FFI（extern "C"）層の characterization テスト。
//!
//! thread_local に World を保持する公開関数が、初期化の決定性・バッファの整合・
//! release/reset の状態遷移を満たすことを固定する。thread_local なのでテストの
//! 並列実行でも状態は分離される。

use core::slice;

use free_birds::{
    bird_count, birds_ptr, cage_h, cage_w, cage_x, cage_y, init, is_released, release, reset,
    resize, set_pointer, tick,
};

fn snapshot() -> Vec<u32> {
    let len = bird_count() as usize * 4;
    unsafe { slice::from_raw_parts(birds_ptr(), len) }
        .iter()
        .map(|v| v.to_bits())
        .collect()
}

#[test]
fn ffi_init_exposes_full_flock_buffer() {
    init(1, 2, 800.0, 600.0);
    assert_eq!(bird_count(), 200);
    assert_eq!(is_released(), 0);
    let len = bird_count() as usize * 4;
    let buf = unsafe { slice::from_raw_parts(birds_ptr(), len) };
    for v in buf {
        assert!(v.is_finite());
    }
}

#[test]
fn ffi_release_and_tick_move_birds() {
    init(3, 4, 800.0, 600.0);
    release();
    assert_eq!(is_released(), 1);
    let before = snapshot();
    for _ in 0..30 {
        tick(16.0);
    }
    assert_ne!(snapshot(), before);
}

#[test]
fn ffi_full_session_is_deterministic() {
    let run = || {
        init(7, 11, 800.0, 600.0);
        for _ in 0..30 {
            tick(16.0);
        }
        release();
        set_pointer(400.0, 300.0, 1);
        for _ in 0..60 {
            tick(16.0);
        }
        set_pointer(0.0, 0.0, 0);
        for _ in 0..60 {
            tick(16.0);
        }
        snapshot()
    };
    assert_eq!(run(), run());
}

#[test]
fn ffi_reset_recages_deterministically() {
    init(9, 9, 800.0, 600.0);
    let initial = snapshot();
    release();
    for _ in 0..50 {
        tick(16.0);
    }
    reset();
    assert_eq!(is_released(), 0);
    assert_eq!(snapshot(), initial);
}

#[test]
fn ffi_cage_getters_follow_resize() {
    init(2, 2, 800.0, 600.0);
    assert!(cage_w() > 0.0 && cage_h() > 0.0);
    assert!(cage_x() >= 0.0 && cage_x() + cage_w() <= 800.0);
    assert!(cage_y() >= 0.0 && cage_y() + cage_h() <= 600.0);
    resize(400.0, 300.0);
    assert!(cage_x() >= 0.0 && cage_x() + cage_w() <= 400.0);
    assert!(cage_y() >= 0.0 && cage_y() + cage_h() <= 300.0);
}
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: FAIL（extern 関数が無い）

- [ ] **Step 3: lib.rs に FFI 層を実装**

`wasm/free-birds/src/lib.rs` 全体を置き換え:

```rust
//! FREE THE BIRDS のコア（籠の解放と boids 群れ）。
//!
//! 純粋ロジックは `rng` / `boids` モジュールに閉じ、`cargo test` で単体検証する。
//! WASM へは `extern "C"` の整数/浮動小数 ABI を公開する（wasm-bindgen 不要・
//! 外部 import なし）。鳥の座標は線形メモリ上の平坦な f32 バッファ
//! （`birds_ptr()` ＋ `bird_count() * 4` 要素）として TS 側へ晒す。
//!
//! グローバルなワールド状態は、ブラウザが単一スレッドであることを利用して
//! `thread_local! + RefCell` で安全に保持する（既存 3 作品と同じ方式）。

pub mod boids;
pub mod rng;

use std::cell::RefCell;

use boids::World;

thread_local! {
    /// 世界のグローバル状態。
    static WORLD: RefCell<World> = RefCell::new(World::EMPTY);
}

/// 指定シードと画面サイズで世界を初期化する。ページ表示時にフロントから呼ぶ。
#[no_mangle]
pub extern "C" fn init(s0: u32, s1: u32, w: f32, h: f32) {
    WORLD.with(|c| *c.borrow_mut() = World::new(s0, s1, w, h));
}

/// 画面リサイズを反映する。
#[no_mangle]
pub extern "C" fn resize(w: f32, h: f32) {
    WORLD.with(|c| c.borrow_mut().resize(w, h));
}

/// 扉を開けて群れを解放する。
#[no_mangle]
pub extern "C" fn release() {
    WORLD.with(|c| c.borrow_mut().release());
}

/// 同一シードで籠に戻す（初期状態を決定的に再現）。
#[no_mangle]
pub extern "C" fn reset() {
    WORLD.with(|c| c.borrow_mut().reset());
}

/// ポインタ（風）の位置と有効フラグ（0/1）。
#[no_mangle]
pub extern "C" fn set_pointer(x: f32, y: f32, active: u32) {
    WORLD.with(|c| c.borrow_mut().set_pointer(x, y, active != 0));
}

/// 世界を `dt_ms` ミリ秒進める。
#[no_mangle]
pub extern "C" fn tick(dt_ms: f32) {
    WORLD.with(|c| c.borrow_mut().tick(dt_ms));
}

/// 鳥の数。
#[no_mangle]
pub extern "C" fn bird_count() -> u32 {
    WORLD.with(|c| c.borrow().count() as u32)
}

/// 鳥バッファ（[x, y, vx, vy] × bird_count）の先頭ポインタ。
/// 次の init/reset までは安定している。TS 側は毎フレーム読み直す。
#[no_mangle]
pub extern "C" fn birds_ptr() -> *const f32 {
    WORLD.with(|c| c.borrow().birds_ptr())
}

/// 解放済みなら 1。
#[no_mangle]
pub extern "C" fn is_released() -> u32 {
    WORLD.with(|c| u32::from(c.borrow().released()))
}

/// 籠の矩形（描画とヒットテストの単一定義点）。
#[no_mangle]
pub extern "C" fn cage_x() -> f32 {
    WORLD.with(|c| c.borrow().cage().x)
}

#[no_mangle]
pub extern "C" fn cage_y() -> f32 {
    WORLD.with(|c| c.borrow().cage().y)
}

#[no_mangle]
pub extern "C" fn cage_w() -> f32 {
    WORLD.with(|c| c.borrow().cage().w)
}

#[no_mangle]
pub extern "C" fn cage_h() -> f32 {
    WORLD.with(|c| c.borrow().cage().h)
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: PASS（rng 4 + boids 13 + ffi 5 tests）

- [ ] **Step 5: WASM をビルドして成果物を確認**

```bash
bash wasm/free-birds/build.sh
```

Expected: `built: src/assets/free_birds.wasm` と出力され、ファイルが生成される。

外部 import が無いことを確認（`(import` が無ければ OK）:

```bash
ls -la src/assets/free_birds.wasm
```

- [ ] **Step 6: package.json の build:wasm に追加**

`package.json` の scripts を修正:

```json
"build:wasm": "bash wasm/jiyu-gacha/build.sh && bash wasm/free-haiku/build.sh && bash wasm/leap-to-freedom/build.sh && bash wasm/free-birds/build.sh",
```

- [ ] **Step 7: コミット**

```bash
git add wasm/free-birds src/assets/free_birds.wasm package.json
git commit -m "feat(birds): FFI 層と free_birds.wasm のビルド組み込み

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: TS 基盤（型・色・ヒットテスト・描画）

**Files:**
- Create: `src/components/pages/free-birds/constants.ts`
- Create: `src/components/pages/free-birds/render.ts`
- Test: `src/test/FreeBirds.test.tsx`（まず hitCage のみ）

**Interfaces:**
- Consumes: Task 4 の wasm エクスポート（型として写す）
- Produces（Task 6 が使用）:
  - `WasmExports` 型 / `Phase = 'loading' | 'error' | 'caged' | 'released'` / `CageRect` 型
  - `COLORS`, `MAX_DT_MS = 64`, `REDUCED_MOTION_SCALE = 0.4`
  - `hitCage(x, y, cage, pad?) -> boolean`
  - `draw(ctx, view: Float32Array, count, cage, released, nowMs)`

- [ ] **Step 1: 失敗するテストを書く**

`src/test/FreeBirds.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';

import { hitCage } from '@/components/pages/free-birds/constants';

describe('hitCage', () => {
  const cage = { x: 100, y: 100, w: 200, h: 150 };

  it('籠の内側はヒットする', () => {
    expect(hitCage(200, 175, cage)).toBe(true);
  });

  it('既定の余白ぶん外側までヒットする（タップしやすさ）', () => {
    expect(hitCage(90, 90, cage)).toBe(true); // pad=24 の範囲内
  });

  it('余白の外はヒットしない', () => {
    expect(hitCage(50, 50, cage)).toBe(false);
    expect(hitCage(400, 300, cage)).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/test/FreeBirds.test.tsx`
Expected: FAIL（constants.ts が無い）

- [ ] **Step 3: constants.ts を実装**

`src/components/pages/free-birds/constants.ts`:

```ts
// free_birds.wasm のエクスポート（整数/浮動小数のみの C ABI ＋ 線形メモリ）。
// 籠の矩形もゲッターで取り、契約の単一定義点を Rust 側に置く。
export type WasmExports = {
  memory: WebAssembly.Memory;
  init: (s0: number, s1: number, w: number, h: number) => void;
  resize: (w: number, h: number) => void;
  release: () => void;
  reset: () => void;
  set_pointer: (x: number, y: number, active: number) => void;
  tick: (dtMs: number) => void;
  bird_count: () => number;
  birds_ptr: () => number;
  is_released: () => number;
  cage_x: () => number;
  cage_y: () => number;
  cage_w: () => number;
  cage_h: () => number;
};

export type Phase = 'loading' | 'error' | 'caged' | 'released';

export type CageRect = { x: number; y: number; w: number; h: number };

// 描画に属する値（色）は TS 側に置く。夜明けの空に墨色の鳥、鉄の籠。
// ページ全体のトークン（FreeBirds.css）と同じ出処。
export const COLORS = {
  skyTop: '#dfe7f2',
  skyMid: '#e9e6dd',
  horizon: '#f2e7d6',
  bird: '#22262e',
  cage: '#3a4150',
  cageOpen: 'rgba(58, 65, 80, 0.35)',
} as const;

// 1 フレームの最大 dt（タブ復帰の巨大 dt を抑える）。Rust 側 MAX_DT_MS と同値。
export const MAX_DT_MS = 64;

// prefers-reduced-motion 時のシミュレーション速度倍率。
export const REDUCED_MOTION_SCALE = 0.4;

// クリック位置が籠に入っているか。pad は見た目より少し広いヒット領域（タップしやすさ）。
export function hitCage(x: number, y: number, cage: CageRect, pad = 24): boolean {
  return (
    x >= cage.x - pad &&
    x <= cage.x + cage.w + pad &&
    y >= cage.y - pad &&
    y <= cage.y + cage.h + pad
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- src/test/FreeBirds.test.tsx`
Expected: PASS（3 tests）

- [ ] **Step 5: render.ts を実装**

`src/components/pages/free-birds/render.ts`:

```ts
import { COLORS } from './constants';
import type { CageRect } from './constants';

// 空・籠・群れの描画。鳥バッファは鳥ごとに [x, y, vx, vy]。
// 鳥は速度方向を向いた「への字」の翼で描き、nowMs で羽ばたかせる。
export function draw(
  ctx: CanvasRenderingContext2D,
  view: Float32Array,
  count: number,
  cage: CageRect,
  released: boolean,
  nowMs: number,
): void {
  const { width, height } = ctx.canvas;
  drawSky(ctx, width, height);
  drawCage(ctx, cage, released);
  for (let i = 0; i < count; i++) {
    const x = view[i * 4];
    const y = view[i * 4 + 1];
    const vx = view[i * 4 + 2];
    const vy = view[i * 4 + 3];
    drawBird(ctx, x, y, Math.atan2(vy, vx), nowMs * 0.012 + i * 1.7);
  }
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.62, COLORS.skyMid);
  g.addColorStop(1, COLORS.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ドーム型の鳥かご。解放後は薄く残し、扉（右側の1本）を外側へ開いて描く。
function drawCage(ctx: CanvasRenderingContext2D, cage: CageRect, released: boolean): void {
  if (cage.w <= 0 || cage.h <= 0) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = released ? COLORS.cageOpen : COLORS.cage;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const cx = cage.x + cage.w / 2;
  const domeY = cage.y + cage.h * 0.3;

  // ドーム（上部の弧）
  ctx.beginPath();
  ctx.moveTo(cage.x, domeY);
  ctx.quadraticCurveTo(cx, cage.y - cage.h * 0.18, cage.x + cage.w, domeY);
  ctx.stroke();

  // 縦棒 7 本（右端の 1 本は扉）
  const bars = 7;
  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1);
    const bx = cage.x + t * cage.w;
    // ドームの弧に沿った上端
    const topY = domeY - Math.sin(t * Math.PI) * cage.h * 0.28;
    ctx.beginPath();
    if (released && i === bars - 1) {
      // 扉：下端を支点に外側へ 60 度開く
      const doorLen = cage.y + cage.h - topY;
      ctx.moveTo(bx, cage.y + cage.h);
      ctx.lineTo(bx + doorLen * 0.87, cage.y + cage.h - doorLen * 0.5);
    } else {
      ctx.moveTo(bx, topY);
      ctx.lineTo(bx, cage.y + cage.h);
    }
    ctx.stroke();
  }

  // 台座
  ctx.beginPath();
  ctx.moveTo(cage.x - cage.w * 0.06, cage.y + cage.h);
  ctx.lineTo(cage.x + cage.w * 1.06, cage.y + cage.h);
  ctx.stroke();
  ctx.restore();
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  flap: number,
): void {
  const wing = 5 + Math.sin(flap) * 2.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = COLORS.bird;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -wing);
  ctx.quadraticCurveTo(0, 0, 3, 0);
  ctx.quadraticCurveTo(0, 0, -4, wing);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 6: 型チェックとテスト全体を確認**

Run: `npx tsc -b && npm test`
Expected: 型エラーなし、全テスト PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/pages/free-birds src/test/FreeBirds.test.tsx
git commit -m "feat(birds): TS 基盤（WASM 型・配色・籠ヒットテスト・描画関数）を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: ページ UI（Hero / FlockCanvas / FreeBirds / CSS）

**Files:**
- Create: `src/components/pages/free-birds/Hero.tsx`
- Create: `src/components/pages/free-birds/FlockCanvas.tsx`
- Create: `src/components/pages/FreeBirds.tsx`
- Create: `src/components/pages/FreeBirds.css`
- Test: `src/test/FreeBirds.test.tsx`（ページテストを追記）

**Interfaces:**
- Consumes: Task 5 の `WasmExports` / `Phase` / `hitCage` / `draw` / 定数、
  既存の `useWasm` / `makeSeed` / `BackLink` / `PageFooter`
- Produces: `FreeBirds`（default export のページコンポーネント。Task 7 がルートに載せる）

- [ ] **Step 1: 失敗するページテストを追記する**

`src/test/FreeBirds.test.tsx` の import 部を差し替え、describe を追記:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hitCage } from '@/components/pages/free-birds/constants';
import FreeBirds from '@/components/pages/FreeBirds';
import { mockWasmFetch, mockWasmFetchFailure } from './wasm';
```

```tsx
describe('FreeBirds', () => {
  beforeEach(() => {
    mockWasmFetch('free_birds.wasm');
    // jsdom は canvas 2D を実装しないので getContext をスタブ。
    // rAF はループを止め、状態遷移だけを決定的に検証する。
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('読み込み中は「扉を開ける」が無効で、完了後に有効になる', async () => {
    render(<FreeBirds />);
    expect(screen.getByRole('button', { name: '扉を開ける' })).toBeDisabled();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '扉を開ける' })).toBeEnabled(),
    );
  });

  it('扉を開けると「籠に戻す」になり、戻すと再び「扉を開ける」', async () => {
    const user = userEvent.setup();
    render(<FreeBirds />);
    const open = await screen.findByRole('button', { name: '扉を開ける' });
    await waitFor(() => expect(open).toBeEnabled());

    await user.click(open);
    const back = await screen.findByRole('button', { name: '籠に戻す' });
    expect(
      screen.getByText('誰も命じていないのに、群れは形を見つける。'),
    ).toBeInTheDocument();

    await user.click(back);
    expect(await screen.findByRole('button', { name: '扉を開ける' })).toBeInTheDocument();
  });

  it('WASM 読み込み失敗時はエラーメッセージを表示し操作は無効のまま', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWasmFetchFailure();
    render(<FreeBirds />);

    expect(await screen.findByText(/WASM を読み込めませんでした/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '扉を開ける' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/test/FreeBirds.test.tsx`
Expected: FAIL（FreeBirds.tsx が無い）

- [ ] **Step 3: Hero.tsx を実装**

`src/components/pages/free-birds/Hero.tsx`:

```tsx
// ヒーロー。署名要素：解放の瞬間に題字の字間がほどけて広がる（CSS の .is-released）。
export default function Hero({ released }: { released: boolean }) {
  return (
    <header className="ftb-hero">
      <p className="ftb-kicker">FREE THE BIRDS</p>
      <h1 className={`ftb-title${released ? ' is-released' : ''}`}>籠の外へ</h1>
      <p className="ftb-tagline">
        {released
          ? '誰も命じていないのに、群れは形を見つける。'
          : '扉を開けたとき、自由がどんな形になるか見てみよう。'}
      </p>
    </header>
  );
}
```

- [ ] **Step 4: FlockCanvas.tsx を実装**

`src/components/pages/free-birds/FlockCanvas.tsx`:

```tsx
import { useEffect, useRef } from 'react';

import { makeSeed } from '@/lib/seed';

import { MAX_DT_MS, REDUCED_MOTION_SCALE, hitCage } from './constants';
import type { Phase, WasmExports } from './constants';
import { draw } from './render';

// 空（Canvas）。init・rAF ループ・リサイズ・ポインタ＝風・籠クリックでの解放を担う。
// 状態遷移（phase）自体はページが持ち、ここは wasm と描画に徹する。
export default function FlockCanvas({
  exports: w,
  phaseRef,
  onRelease,
}: {
  exports: WasmExports | null;
  phaseRef: { current: Phase };
  onRelease: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !w) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // jsdom 等 matchMedia 未実装の環境でも落ちないようガードする。
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeScale = reduced ? REDUCED_MOTION_SCALE : 1;

    // 実表示サイズにバックストアを合わせる。0 のとき（jsdom・非表示）は触らない。
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      w.resize(canvas.width, canvas.height);
    };
    fit();
    const [s0, s1] = makeSeed();
    w.init(s0, s1, canvas.width, canvas.height);
    window.addEventListener('resize', fit);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, MAX_DT_MS) * timeScale;
      last = now;
      if (canvas.width === 0 || canvas.height === 0) {
        return;
      }
      w.tick(dt);
      const count = w.bird_count();
      // メモリは grow で ArrayBuffer が差し替わり得るため、ビューは毎フレーム作り直す。
      const view = new Float32Array(w.memory.buffer, w.birds_ptr(), count * 4);
      const cage = { x: w.cage_x(), y: w.cage_y(), w: w.cage_w(), h: w.cage_h() };
      draw(ctx, view, count, cage, w.is_released() !== 0, now);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [w]);

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!w) {
      return;
    }
    const [x, y] = toLocal(e);
    w.set_pointer(x, y, 1);
  };

  const onPointerLeave = () => {
    w?.set_pointer(0, 0, 0);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!w || phaseRef.current !== 'caged') {
      return;
    }
    const [x, y] = toLocal(e);
    const cage = { x: w.cage_x(), y: w.cage_y(), w: w.cage_w(), h: w.cage_h() };
    if (hitCage(x, y, cage)) {
      w.release();
      onRelease();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="ftb-canvas"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    />
  );
}
```

- [ ] **Step 5: FreeBirds.tsx を実装**

`src/components/pages/FreeBirds.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

import BackLink from '@/components/atoms/BackLink';
import PageFooter from '@/components/atoms/PageFooter';
import { useWasm } from '@/hooks/useWasm';
import wasmUrl from '@/assets/free_birds.wasm?url';
import './FreeBirds.css';

import type { Phase, WasmExports } from './free-birds/constants';
import Hero from './free-birds/Hero';
import FlockCanvas from './free-birds/FlockCanvas';

export default function FreeBirds() {
  const { exports: w, status } = useWasm<WasmExports>(wasmUrl);

  // rAF・ポインタハンドラから最新フェーズを参照するためのミラー。
  const phaseRef = useRef<Phase>('loading');
  const [phase, setPhase] = useState<Phase>('loading');

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    if (status === 'ready') {
      setPhaseBoth('caged');
    } else if (status === 'error') {
      setPhaseBoth('error');
    }
  }, [status, setPhaseBoth]);

  // 籠クリック（FlockCanvas 内で release 済み）からの通知。
  const onRelease = useCallback(() => setPhaseBoth('released'), [setPhaseBoth]);

  // ボタン：開ける⇄戻す。キーボード操作でも解放できる導線。
  const onToggle = useCallback(() => {
    if (!w) {
      return;
    }
    if (phaseRef.current === 'caged') {
      w.release();
      setPhaseBoth('released');
    } else if (phaseRef.current === 'released') {
      w.reset();
      setPhaseBoth('caged');
    }
  }, [w, setPhaseBoth]);

  return (
    <div className="ftb-root">
      <BackLink className="ftb-back" />
      <Hero released={phase === 'released'} />

      <main className="ftb-stage">
        <div className="ftb-sky-frame">
          <FlockCanvas exports={w} phaseRef={phaseRef} onRelease={onRelease} />

          {phase === 'loading' && (
            <div className="ftb-overlay">
              <p>読み込み中…</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="ftb-overlay ftb-error">
              <p>WASM を読み込めませんでした。ビルドし直して再読み込みしてください。</p>
            </div>
          )}
        </div>

        <button
          className="ftb-door"
          onClick={onToggle}
          disabled={phase === 'loading' || phase === 'error'}
        >
          {phase === 'released' ? '籠に戻す' : '扉を開ける'}
        </button>
      </main>

      <PageFooter className="ftb-foot">
        RUST → WEBASSEMBLY · BOIDS · 完全フロントエンド
      </PageFooter>
    </div>
  );
}
```

- [ ] **Step 6: FreeBirds.css を実装（デザイン計画のトークンどおり）**

`src/components/pages/FreeBirds.css`:

```css
/* FREE THE BIRDS ページ専用スタイル。
   テーマ「籠の外へ」＝解放の瞬間。既存3作品（夜の紺・深緑・濃紺）と対照的な
   「夜明けの空」の明色ページ。鳥とテキストは墨、アクセントは瑠璃。
   署名要素：扉を開けると題字の字間がほどけて広がる（.ftb-title.is-released）。
   全セレクタを .ftb-root 配下にスコープし、CSS 変数も内側で定義する。 */
@import url("https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@700;800&family=Zen+Kaku+Gothic+New:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap");

.ftb-root {
  --ftb-sky: #dfe7f2;
  --ftb-haze: #f2e7d6;
  --ftb-ink: #22262e;
  --ftb-muted: #66707f;
  --ftb-lapis: #2f5db3;
  --ftb-line: rgba(34, 38, 46, 0.16);

  --ftb-display: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
  --ftb-body: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", sans-serif;
  --ftb-mono: "IBM Plex Mono", ui-monospace, monospace;

  min-height: 100vh;
  color: var(--ftb-ink);
  font-family: var(--ftb-body);
  background: linear-gradient(180deg, var(--ftb-sky) 0%, #e9e6dd 62%, var(--ftb-haze) 100%);
}
.ftb-root * {
  box-sizing: border-box;
}

.ftb-back {
  display: inline-block;
  margin: 18px 0 0 18px;
  color: var(--ftb-muted);
  text-decoration: none;
  font-size: 14px;
}
.ftb-back:hover {
  color: var(--ftb-ink);
}

.ftb-hero {
  text-align: center;
  padding: 20px 16px 8px;
}
.ftb-kicker {
  margin: 0;
  font-family: var(--ftb-mono);
  font-size: 12px;
  letter-spacing: 0.42em;
  color: var(--ftb-lapis);
}
.ftb-title {
  margin: 6px 0 0;
  font-family: var(--ftb-display);
  font-weight: 800;
  font-size: clamp(40px, 7vw, 72px);
  letter-spacing: 0.06em;
  transition: letter-spacing 1.6s cubic-bezier(0.19, 1, 0.22, 1);
}
/* 署名要素：解放の瞬間、字間がほどける。text-indent で中央ずれを相殺する。 */
.ftb-title.is-released {
  letter-spacing: 0.5em;
  text-indent: 0.5em;
}
.ftb-tagline {
  margin: 10px 0 0;
  color: var(--ftb-muted);
  font-size: 14px;
}

.ftb-stage {
  max-width: 980px;
  margin: 18px auto 0;
  padding: 0 16px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.ftb-sky-frame {
  position: relative;
  width: 100%;
  height: min(60vh, 560px);
  border: 1px solid var(--ftb-line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--ftb-sky);
}
.ftb-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: pointer;
}
.ftb-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  color: var(--ftb-muted);
  background: rgba(223, 231, 242, 0.72);
}
.ftb-error {
  color: #8c2f2f;
}

.ftb-door {
  font-family: var(--ftb-body);
  font-size: 15px;
  font-weight: 500;
  padding: 10px 30px;
  color: #fff;
  background: var(--ftb-lapis);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}
.ftb-door:hover {
  background: #3c6cc4;
}
.ftb-door:focus-visible {
  outline: 3px solid rgba(47, 93, 179, 0.4);
  outline-offset: 2px;
}
.ftb-door:disabled {
  opacity: 0.5;
  cursor: default;
}

.ftb-foot {
  text-align: center;
  color: var(--ftb-muted);
  font-family: var(--ftb-mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  padding: 18px 0 26px;
}

@media (prefers-reduced-motion: reduce) {
  .ftb-title {
    transition: none;
  }
}
```

- [ ] **Step 7: テストが通ることを確認**

Run: `npm test -- src/test/FreeBirds.test.tsx`
Expected: PASS（hitCage 3 + ページ 3 tests）

- [ ] **Step 8: 型チェック・全テスト・コミット**

Run: `npx tsc -b && npm test`
Expected: 型エラーなし、全テスト PASS

```bash
git add src/components/pages/FreeBirds.tsx src/components/pages/FreeBirds.css src/components/pages/free-birds src/test/FreeBirds.test.tsx
git commit -m "feat(birds): FREE THE BIRDS ページ UI（夜明けの空・籠・解放の署名モーション）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ルーティング・作品カード・最終検証

**Files:**
- Modify: `src/App.tsx`（import・PROJECTS・Route の 3 箇所）

**Interfaces:**
- Consumes: `FreeBirds`（Task 6）

- [ ] **Step 1: App.tsx にルートとカードを追加**

import 部（`import LeapToFreedom ...` の直後）:

```tsx
import FreeBirds from "@/components/pages/FreeBirds";
```

`PROJECTS` 配列の `leap` エントリの直後（`coming-soon` の前）:

```tsx
  {
    id: "birds",
    title: "FREE THE BIRDS（籠の外へ）",
    description:
      "テーマ「自由」を群れの創発で表現。籠を開けると200羽がboidsアルゴリズムで自己組織化して舞う。Rust→WASM製。",
    path: "/birds",
  },
```

`Switch` 内（`/leap` の直後）:

```tsx
        <Route path="/birds" component={FreeBirds} />
```

- [ ] **Step 2: 全テスト・lint・ビルドを確認**

Run: `npm test && npm run lint && npm run build`
Expected: 全テスト PASS、lint エラーなし、ビルド成功

Run: `PATH="$(dirname "$(rustup which cargo)"):$PATH" cargo test --manifest-path wasm/free-birds/Cargo.toml`
Expected: PASS（22 tests）

- [ ] **Step 3: 実機確認（dev サーバ）**

Run: `npm run dev:fast` を起動し、ブラウザで `http://localhost:5173/birds` を確認:
- 籠の中で鳥がジッターしている
- 籠クリックで群れが飛び出し、題字の字間が広がる
- マウスで群れが逃げる
- 「籠に戻す」で初期状態に戻る
- トップページにカードが出て遷移できる

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx
git commit -m "feat(birds): /birds ルートとトップページの作品カードを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
