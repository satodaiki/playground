//! FFI（extern "C"）層の characterization テスト。
//!
//! グローバルな World を保持する公開関数が、初期化の決定性・getter の整合・
//! flip/tick の状態遷移・reset 再現・ゲームオーバー終端を満たすことを固定する。
//! 内部 struct ではなく `extern "C"` 関数を直接叩くため、状態保持の実装
//! （static mut / thread_local いずれでも）に依らず契約を守る網となる。
//!
//! 注意: 旧実装（static mut）はグローバル状態をスレッド間で共有するため、
//!       このファイルは `--test-threads=1` を前提とする。thread_local 化後は
//!       スレッドごとに状態が分離されるので並列実行でも安全になる。

use leap_to_freedom::{
    field_h, field_w, flip, init, is_over, obstacle_count, obstacle_h, obstacle_w, obstacle_x,
    obstacle_y, player_h, player_vel, player_w, player_x, player_y, reset, score, tick,
};

#[test]
fn ffi_init_is_deterministic_for_same_seed() {
    let run = || {
        init(7, 11);
        let mut trace = Vec::new();
        for _ in 0..200 {
            tick(16.0);
            trace.push((player_y().to_bits(), player_vel().to_bits(), score(), is_over()));
        }
        trace
    };
    assert_eq!(run(), run());
}

#[test]
fn ffi_new_world_is_immediately_playable() {
    init(1, 2);
    assert_eq!(is_over(), 0);
    // 固定容量配列で管理しているので、常識的な上限を超えないこと。
    assert!(obstacle_count() <= 4096);
}

#[test]
fn ffi_layout_constants_are_exposed_and_sane() {
    assert!(field_w() > 0.0 && field_h() > 0.0);
    assert!(player_w() > 0.0 && player_h() > 0.0);
    assert!(player_x() >= 0.0 && player_x() < field_w());
    init(1, 1);
    let y = player_y();
    assert!(y >= 0.0 && y <= field_h());
}

#[test]
fn ffi_flip_sequence_is_deterministic() {
    let run = || {
        init(9, 9);
        let mut trace = Vec::new();
        for step in 0..120 {
            if step % 20 == 10 {
                flip();
            }
            tick(16.0);
            trace.push((player_y().to_bits(), score(), is_over()));
        }
        trace
    };
    assert_eq!(run(), run());
}

#[test]
fn ffi_reset_replays_deterministically() {
    init(2, 3);
    for _ in 0..50 {
        tick(16.0);
    }
    let a = score();
    let ay = player_y().to_bits();
    reset();
    for _ in 0..50 {
        tick(16.0);
    }
    assert_eq!(score(), a);
    assert_eq!(player_y().to_bits(), ay);
}

#[test]
fn ffi_doing_nothing_eventually_ends_and_freezes_score() {
    init(1, 1);
    let mut ended = false;
    for _ in 0..100_000 {
        tick(16.0);
        if is_over() == 1 {
            ended = true;
            break;
        }
    }
    assert!(ended, "game never ended while idle");
    let s = score();
    tick(16.0);
    assert_eq!(score(), s, "score must freeze after game over");
}

#[test]
fn ffi_obstacle_getters_stay_in_bounds() {
    init(4, 5);
    let mut saw_obstacle = false;
    for _ in 0..5000 {
        tick(16.0);
        if is_over() == 1 {
            reset();
        }
        let n = obstacle_count();
        for i in 0..n {
            let x = obstacle_x(i);
            let _y = obstacle_y(i);
            let w = obstacle_w(i);
            let h = obstacle_h(i);
            assert!(w > 0.0 && h > 0.0, "obstacle has non-positive size");
            assert!(x > -w && x < field_w() + w, "obstacle x out of plausible range");
            saw_obstacle = true;
        }
        if saw_obstacle {
            break;
        }
    }
    assert!(saw_obstacle, "no obstacle appeared within the budget");
}
