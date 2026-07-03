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
