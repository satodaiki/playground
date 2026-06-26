//! Unit tests for the prosody scoring pure core (`free_haiku::score`).
//!
//! Contract under test (plan §4.3 / §5):
//! - `score::prosody_score(lines: &[u32]) -> i32` — pure function over per-line
//!   character counts. It penalizes the fixed 5-7-5 form and rewards line-length
//!   variation, so genuinely free-verse line shapes score higher.
//!
//! Comparisons below hold the confounding terms equal (same line count, same
//! total character count) so that each test isolates a single scoring property.

use free_haiku::score::prosody_score;

#[test]
fn free_verse_outscores_fixed_575() {
    // Given the canonical 5-7-5 shape and a free-verse shape with the SAME
    // total length (17) but more line-length variation
    let fixed_575 = prosody_score(&[5, 7, 5]);
    let free_verse = prosody_score(&[4, 7, 6]);

    // Then the free-verse shape scores strictly higher (5-7-5 is penalized)
    assert!(
        free_verse > fixed_575,
        "free verse [4,7,6]={free_verse} should beat 5-7-5 [5,7,5]={fixed_575}",
    );
}

#[test]
fn varied_lines_outscore_uniform_lines() {
    // Given two shapes with identical line count (3) and total length (21),
    // differing only in line-length variation
    let uniform = prosody_score(&[7, 7, 7]);
    let varied = prosody_score(&[5, 9, 7]);

    // Then the varied shape scores strictly higher (variation is rewarded)
    assert!(
        varied > uniform,
        "varied [5,9,7]={varied} should beat uniform [7,7,7]={uniform}",
    );
}

#[test]
fn is_pure_and_deterministic() {
    // Given the same input scored twice / Then the result is identical
    // (pure function — no accumulated or hidden state)
    assert_eq!(prosody_score(&[4, 7, 6]), prosody_score(&[4, 7, 6]));
}

#[test]
fn handles_empty_input_without_panicking() {
    // Given no lines (edge case) / Then scoring must not panic
    // (the returned value itself is unconstrained)
    let _ = prosody_score(&[]);
}

#[test]
fn handles_single_line_without_panicking() {
    // Given a single line — no line-length variation is possible (edge case)
    let _ = prosody_score(&[7]);
}
