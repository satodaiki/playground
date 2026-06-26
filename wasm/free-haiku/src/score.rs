//! 韻律スコア。
//!
//! 各行の字数列に対する純粋関数。定型 5-7-5 を低く評価し、行長のばらつきを
//! 高く評価することで、自由律らしい句形ほど高得点になる。

/// 行ごとの字数列から韻律スコアを返す。値が大きいほど「自由律らしい」。
pub fn prosody_score(lines: &[u32]) -> i32 {
    let n = lines.len() as i64;
    if n == 0 {
        return 0;
    }

    let total: i64 = lines.iter().map(|&l| l as i64).sum();

    // 行長のばらつき: 平均からの絶対偏差の総和。整数のまま扱うため全体を n 倍した
    // |l*n - total| を合計する（= ばらつき * n に比例）。ばらつきが大きいほど高評価。
    let variation: i64 = lines
        .iter()
        .map(|&l| ((l as i64) * n - total).abs())
        .sum();

    // 5-7-5 からの距離。3 行のときのみ定型とみなし、距離が小さい（定型に近い）ほど
    // 低評価になるよう、距離そのものを加点する。3 行以外は定型概念が無いので 0。
    let dist_575: i64 = if lines.len() == 3 {
        (lines[0] as i64 - 5).abs()
            + (lines[1] as i64 - 7).abs()
            + (lines[2] as i64 - 5).abs()
    } else {
        0
    };

    (variation + dist_575) as i32
}
