//! Unit tests for the free-verse composition pure core (`free_haiku::compose`).
//!
//! Contract under test (plan §4.3 / §5):
//! - `compose::BANK_COUNT: u32`, `compose::MIN_LINES: u32`, `compose::MAX_LINES: u32`.
//!   Free verse means a *variable* line count, so `MIN_LINES < MAX_LINES`.
//! - `compose::compose(rng: &mut Rng) -> Composition` — rolls the line/segment
//!   structure off the PRNG (the per-segment word `pick`s happen later, in TS).
//! - `Composition::line_count(&self) -> u32` in `[MIN_LINES, MAX_LINES]`.
//! - `Composition::line_len(&self, i: u32) -> u32` (>= 1).
//! - `Composition::seg_bank(&self, i: u32, j: u32) -> u32` in `[0, BANK_COUNT)`.

use std::collections::BTreeSet;

use free_haiku::compose::{self, BANK_COUNT, MAX_LINES, MIN_LINES};
use free_haiku::rng::Rng;

#[test]
fn free_verse_line_range_is_variable() {
    // Free verse must not collapse to a fixed line count (e.g. a 5-7-5 triplet).
    assert!(MIN_LINES >= 1, "MIN_LINES must be at least 1");
    assert!(
        MIN_LINES < MAX_LINES,
        "free verse requires a variable line-count range (MIN_LINES < MAX_LINES)",
    );
}

#[test]
fn bank_count_is_positive() {
    // There must be at least one vocabulary bank to draw segments from.
    assert!(BANK_COUNT > 0);
}

#[test]
fn same_seed_produces_identical_composition() {
    // Given two PRNGs with the same seed
    let mut ra = Rng::new(0xcafe_babe, 0xfeed_face);
    let mut rb = Rng::new(0xcafe_babe, 0xfeed_face);

    // When composing from each
    let a = compose::compose(&mut ra);
    let b = compose::compose(&mut rb);

    // Then the full structure is identical (determinism contract)
    assert_eq!(a.line_count(), b.line_count());
    for i in 0..a.line_count() {
        assert_eq!(a.line_len(i), b.line_len(i), "line_len mismatch at line {i}");
        for j in 0..a.line_len(i) {
            assert_eq!(
                a.seg_bank(i, j),
                b.seg_bank(i, j),
                "seg_bank mismatch at ({i},{j})",
            );
        }
    }
}

#[test]
fn line_count_within_declared_range() {
    // Given many distinct seeds / Then every composition's line count is in range
    for seed in 1u32..=2000 {
        let mut r = Rng::new(seed, seed.wrapping_mul(2_654_435_761));
        let n = compose::compose(&mut r).line_count();
        assert!(
            n >= MIN_LINES && n <= MAX_LINES,
            "seed {seed}: line_count {n} outside [{MIN_LINES},{MAX_LINES}]",
        );
    }
}

#[test]
fn every_line_has_at_least_one_segment() {
    // A composed line with zero segments would render as an empty line.
    for seed in 1u32..=2000 {
        let mut r = Rng::new(seed, 0x9e37_79b9 ^ seed);
        let c = compose::compose(&mut r);
        for i in 0..c.line_count() {
            assert!(c.line_len(i) >= 1, "seed {seed}: line {i} has no segments");
        }
    }
}

#[test]
fn every_segment_bank_is_in_range() {
    // Every segment must reference a valid vocabulary bank index.
    for seed in 1u32..=2000 {
        let mut r = Rng::new(seed.wrapping_add(11), seed.wrapping_mul(7) | 1);
        let c = compose::compose(&mut r);
        for i in 0..c.line_count() {
            for j in 0..c.line_len(i) {
                let b = c.seg_bank(i, j);
                assert!(
                    b < BANK_COUNT,
                    "seed {seed}: seg_bank({i},{j})={b} >= BANK_COUNT {BANK_COUNT}",
                );
            }
        }
    }
}

#[test]
fn line_count_covers_full_range_across_seeds() {
    // Plan §5: 行数が取りうる範囲を網羅. Over many seeds, every value in
    // `[MIN_LINES, MAX_LINES]` must appear at least once.
    let mut seen = BTreeSet::new();
    for seed in 1u32..=5000 {
        let mut r = Rng::new(seed, seed.rotate_left(16) ^ 0x5bd1_e995);
        seen.insert(compose::compose(&mut r).line_count());
    }
    for n in MIN_LINES..=MAX_LINES {
        assert!(seen.contains(&n), "line count {n} never produced across 5000 seeds");
    }
}
