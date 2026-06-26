//! JIYU GACHA コアエンジン。
//!
//! ロジックはすべて [`engine`] に置き、本ファイルはブラウザ（WASM）から呼ぶための
//! 薄い C ABI ラッパーに徹する。グローバルな RNG 状態だけをここで保持する。
//!
//! ## JS からの呼び出し手順（1 回のガチャ）
//! 1. [`seed`] で RNG を初期化する
//! 2. [`roll_rarity`] でレアリティを引く（0=N,1=R,2=SR,3=SSR）
//! 3. [`parts_count_for`] で掛け合わせるパーツ数を得る
//! 4. パーツ数だけ [`pick`] でワードバンクのインデックスを引く
//!
//! ## ビルド
//! `./build.sh` を実行すると `wasm32-unknown-unknown` 向けにビルドし、
//! 成果物を `../../src/assets/gacha_core.wasm`（playground が読む場所）へ配置する。

pub mod engine;

use engine::{parts_count, rarity_from_basis, Rarity, Rng, BASIS_MAX};
use std::cell::RefCell;

thread_local! {
    /// ブラウザは単一スレッドなので thread_local をグローバル RNG として使う。
    static RNG: RefCell<Rng> = RefCell::new(Rng::from_seed(0x1234_5678, 0x9abc_def0));
}

/// グローバル RNG をシードし直す。ガチャ 1 回ごとに JS から呼ぶ。
#[no_mangle]
pub extern "C" fn seed(s0: u32, s1: u32) {
    RNG.with(|r| *r.borrow_mut() = Rng::from_seed(s0, s1));
}

/// 次の生の 32bit 乱数。
#[no_mangle]
pub extern "C" fn next_u32() -> u32 {
    RNG.with(|r| r.borrow_mut().next_u32())
}

/// `[0, n)` の一様乱数インデックス。`n == 0` のときは 0。
#[no_mangle]
pub extern "C" fn pick(n: u32) -> u32 {
    RNG.with(|r| r.borrow_mut().below(n))
}

/// レアリティを 1 回引く。戻り値は 0=N, 1=R, 2=SR, 3=SSR。
#[no_mangle]
pub extern "C" fn roll_rarity() -> u32 {
    RNG.with(|r| {
        let basis = r.borrow_mut().below(BASIS_MAX);
        rarity_from_basis(basis).index()
    })
}

/// 指定レアリティで掛け合わせる発想パーツ数を返す。
#[no_mangle]
pub extern "C" fn parts_count_for(rarity_index: u32) -> u32 {
    parts_count(Rarity::from_index(rarity_index))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_makes_sequence_reproducible() {
        seed(7, 11);
        let a: Vec<u32> = (0..5).map(|_| next_u32()).collect();
        seed(7, 11);
        let b: Vec<u32> = (0..5).map(|_| next_u32()).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn pick_is_within_range() {
        seed(1, 2);
        for _ in 0..1_000 {
            assert!(pick(8) < 8);
        }
    }

    #[test]
    fn roll_rarity_is_in_valid_range() {
        seed(3, 4);
        for _ in 0..1_000 {
            assert!(roll_rarity() <= 3);
        }
    }

    #[test]
    fn parts_count_for_matches_table() {
        assert_eq!(parts_count_for(0), 2);
        assert_eq!(parts_count_for(1), 3);
        assert_eq!(parts_count_for(2), 4);
        assert_eq!(parts_count_for(3), 5);
        // 範囲外は SSR 扱い。
        assert_eq!(parts_count_for(42), 5);
    }
}
