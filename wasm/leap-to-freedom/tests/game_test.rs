//! Unit tests for the gravity-flip runner game core (`leap_to_freedom::game`).
//!
//! Contract under test (plan §4.2 / §4.4). The pure core exposes:
//! - Layout constants: `FIELD_W`, `FIELD_H`, `PLAYER_X`, `PLAYER_W`, `PLAYER_H`,
//!   `MAX_OBSTACLES`, `GAP_MIN`.
//! - `struct World` with:
//!   `new(s0: u32, s1: u32)`, `reset(&mut self)`, `flip(&mut self)`,
//!   `tick(&mut self, dt_ms: f32)`, `player_y()`, `player_vel()`,
//!   `obstacle_count() -> u32`, `obstacle_x/y/w/h(i: u32) -> f32`,
//!   `score() -> u32`, `is_over() -> bool`.
//! - Verifiable pure functions:
//!   `aabb_overlap(ax,ay,aw,ah, bx,by,bw,bh: f32) -> bool`,
//!   `scroll_speed(elapsed_ms: f32) -> f32` (monotonic non-decreasing difficulty curve).
//!
//! Notes on intentional looseness:
//! - The exact *touching-edge* convention of `aabb_overlap` is implementation
//!   discretion (plan: "ABI 最終形は実装側で確定してよい"), so these tests assert
//!   only clear overlap / clear separation / containment — never an exact edge touch.
//! - `gap_center_range` has an unfixed signature in the plan, so it is not called
//!   directly; obstacle passability is covered behaviorally (in-field invariants +
//!   "doing nothing eventually dies").

use leap_to_freedom::game::{
    aabb_overlap, scroll_speed, World, FIELD_H, FIELD_W, GAP_MIN, MAX_OBSTACLES, PLAYER_H,
    PLAYER_W, PLAYER_X,
};

/// One animation frame at ~60 fps. Small enough that the player stays mid-field
/// for the first handful of ticks (no boundary clamping in early-frame tests).
const FRAME_MS: f32 = 16.0;

/// Float tolerance for geometric in-field bound checks (walls pinned to an edge
/// land exactly on `0.0` / `FIELD_H`, but allow tiny accumulated rounding).
const EPS: f32 = 0.01;

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

#[test]
fn layout_constants_are_sane() {
    // Given the published layout constants / Then they describe a usable field

    assert!(FIELD_W > 0.0, "field width must be positive");
    assert!(FIELD_H > 0.0, "field height must be positive");

    // Player is fixed on the left side, fully inside the field.
    assert!(PLAYER_X >= 0.0 && PLAYER_X < FIELD_W, "player X must sit inside the field");
    assert!(PLAYER_W > 0.0 && PLAYER_H > 0.0, "player box must have positive size");
    assert!(PLAYER_H < FIELD_H, "player must be shorter than the field");

    // Fixed-capacity obstacle storage.
    assert!(MAX_OBSTACLES > 0, "obstacle capacity must be positive");

    // A passable gap must fit inside the field with room to spare.
    assert!(GAP_MIN > 0.0, "minimum gap must be positive");
    assert!(GAP_MIN < FIELD_H, "minimum gap must leave room for obstacles");
    assert!(GAP_MIN > PLAYER_H, "the player must be able to fit through the minimum gap");
}

// ---------------------------------------------------------------------------
// AABB collision detection
// ---------------------------------------------------------------------------

#[test]
fn aabb_detects_clear_overlap() {
    // Given two boxes that clearly intersect
    // When testing overlap / Then it is true
    assert!(aabb_overlap(0.0, 0.0, 10.0, 10.0, 5.0, 5.0, 10.0, 10.0));
}

#[test]
fn aabb_rejects_horizontal_separation() {
    // Given two boxes with a clear horizontal gap between them
    // When testing overlap / Then it is false
    assert!(!aabb_overlap(0.0, 0.0, 10.0, 10.0, 50.0, 0.0, 10.0, 10.0));
}

#[test]
fn aabb_rejects_vertical_separation() {
    // Given two boxes with a clear vertical gap between them
    // When testing overlap / Then it is false
    assert!(!aabb_overlap(0.0, 0.0, 10.0, 10.0, 0.0, 50.0, 10.0, 10.0));
}

#[test]
fn aabb_detects_containment() {
    // Given a small box fully inside a larger one
    // When testing overlap / Then it is true (containment counts as overlap)
    assert!(aabb_overlap(0.0, 0.0, 100.0, 100.0, 40.0, 40.0, 10.0, 10.0));
}

// ---------------------------------------------------------------------------
// Difficulty curve
// ---------------------------------------------------------------------------

#[test]
fn scroll_speed_is_positive_from_the_start() {
    // Given the game has just begun (no elapsed time)
    // When reading the scroll speed / Then the world already moves
    assert!(scroll_speed(0.0) > 0.0, "the world must scroll from the first frame");
}

#[test]
fn scroll_speed_is_monotonically_non_decreasing() {
    // Given an increasing sequence of elapsed times
    // When sampling the difficulty curve / Then speed never drops
    let mut prev = scroll_speed(0.0);
    for step in 1..=200 {
        let t = step as f32 * 250.0; // up to 50s of elapsed time
        let cur = scroll_speed(t);
        assert!(
            cur >= prev,
            "scroll_speed decreased at t={t}ms: {cur} < {prev}",
        );
        prev = cur;
    }
}

// ---------------------------------------------------------------------------
// World lifecycle & state machine
// ---------------------------------------------------------------------------

#[test]
fn new_world_is_immediately_playable() {
    // Given a freshly created world
    let w = World::new(0x1357, 0x2468);

    // Then it is alive, scoreless, and the player sits inside the field
    assert!(!w.is_over(), "a new game must not start in the game-over state");
    assert_eq!(w.score(), 0, "a new game starts with zero survival distance");
    let y = w.player_y();
    assert!(y >= 0.0 && y <= FIELD_H, "player must start inside the field");
}

#[test]
fn score_increases_while_surviving() {
    // Given a fresh, playable world
    let mut w = World::new(11, 22);
    let start = w.score();

    // When surviving several frames
    let mut last = start;
    for _ in 0..5 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
        // Then score never decreases during play (survival distance accumulates)
        assert!(w.score() >= last, "score must not decrease while alive");
        last = w.score();
    }

    // And after surviving a stretch the score has strictly grown
    assert!(last > start, "surviving several frames must increase the score");
}

#[test]
fn score_is_non_decreasing_across_a_full_run() {
    // Given a world driven with no input (never flipping)
    let mut w = World::new(0xabcd, 0xef01);

    // When ticking until the game ends
    let mut last = w.score();
    for _ in 0..100_000 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
        // Then the score is monotonically non-decreasing every frame
        assert!(w.score() >= last, "score decreased mid-run: {} < {}", w.score(), last);
        last = w.score();
    }
}

#[test]
fn flip_reverses_gravity_acceleration() {
    // Given a fresh world, establish the gravity acceleration before flipping
    let mut w = World::new(5, 9);
    w.tick(FRAME_MS);
    let v_a = w.player_vel();
    w.tick(FRAME_MS);
    let v_b = w.player_vel();
    let acc_before = v_b - v_a;

    // When flipping gravity and measuring acceleration again
    w.flip();
    w.tick(FRAME_MS);
    let v_c = w.player_vel();
    w.tick(FRAME_MS);
    let v_d = w.player_vel();
    let acc_after = v_d - v_c;

    // Then gravity pulled the player in opposite directions before vs. after the flip
    assert!(acc_before != 0.0, "gravity must accelerate the player before the flip");
    assert!(acc_after != 0.0, "gravity must accelerate the player after the flip");
    assert!(
        acc_before * acc_after < 0.0,
        "flip must reverse gravity: acc_before={acc_before}, acc_after={acc_after}",
    );
}

#[test]
fn a_single_tick_advances_physics_and_score_together() {
    // Regression guard for the tick() pipeline: one frame must run *every* stage —
    // gravity (velocity + position) and world scroll (survival distance) — not just
    // one of them. Locks the orchestration now spread across extracted helpers.
    let mut w = World::new(101, 202);
    let y0 = w.player_y();
    let v0 = w.player_vel();
    let s0 = w.score();

    w.tick(FRAME_MS);

    assert!(!w.is_over(), "a single early frame must not end the game");
    assert!(w.player_vel() != v0, "gravity stage must change the player's velocity");
    assert!(w.player_y() != y0, "gravity stage must move the player");
    assert!(w.score() > s0, "scroll stage must accumulate survival distance");
}

#[test]
fn doing_nothing_eventually_ends_the_game() {
    // Given a world where the player never acts (never flips)
    let mut w = World::new(2024, 77);

    // When letting gravity and the rising difficulty run their course
    let mut ended = false;
    for _ in 0..100_000 {
        if w.is_over() {
            ended = true;
            break;
        }
        w.tick(FRAME_MS);
    }

    // Then the game eventually ends (passivity is not survivable)
    assert!(ended, "never acting must eventually end an endless runner");
}

#[test]
fn score_freezes_after_game_over() {
    // Given a world driven to game over
    let mut w = World::new(314, 159);
    for _ in 0..100_000 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
    }
    assert!(w.is_over(), "precondition: the run must reach game over");

    // When ticking further after the game is over
    let frozen = w.score();
    w.tick(FRAME_MS);
    w.tick(FRAME_MS);

    // Then the score no longer changes
    assert_eq!(w.score(), frozen, "score must stop accumulating after game over");
}

#[test]
fn game_over_is_a_terminal_state() {
    // Given a world driven to game over
    let mut w = World::new(271, 828);
    for _ in 0..100_000 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
    }
    assert!(w.is_over(), "precondition: the run must reach game over");

    // When ticking further / Then it stays over
    w.tick(FRAME_MS);
    assert!(w.is_over(), "game over must be terminal — ticking cannot revive the run");
}

#[test]
fn reset_restores_a_fresh_playable_state() {
    // Given a world driven to game over
    let mut w = World::new(987, 654);
    for _ in 0..100_000 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
    }
    assert!(w.is_over(), "precondition: the run must reach game over");

    // When resetting
    w.reset();

    // Then the world is alive and scoreless again
    assert!(!w.is_over(), "reset must clear the game-over state");
    assert_eq!(w.score(), 0, "reset must zero the score");
}

#[test]
fn reset_makes_the_simulation_deterministically_replayable() {
    // Given a deterministic run captured from a fresh world
    let mut w = World::new(42, 7);
    let first: Vec<f32> = (0..80)
        .map(|_| {
            w.tick(FRAME_MS);
            w.player_y()
        })
        .collect();

    // When resetting and replaying the exact same ticks
    w.reset();
    let second: Vec<f32> = (0..80)
        .map(|_| {
            w.tick(FRAME_MS);
            w.player_y()
        })
        .collect();

    // Then both runs are bit-for-bit identical (reset returns to the seed state)
    assert_eq!(first, second, "reset + identical input must reproduce the run exactly");
}

// ---------------------------------------------------------------------------
// Obstacle generation invariants
// ---------------------------------------------------------------------------

#[test]
fn obstacle_count_never_exceeds_capacity() {
    // Given a world played across many frames
    let mut w = World::new(0xfeed, 0xface);

    // When inspecting the live obstacle count each frame
    for _ in 0..2_000 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
        // Then it never exceeds the fixed storage capacity
        assert!(
            w.obstacle_count() <= MAX_OBSTACLES as u32,
            "live obstacle count {} exceeds capacity {}",
            w.obstacle_count(),
            MAX_OBSTACLES,
        );
    }
}

#[test]
fn live_obstacles_stay_within_the_field_vertically() {
    // Given a world played across many frames
    let mut w = World::new(13_579, 24_680);

    // When inspecting every live obstacle each frame
    for _ in 0..2_000 {
        if w.is_over() {
            break;
        }
        w.tick(FRAME_MS);
        let n = w.obstacle_count();
        for i in 0..n {
            let y = w.obstacle_y(i);
            let h = w.obstacle_h(i);
            let width = w.obstacle_w(i);

            // Then each obstacle has a positive size
            assert!(h > 0.0, "obstacle {i} has non-positive height {h}");
            assert!(width > 0.0, "obstacle {i} has non-positive width {width}");

            // And spans only on-screen vertical space (so a passable gap can exist)
            assert!(y >= -EPS, "obstacle {i} top {y} is above the field");
            assert!(
                y + h <= FIELD_H + EPS,
                "obstacle {i} bottom {} is below the field height {FIELD_H}",
                y + h,
            );
        }
    }
}
