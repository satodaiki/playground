//! 自由律俳句ジェネレーターのコア。
//!
//! 純粋ロジックは `rng` / `compose` / `score` モジュールに閉じ、`cargo test` で
//! 単体検証する。WASM へは `extern "C"` で整数のみを受け渡す FFI を公開する
//! （wasm-bindgen 不要・外部 import なし）。

pub mod compose;
pub mod rng;
pub mod score;

use core::ptr::{addr_of, addr_of_mut};

use compose::Composition;
use rng::Rng;

// 単一スレッドの WASM 実行を前提に、PRNG と句構造を静的に保持する。
static mut RNG: Rng = Rng::from_state(0x853c_49e6, 0x748f_ea9b);
static mut COMP: Composition = Composition::EMPTY;

// 韻律スコア用の字数バッファ。行数の上限は MAX_LINES。
const SCORE_CAP: usize = compose::MAX_LINES as usize;
static mut SCORE_LENS: [u32; SCORE_CAP] = [0; SCORE_CAP];
static mut SCORE_N: usize = 0;

// static mut への参照は static_mut_refs lint（将来エラー）の対象なので、
// 生ポインタ経由（addr_of/addr_of_mut）でアクセスする。単一スレッド WASM 前提。

/// PRNG をシードし直す。生成のたびにフロントから呼ぶ。
#[no_mangle]
pub extern "C" fn seed(s0: u32, s1: u32) {
    unsafe {
        *addr_of_mut!(RNG) = Rng::new(s0, s1);
    }
}

/// `[0, n)` の一様乱数。TS 側の語選択に使う。
#[no_mangle]
pub extern "C" fn pick(n: u32) -> u32 {
    unsafe { (*addr_of_mut!(RNG)).pick(n) }
}

/// 句構造を確定させて行数を返す。以降 `line_len`/`seg_bank` で構造を読み出す。
#[no_mangle]
pub extern "C" fn roll() -> u32 {
    unsafe {
        let c = compose::compose(&mut *addr_of_mut!(RNG));
        *addr_of_mut!(COMP) = c;
        (*addr_of!(COMP)).line_count()
    }
}

/// `i` 行目のセグメント数。
#[no_mangle]
pub extern "C" fn line_len(i: u32) -> u32 {
    unsafe { (*addr_of!(COMP)).line_len(i) }
}

/// `i` 行目 `j` 番目のセグメントが引く語彙バンク index。
#[no_mangle]
pub extern "C" fn seg_bank(i: u32, j: u32) -> u32 {
    unsafe { (*addr_of!(COMP)).seg_bank(i, j) }
}

/// 韻律スコア計算用に字数バッファをリセットする。
#[no_mangle]
pub extern "C" fn score_reset() {
    unsafe {
        SCORE_N = 0;
    }
}

/// 1 行分の字数を積む。MAX_LINES を超えると範囲外アクセスで trap する（fail fast）。
#[no_mangle]
pub extern "C" fn score_push(len: u32) {
    unsafe {
        let n = SCORE_N;
        (*addr_of_mut!(SCORE_LENS))[n] = len;
        SCORE_N = n + 1;
    }
}

/// 積んだ字数列から韻律スコアを返す。
#[no_mangle]
pub extern "C" fn score_eval() -> i32 {
    unsafe {
        let n = SCORE_N;
        score::prosody_score(&(&(*addr_of!(SCORE_LENS)))[..n])
    }
}
