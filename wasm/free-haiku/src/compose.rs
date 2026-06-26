//! 自由律の句構成。
//!
//! 5-7-5 の定型に縛られず、行数・各行のセグメント数・各セグメントが引く
//! 語彙バンクを PRNG から決める。語そのものの選択（pick）は TS 側で行うため、
//! ここでは「構造」だけを確定させる。

use crate::rng::Rng;

/// 語彙バンクの個数（TS 側の WordBank 数と一致させる契約値）。
pub const BANK_COUNT: u32 = 6;
/// 自由律として取りうる最小行数。
pub const MIN_LINES: u32 = 2;
/// 自由律として取りうる最大行数（MIN_LINES より大きいことで「変動する行数」を保証）。
pub const MAX_LINES: u32 = 5;
/// 1 行に含めるセグメント（語）の最大数。
pub const MAX_SEGS: u32 = 3;

/// 確定した句構造。ヒープを使わず固定長配列で保持する（WASM で allocator 不要）。
pub struct Composition {
    line_count: u32,
    line_lens: [u32; MAX_LINES as usize],
    seg_banks: [[u32; MAX_SEGS as usize]; MAX_LINES as usize],
}

impl Composition {
    /// 静的初期値用の空構造。
    pub const EMPTY: Composition = Composition {
        line_count: 0,
        line_lens: [0; MAX_LINES as usize],
        seg_banks: [[0; MAX_SEGS as usize]; MAX_LINES as usize],
    };

    /// 行数（`[MIN_LINES, MAX_LINES]`）。
    pub fn line_count(&self) -> u32 {
        self.line_count
    }

    /// `i` 行目のセグメント数（`>= 1`）。
    pub fn line_len(&self, i: u32) -> u32 {
        self.line_lens[i as usize]
    }

    /// `i` 行目 `j` 番目のセグメントが引く語彙バンク index（`[0, BANK_COUNT)`）。
    pub fn seg_bank(&self, i: u32, j: u32) -> u32 {
        self.seg_banks[i as usize][j as usize]
    }
}

/// PRNG から句構造を確定させる。語の pick は呼ばない（TS 側に委ねる）。
pub fn compose(rng: &mut Rng) -> Composition {
    let line_count = MIN_LINES + rng.pick(MAX_LINES - MIN_LINES + 1);

    let mut line_lens = [0u32; MAX_LINES as usize];
    let mut seg_banks = [[0u32; MAX_SEGS as usize]; MAX_LINES as usize];

    for i in 0..line_count as usize {
        let segs = 1 + rng.pick(MAX_SEGS); // [1, MAX_SEGS]
        line_lens[i] = segs;
        for j in 0..segs as usize {
            seg_banks[i][j] = rng.pick(BANK_COUNT);
        }
    }

    Composition {
        line_count,
        line_lens,
        seg_banks,
    }
}
