//! boids コアの純粋ロジックテスト（籠の中の挙動）。

use free_birds::boids::{World, BIRD_COUNT, MAX_SPEED, POINTER_RADIUS};

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
