//! 発想ガチャの純粋ロジック。
//!
//! 決定的 PRNG・レアリティ抽選表・組み合わせ強度のみを持ち、I/O やグローバル
//! 状態を一切持たない。すべての関数はホスト上の `cargo test` で単体検証できる。

/// レアリティ階級（後ろほど希少）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rarity {
    /// ノーマル
    N,
    /// レア
    R,
    /// スーパーレア
    Sr,
    /// スーパースペシャルレア
    Ssr,
}

impl Rarity {
    /// JS との境界で受け渡す整数表現（0=N, 1=R, 2=SR, 3=SSR）。
    pub fn index(self) -> u32 {
        match self {
            Rarity::N => 0,
            Rarity::R => 1,
            Rarity::Sr => 2,
            Rarity::Ssr => 3,
        }
    }

    /// 整数表現から復元する。範囲外は最も希少な SSR に丸める。
    pub fn from_index(i: u32) -> Rarity {
        match i {
            0 => Rarity::N,
            1 => Rarity::R,
            2 => Rarity::Sr,
            _ => Rarity::Ssr,
        }
    }
}

/// レアリティ抽選表の分母。`rarity_from_basis` に渡す乱数の範囲は `[0, BASIS_MAX)`。
pub const BASIS_MAX: u32 = 10_000;

/// `[0, BASIS_MAX)` の値を重み付き抽選表でレアリティへ写像する。
///
/// N 60.0% / R 27.0% / SR 10.0% / SSR 3.0%。
pub fn rarity_from_basis(basis: u32) -> Rarity {
    match basis {
        0..=5_999 => Rarity::N,      // 60.0%
        6_000..=8_699 => Rarity::R,  // 27.0%
        8_700..=9_699 => Rarity::Sr, // 10.0%
        _ => Rarity::Ssr,            //  3.0%
    }
}

/// 掛け合わせる発想パーツの数。希少なほど多く（=より突飛に）混ぜ合わせる。
pub fn parts_count(rarity: Rarity) -> u32 {
    match rarity {
        Rarity::N => 2,
        Rarity::R => 3,
        Rarity::Sr => 4,
        Rarity::Ssr => 5,
    }
}

/// 決定的 xorshift128 PRNG。同じシードからは必ず同じ系列を生成する。
#[derive(Debug, Clone)]
pub struct Rng {
    state: [u32; 4],
}

impl Rng {
    /// 2 ワードのシードから RNG を構築する。
    ///
    /// xorshift は全ビット 0 の状態に陥ると以後ずっと 0 を吐き続けるため、
    /// SplitMix 風の撹拌と各レーンの最下位ビット強制で非ゼロ状態を保証する。
    pub fn from_seed(s0: u32, s1: u32) -> Rng {
        let a = s0 ^ 0x9e37_79b9;
        let b = s1 ^ 0x85eb_ca6b;
        let mut state = [
            a.wrapping_mul(0x85eb_ca6b) | 1,
            b.wrapping_mul(0xc2b2_ae35) | 1,
            (a ^ b).wrapping_add(0x27d4_eb2f) | 1,
            a.wrapping_add(b).wrapping_mul(0x1656_67b1) | 1,
        ];
        if state == [0, 0, 0, 0] {
            state = [1, 2, 3, 4];
        }
        Rng { state }
    }

    /// 状態を 1 つ進めて次の 32bit 値を返す。
    pub fn next_u32(&mut self) -> u32 {
        let mut t = self.state[3];
        let s = self.state[0];
        self.state[3] = self.state[2];
        self.state[2] = self.state[1];
        self.state[1] = s;
        t ^= t << 11;
        t ^= t >> 8;
        self.state[0] = t ^ s ^ (s >> 19);
        self.state[0]
    }

    /// `[0, n)` の一様乱数を返す。剰余バイアスを棄却サンプリングで除去する。
    /// `n == 0` のときは 0 を返す。
    pub fn below(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        let n = n as u64;
        // 2^32 を超えない n の最大倍数。これ以上の値は棄却して偏りを無くす。
        let zone = (1u64 << 32) / n * n;
        loop {
            let v = self.next_u32() as u64;
            if v < zone {
                return (v % n) as u32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rarity_index_roundtrips() {
        for r in [Rarity::N, Rarity::R, Rarity::Sr, Rarity::Ssr] {
            assert_eq!(Rarity::from_index(r.index()), r);
        }
    }

    #[test]
    fn rarity_from_index_clamps_out_of_range() {
        assert_eq!(Rarity::from_index(99), Rarity::Ssr);
    }

    #[test]
    fn rarity_table_boundaries() {
        // 各階級の境界値ちょうどで階級が切り替わることを確認する。
        assert_eq!(rarity_from_basis(0), Rarity::N);
        assert_eq!(rarity_from_basis(5_999), Rarity::N);
        assert_eq!(rarity_from_basis(6_000), Rarity::R);
        assert_eq!(rarity_from_basis(8_699), Rarity::R);
        assert_eq!(rarity_from_basis(8_700), Rarity::Sr);
        assert_eq!(rarity_from_basis(9_699), Rarity::Sr);
        assert_eq!(rarity_from_basis(9_700), Rarity::Ssr);
        assert_eq!(rarity_from_basis(BASIS_MAX - 1), Rarity::Ssr);
    }

    #[test]
    fn rarity_distribution_matches_table_within_tolerance() {
        // 全 basis を走査し、各階級の出現幅が設計値どおりかを厳密に数える。
        let mut counts = [0u32; 4];
        for basis in 0..BASIS_MAX {
            counts[rarity_from_basis(basis).index() as usize] += 1;
        }
        assert_eq!(counts, [6_000, 2_700, 1_000, 300]);
    }

    #[test]
    fn parts_count_increases_with_rarity() {
        assert_eq!(parts_count(Rarity::N), 2);
        assert_eq!(parts_count(Rarity::R), 3);
        assert_eq!(parts_count(Rarity::Sr), 4);
        assert_eq!(parts_count(Rarity::Ssr), 5);
    }

    #[test]
    fn rng_is_deterministic_for_same_seed() {
        let mut a = Rng::from_seed(42, 7);
        let mut b = Rng::from_seed(42, 7);
        for _ in 0..1_000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn rng_differs_for_different_seeds() {
        let mut a = Rng::from_seed(1, 0);
        let mut b = Rng::from_seed(2, 0);
        // 先頭 8 語のどこかで必ず食い違うこと（同一系列でないこと）。
        let differs = (0..8).any(|_| a.next_u32() != b.next_u32());
        assert!(differs);
    }

    #[test]
    fn rng_never_collapses_to_zero_state() {
        // ゼロシードでも 0 を吐き続けない（非ゼロ状態保証）。
        let mut r = Rng::from_seed(0, 0);
        let any_nonzero = (0..16).any(|_| r.next_u32() != 0);
        assert!(any_nonzero);
    }

    #[test]
    fn below_zero_returns_zero() {
        let mut r = Rng::from_seed(123, 456);
        assert_eq!(r.below(0), 0);
    }

    #[test]
    fn below_one_always_zero() {
        let mut r = Rng::from_seed(123, 456);
        for _ in 0..1_000 {
            assert_eq!(r.below(1), 0);
        }
    }

    #[test]
    fn below_stays_in_range() {
        let mut r = Rng::from_seed(999, 1);
        for n in 1..=37u32 {
            for _ in 0..500 {
                assert!(r.below(n) < n);
            }
        }
    }

    #[test]
    fn below_covers_every_bucket() {
        // 小さな n では十分な試行で全バケットが少なくとも 1 回は出ること。
        let mut r = Rng::from_seed(2024, 6);
        let n = 6u32;
        let mut seen = [false; 6];
        for _ in 0..5_000 {
            seen[r.below(n) as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }
}
