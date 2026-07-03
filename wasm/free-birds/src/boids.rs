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
