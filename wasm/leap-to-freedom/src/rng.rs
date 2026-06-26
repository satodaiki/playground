//! 決定的 PRNG（xoroshiro64*）。
//!
//! 64bit 状態（2 つの u32）をシードに取り、同一シードから同一系列を再現する。
//! WASM へは整数のみを受け渡すため、状態も生成値もすべて u32 で扱う。
//! `wasm/free-haiku/src/rng.rs` と同一アルゴリズムを採用する（決定性の手本）。

/// xoroshiro64* 生成器。状態は 2 つの u32（合計 64bit）。
pub struct Rng {
    s0: u32,
    s1: u32,
}

impl Rng {
    /// 与えられたシードから生成器を作る。
    ///
    /// 全ゼロ状態は xoroshiro 系の退化ケース（常に 0 を返す）なので、
    /// その場合のみ既知の非ゼロ定数で置き換える。
    pub fn new(s0: u32, s1: u32) -> Self {
        if (s0 | s1) == 0 {
            return Rng { s0: 0x9e37_79b9, s1: 0x1234_5679 };
        }
        Rng { s0, s1 }
    }

    /// 生の状態から生成器を作る（静的初期値用の const コンストラクタ）。
    pub const fn from_state(s0: u32, s1: u32) -> Self {
        Rng { s0, s1 }
    }

    /// 次の 32bit 乱数を返し、状態を更新する。
    pub fn next_u32(&mut self) -> u32 {
        let s0 = self.s0;
        let mut s1 = self.s1;
        let result = s0.wrapping_mul(0x9e37_79bb);

        s1 ^= s0;
        self.s0 = s0.rotate_left(26) ^ s1 ^ (s1 << 9);
        self.s1 = s1.rotate_left(13);

        result
    }

    /// `[0, n)` の一様乱数を返す。`n == 0` のときは 0（ゼロ除算・panic を避ける）。
    pub fn pick(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        self.next_u32() % n
    }
}
