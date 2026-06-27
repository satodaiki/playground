//! FFI（extern "C"）層の characterization テスト。
//!
//! グローバル状態（PRNG・句構造・韻律スコアバッファ）を保持する公開関数が、
//! シード再現性・範囲・構造読み出し・スコア計算を満たすことを固定する。
//! これらは内部 struct ではなく `extern "C"` 関数を直接叩くため、状態保持の
//! 実装（static mut / thread_local いずれでも）に依らず契約を守るための網となる。
//!
//! 注意: 旧実装（static mut）はグローバル状態をスレッド間で共有するため、
//!       このファイルは `--test-threads=1` を前提とする。thread_local 化後は
//!       スレッドごとに状態が分離されるので並列実行でも安全になる。

use free_haiku::{line_len, pick, roll, score_eval, score_push, score_reset, seed, seg_bank};

#[test]
fn ffi_seed_makes_pick_sequence_reproducible() {
    seed(7, 11);
    let a: Vec<u32> = (0..64).map(|_| pick(97)).collect();
    seed(7, 11);
    let b: Vec<u32> = (0..64).map(|_| pick(97)).collect();
    assert_eq!(a, b);
}

#[test]
fn ffi_pick_stays_within_range() {
    seed(1, 2);
    for _ in 0..1000 {
        assert!(pick(8) < 8);
    }
}

#[test]
fn ffi_roll_structure_is_readable_and_within_bounds() {
    seed(3, 4);
    let lines = roll();
    assert!(lines >= 1 && lines <= free_haiku::compose::MAX_LINES);
    for i in 0..lines {
        let len = line_len(i);
        assert!(len >= 1, "line {i} has no segment");
        for j in 0..len {
            // 構造読み出しが panic せず値を返せること（COMP の永続を確認）。
            let _ = seg_bank(i, j);
        }
    }
}

#[test]
fn ffi_roll_is_deterministic_for_same_seed() {
    let snapshot = || {
        seed(5, 6);
        let n = roll();
        let mut v = vec![n];
        for i in 0..n {
            let l = line_len(i);
            v.push(l);
            for j in 0..l {
                v.push(seg_bank(i, j));
            }
        }
        v
    };
    assert_eq!(snapshot(), snapshot());
}

#[test]
fn ffi_score_eval_matches_direct_computation() {
    score_reset();
    score_push(7);
    score_push(5);
    score_push(8);
    let via_ffi = score_eval();
    let direct = free_haiku::score::prosody_score(&[7, 5, 8]);
    assert_eq!(via_ffi, direct);
}

#[test]
fn ffi_score_reset_clears_the_buffer() {
    score_reset();
    score_push(7);
    score_push(7);
    let first = score_eval();
    score_reset();
    score_push(3);
    let second = score_eval();
    assert_eq!(first, free_haiku::score::prosody_score(&[7, 7]));
    assert_eq!(second, free_haiku::score::prosody_score(&[3]));
}
