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
