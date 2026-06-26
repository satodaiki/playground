//! 重力反転ランナー「LEAP TO FREEDOM」の純粋ゲームコア。
//!
//! I/O・グローバル状態を持たず、すべての挙動は `cargo test` で単体検証できる。
//! 座標は固定フィールド（`FIELD_W` × `FIELD_H`）のピクセル、時間はミリ秒、
//! 速度は px/ms、重力加速度は px/ms² で扱う。プレイヤーは左端 `PLAYER_X` に固定され、
//! 世界が右から左へ流れる。ワンボタンで重力の向きを上下反転させる。

// ---------------------------------------------------------------------------
// レイアウト定数（描画側も WASM ゲッター経由でこの値を読む：契約の単一定義点）
// ---------------------------------------------------------------------------

/// フィールド幅（px）。
pub const FIELD_W: f32 = 480.0;
/// フィールド高さ（px）。
pub const FIELD_H: f32 = 360.0;

/// プレイヤーの固定 X 座標（左端寄り）。
pub const PLAYER_X: f32 = 90.0;
/// プレイヤー当たり判定の幅（px）。
pub const PLAYER_W: f32 = 26.0;
/// プレイヤー当たり判定の高さ（px）。
pub const PLAYER_H: f32 = 26.0;

/// 障害物を保持する固定容量配列の要素数（ヒープ割当を避けるための上限）。
pub const MAX_OBSTACLES: usize = 16;

/// 通過可能な最小ギャップ（px）。プレイヤーが必ず通り抜けられる広さを保証する。
pub const GAP_MIN: f32 = 120.0;

// ---------------------------------------------------------------------------
// 内部チューニング定数
// ---------------------------------------------------------------------------

/// ギャップ幅の最大値（px）。実ギャップは `[GAP_MIN, GAP_MAX]` で抽選する。
const GAP_MAX: f32 = 170.0;
/// 壁（障害物）の幅（px）。
const WALL_W: f32 = 30.0;
/// ギャップ上下に必ず残す壁の最小厚み（px）。各壁の高さが正であることを保証する。
const MIN_WALL: f32 = 20.0;
/// ゲート（上下の壁ペア）を生成する間隔（スクロール距離 px）。
const GATE_SPACING: f32 = 230.0;
/// 重力加速度（px/ms²）。反転時は符号が変わる。
const GRAVITY: f32 = 0.0016;

/// 難易度カーブの基準スクロール速度（px/ms）。開始直後から世界は動く。
const SCROLL_BASE: f32 = 0.17;
/// スクロール速度の上昇率（px/ms あたりの増分の傾き）。
const SCROLL_RAMP: f32 = 0.17 / 18_000.0;
/// スクロール速度の上限（px/ms）。
const SCROLL_MAX: f32 = 0.42;

// ---------------------------------------------------------------------------
// 純粋関数
// ---------------------------------------------------------------------------

/// 2 つの軸平行矩形が重なるか（接触のみの境界は重なりとして扱わない半開区間判定）。
pub fn aabb_overlap(
    ax: f32,
    ay: f32,
    aw: f32,
    ah: f32,
    bx: f32,
    by: f32,
    bw: f32,
    bh: f32,
) -> bool {
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

/// 経過時間に応じたスクロール速度（px/ms）。
///
/// 線形に増加させ上限で頭打ちにするため、単調非減少かつ開始時から正。
pub fn scroll_speed(elapsed_ms: f32) -> f32 {
    let s = SCROLL_BASE + SCROLL_RAMP * elapsed_ms;
    if s > SCROLL_MAX {
        SCROLL_MAX
    } else {
        s
    }
}

// ---------------------------------------------------------------------------
// 障害物
// ---------------------------------------------------------------------------

/// 1 つの壁（軸平行矩形）。固定容量配列に置くため `Copy`。
#[derive(Clone, Copy)]
struct Obstacle {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

impl Obstacle {
    const EMPTY: Obstacle = Obstacle { x: 0.0, y: 0.0, w: 0.0, h: 0.0 };
}

// ---------------------------------------------------------------------------
// ワールド
// ---------------------------------------------------------------------------

/// ゲーム世界の全状態。決定的 PRNG とシードを保持し、`reset` で初期状態へ戻せる。
pub struct World {
    rng: Rng,
    seed0: u32,
    seed1: u32,

    player_y: f32,
    player_vel: f32,
    grav_dir: f32,

    elapsed_ms: f32,
    distance: f32,

    obstacles: [Obstacle; MAX_OBSTACLES],
    obstacle_count: usize,
    spawn_accum: f32,

    over: bool,
}

use crate::rng::Rng;

impl World {
    /// 静的初期化用のプレースホルダ（`lib.rs` の static 初期値）。
    pub const EMPTY: World = World {
        rng: Rng::from_state(0x1357, 0x2468),
        seed0: 0,
        seed1: 0,
        player_y: 0.0,
        player_vel: 0.0,
        grav_dir: 1.0,
        elapsed_ms: 0.0,
        distance: 0.0,
        obstacles: [Obstacle::EMPTY; MAX_OBSTACLES],
        obstacle_count: 0,
        spawn_accum: 0.0,
        over: false,
    };

    /// シードを与えて新しい世界を作る。内部で `reset` を呼び初期状態を確定させる。
    pub fn new(s0: u32, s1: u32) -> World {
        let mut w = World::EMPTY;
        w.seed0 = s0;
        w.seed1 = s1;
        w.reset();
        w
    }

    /// シード状態へ巻き戻し、再開可能な初期状態にする。
    pub fn reset(&mut self) {
        self.rng = Rng::new(self.seed0, self.seed1);
        self.player_y = (FIELD_H - PLAYER_H) * 0.5;
        self.player_vel = 0.0;
        self.grav_dir = 1.0;
        self.elapsed_ms = 0.0;
        self.distance = 0.0;
        self.obstacles = [Obstacle::EMPTY; MAX_OBSTACLES];
        self.obstacle_count = 0;
        self.spawn_accum = 0.0;
        self.over = false;
        // 最初のゲートを右端に置く（スクロールして近づいてくる）。
        self.spawn_gate();
    }

    /// 重力の向きを上下反転する。ゲームオーバー後は何もしない（終端状態）。
    pub fn flip(&mut self) {
        if self.over {
            return;
        }
        self.grav_dir = -self.grav_dir;
    }

    /// `dt_ms` ミリ秒ぶん世界を進める。ゲームオーバー後は不変（スコアも凍結）。
    pub fn tick(&mut self, dt_ms: f32) {
        if self.over {
            return;
        }

        self.apply_gravity(dt_ms);
        if self.clamp_to_field_or_die() {
            return;
        }

        let dx = self.scroll_and_spawn(dt_ms);

        if self.collides_with_obstacle() {
            self.over = true;
            return;
        }

        self.elapsed_ms += dt_ms;
        self.distance += dx;
    }

    /// プレイヤー矩形の上端 Y 座標。
    pub fn player_y(&self) -> f32 {
        self.player_y
    }

    /// プレイヤーの現在の縦速度（px/ms）。
    pub fn player_vel(&self) -> f32 {
        self.player_vel
    }

    /// 画面内に存在する障害物の数。
    pub fn obstacle_count(&self) -> u32 {
        self.obstacle_count as u32
    }

    /// `i` 番目の障害物の X 座標。
    pub fn obstacle_x(&self, i: u32) -> f32 {
        self.obstacles[i as usize].x
    }

    /// `i` 番目の障害物の Y 座標。
    pub fn obstacle_y(&self, i: u32) -> f32 {
        self.obstacles[i as usize].y
    }

    /// `i` 番目の障害物の幅。
    pub fn obstacle_w(&self, i: u32) -> f32 {
        self.obstacles[i as usize].w
    }

    /// `i` 番目の障害物の高さ。
    pub fn obstacle_h(&self, i: u32) -> f32 {
        self.obstacles[i as usize].h
    }

    /// 生存距離＝スコア（切り捨て整数）。
    pub fn score(&self) -> u32 {
        self.distance as u32
    }

    /// ゲームオーバーか。
    pub fn is_over(&self) -> bool {
        self.over
    }

    // -- tick の各段（意図を名前で表す） -----------------------------------

    /// 現在の重力方向に従って縦速度と位置を進める。
    fn apply_gravity(&mut self, dt_ms: f32) {
        self.player_vel += self.grav_dir * GRAVITY * dt_ms;
        self.player_y += self.player_vel * dt_ms;
    }

    /// 上下端へ接触したら位置を端で止めてゲームオーバーにし、`true` を返す。
    ///
    /// 受動的（無入力）では必ず端へ落ちるため、生き残るには反転入力が要る。
    fn clamp_to_field_or_die(&mut self) -> bool {
        if self.player_y < 0.0 {
            self.player_y = 0.0;
            self.over = true;
            return true;
        }
        if self.player_y + PLAYER_H > FIELD_H {
            self.player_y = FIELD_H - PLAYER_H;
            self.over = true;
            return true;
        }
        false
    }

    /// 世界を左へスクロールし、画面外の障害物を捨て、間隔到達でゲートを生成する。
    ///
    /// 戻り値はこのフレームのスクロール距離 `dx`（スコア加算の原資）。
    fn scroll_and_spawn(&mut self, dt_ms: f32) -> f32 {
        let dx = scroll_speed(self.elapsed_ms) * dt_ms;
        for i in 0..self.obstacle_count {
            self.obstacles[i].x -= dx;
        }
        self.remove_offscreen();

        self.spawn_accum += dx;
        if self.spawn_accum >= GATE_SPACING {
            self.spawn_accum -= GATE_SPACING;
            self.spawn_gate();
        }
        dx
    }

    /// プレイヤー矩形がいずれかの障害物と重なるか。
    fn collides_with_obstacle(&self) -> bool {
        for i in 0..self.obstacle_count {
            let o = self.obstacles[i];
            if aabb_overlap(PLAYER_X, self.player_y, PLAYER_W, PLAYER_H, o.x, o.y, o.w, o.h) {
                return true;
            }
        }
        false
    }

    // -- 内部ヘルパ --------------------------------------------------------

    /// 左端より完全に出た障害物を取り除き、配列を前詰めする。
    fn remove_offscreen(&mut self) {
        let mut write = 0usize;
        for read in 0..self.obstacle_count {
            let o = self.obstacles[read];
            if o.x + o.w >= 0.0 {
                self.obstacles[write] = o;
                write += 1;
            }
        }
        self.obstacle_count = write;
    }

    /// 上下の壁ペア（通過可能なギャップを挟む 1 ゲート）を右端に生成する。
    ///
    /// 配列に空きが 2 つ無い場合は生成しない（容量超過を構造的に防ぐ）。
    fn spawn_gate(&mut self) {
        if self.obstacle_count + 2 > MAX_OBSTACLES {
            return;
        }

        // ギャップ幅を [GAP_MIN, GAP_MAX] で抽選する。
        let gap_span = (GAP_MAX - GAP_MIN) as u32;
        let gap = GAP_MIN + self.rng.pick(gap_span + 1) as f32;

        // ギャップ中心を、上下の壁が必ず MIN_WALL 以上残る範囲で抽選する。
        let lo = gap * 0.5 + MIN_WALL;
        let hi = FIELD_H - gap * 0.5 - MIN_WALL;
        let center_span = (hi - lo) as u32;
        let center = lo + self.rng.pick(center_span + 1) as f32;

        let gap_top = center - gap * 0.5;
        let gap_bottom = center + gap * 0.5;

        // 上の壁：y=0 から gap_top まで。
        self.obstacles[self.obstacle_count] = Obstacle {
            x: FIELD_W,
            y: 0.0,
            w: WALL_W,
            h: gap_top,
        };
        self.obstacle_count += 1;

        // 下の壁：gap_bottom から FIELD_H まで。
        self.obstacles[self.obstacle_count] = Obstacle {
            x: FIELD_W,
            y: gap_bottom,
            w: WALL_W,
            h: FIELD_H - gap_bottom,
        };
        self.obstacle_count += 1;
    }
}
