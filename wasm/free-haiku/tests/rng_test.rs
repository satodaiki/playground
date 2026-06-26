//! Unit tests for the deterministic PRNG pure core (`free_haiku::rng`).
//!
//! Contract under test (plan §4.3 / §5):
//! - `Rng::new(s0: u32, s1: u32) -> Rng` — seedable, deterministic PRNG.
//! - `Rng::next_u32(&mut self) -> u32`
//! - `Rng::pick(&mut self, n: u32) -> u32` — `n == 0` => `0`, else uniform in `[0, n)`.
//!
//! All seeds are non-zero: a 64-bit-state PRNG seeded with all zeros is a known
//! degenerate case the plan does not constrain, so tests do not rely on it.

use free_haiku::rng::Rng;

#[test]
fn same_seed_produces_identical_sequence() {
    // Given two PRNGs created from the same seed
    let mut a = Rng::new(0x1234_5678, 0x9abc_def0);
    let mut b = Rng::new(0x1234_5678, 0x9abc_def0);

    // When drawing a long sequence from each / Then every value matches
    for i in 0..256 {
        assert_eq!(a.next_u32(), b.next_u32(), "divergence at draw {i}");
    }
}

#[test]
fn different_seeds_produce_different_sequences() {
    // Given two PRNGs created from different non-zero seeds
    let mut a = Rng::new(1, 2);
    let mut b = Rng::new(3, 4);

    // When collecting a sequence from each
    let seq_a: Vec<u32> = (0..64).map(|_| a.next_u32()).collect();
    let seq_b: Vec<u32> = (0..64).map(|_| b.next_u32()).collect();

    // Then the sequences are not identical
    assert_ne!(seq_a, seq_b);
}

#[test]
fn pick_zero_returns_zero() {
    // Given the documented edge case `n == 0`
    let mut r = Rng::new(42, 99);

    // When/Then `pick(0)` returns 0 (no division by zero, no panic)
    assert_eq!(r.pick(0), 0);
}

#[test]
fn pick_one_always_returns_zero() {
    // Given `n == 1`, the only valid index is 0
    let mut r = Rng::new(7, 13);

    // When picking repeatedly / Then it is always 0
    for _ in 0..100 {
        assert_eq!(r.pick(1), 0);
    }
}

#[test]
fn pick_stays_within_range() {
    // Given a fixed seed and several bucket counts
    let mut r = Rng::new(0xdead_beef, 0x0bad_f00d);

    // When picking many times for each `n` / Then results stay in `[0, n)`
    for &n in &[2u32, 3, 5, 7, 16, 18, 100] {
        for _ in 0..1000 {
            let v = r.pick(n);
            assert!(v < n, "pick({n}) returned {v}, outside [0,{n})");
        }
    }
}

#[test]
fn pick_is_approximately_uniform() {
    // Given a fixed seed (deterministic — this test is NOT flaky)
    let mut r = Rng::new(0x2468_ace0, 0x1357_9bdf);
    const BUCKETS: usize = 10;
    const DRAWS: usize = 100_000;
    let mut counts = [0usize; BUCKETS];

    // When drawing many values in `[0, BUCKETS)`
    for _ in 0..DRAWS {
        counts[r.pick(BUCKETS as u32) as usize] += 1;
    }

    // Then every bucket is hit and counts stay within a loose ±40% of the mean
    let expected = DRAWS / BUCKETS;
    let lo = expected * 6 / 10;
    let hi = expected * 14 / 10;
    for (i, &c) in counts.iter().enumerate() {
        assert!(c >= lo && c <= hi, "bucket {i} count {c} outside [{lo},{hi}]");
    }
}

#[test]
fn next_u32_is_not_a_stuck_constant() {
    // Given a seeded PRNG
    let mut r = Rng::new(123, 456);
    let first = r.next_u32();

    // When drawing more values / Then at least one differs from the first
    assert!(
        (0..64).any(|_| r.next_u32() != first),
        "generator appears stuck on a constant value",
    );
}
