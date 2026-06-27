//! 自由律俳句ジェネレーターのコア。
//!
//! 純粋ロジックは `rng` / `compose` / `score` モジュールに閉じ、`cargo test` で
//! 単体検証する。WASM へは `extern "C"` で整数のみを受け渡す FFI を公開する
//! （wasm-bindgen 不要・外部 import なし）。
//!
//! グローバル状態（PRNG・句構造・スコアバッファ）は、ブラウザが単一スレッドで
//! あることを利用して `thread_local! + RefCell` で安全に保持する（`unsafe` 不要・
//! `jiyu-gacha` と同じ方式）。

pub mod compose;
pub mod rng;
pub mod score;

use std::cell::RefCell;

use compose::Composition;
use rng::Rng;

// 韻律スコア用の字数バッファ容量。行数の上限は MAX_LINES。
const SCORE_CAP: usize = compose::MAX_LINES as usize;

thread_local! {
    /// 生成用のグローバル PRNG。
    static RNG: RefCell<Rng> = RefCell::new(Rng::from_state(0x853c_49e6, 0x748f_ea9b));
    /// 直近に確定した句構造。
    static COMP: RefCell<Composition> = RefCell::new(Composition::EMPTY);
    /// 韻律スコア計算用の字数バッファと有効長。
    static SCORE_LENS: RefCell<[u32; SCORE_CAP]> = RefCell::new([0; SCORE_CAP]);
    static SCORE_N: RefCell<usize> = RefCell::new(0);
}

/// PRNG をシードし直す。生成のたびにフロントから呼ぶ。
#[no_mangle]
pub extern "C" fn seed(s0: u32, s1: u32) {
    RNG.with(|r| *r.borrow_mut() = Rng::new(s0, s1));
}

/// `[0, n)` の一様乱数。TS 側の語選択に使う。
#[no_mangle]
pub extern "C" fn pick(n: u32) -> u32 {
    RNG.with(|r| r.borrow_mut().pick(n))
}

/// 句構造を確定させて行数を返す。以降 `line_len`/`seg_bank` で構造を読み出す。
#[no_mangle]
pub extern "C" fn roll() -> u32 {
    let c = RNG.with(|r| {
        let mut rng = r.borrow_mut();
        compose::compose(&mut rng)
    });
    COMP.with(|comp| {
        *comp.borrow_mut() = c;
        comp.borrow().line_count()
    })
}

/// `i` 行目のセグメント数。
#[no_mangle]
pub extern "C" fn line_len(i: u32) -> u32 {
    COMP.with(|comp| comp.borrow().line_len(i))
}

/// `i` 行目 `j` 番目のセグメントが引く語彙バンク index。
#[no_mangle]
pub extern "C" fn seg_bank(i: u32, j: u32) -> u32 {
    COMP.with(|comp| comp.borrow().seg_bank(i, j))
}

/// 韻律スコア計算用に字数バッファをリセットする。
#[no_mangle]
pub extern "C" fn score_reset() {
    SCORE_N.with(|n| *n.borrow_mut() = 0);
}

/// 1 行分の字数を積む。SCORE_CAP を超えると範囲外アクセスで trap する（fail fast）。
#[no_mangle]
pub extern "C" fn score_push(len: u32) {
    let i = SCORE_N.with(|n| *n.borrow());
    SCORE_LENS.with(|buf| buf.borrow_mut()[i] = len);
    SCORE_N.with(|n| *n.borrow_mut() = i + 1);
}

/// 積んだ字数列から韻律スコアを返す。
#[no_mangle]
pub extern "C" fn score_eval() -> i32 {
    let n = SCORE_N.with(|n| *n.borrow());
    SCORE_LENS.with(|buf| score::prosody_score(&buf.borrow()[..n]))
}
