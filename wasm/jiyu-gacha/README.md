# jiyu-gacha (Rust コア)

playground の `/gacha`（JIYU GACHA）ページが使う発想ガチャエンジンの Rust ソース。
コンパイル結果 `gacha_core.wasm` を `src/assets/` に配置してフロントから読み込む。

- `src/engine.rs` … 純粋ロジック（決定的 PRNG / レアリティ抽選 / 組み合わせ強度）＋単体テスト
- `src/lib.rs` … WASM 向け C ABI ラッパー（`seed`/`next_u32`/`pick`/`roll_rarity`/`parts_count_for`）＋テスト

JS ↔ WASM は整数のみ受け渡し（`wasm-bindgen` 不要、外部 import ゼロ）。
発想パーツの語彙（領域・ターゲット・技術・ひねり・禁断）はフロント側
`src/components/pages/JiyuGacha.tsx` の `CATEGORIES` に持つ。語彙の追加・変更だけなら
WASM の再ビルドは不要。

## ビルド

```bash
./build.sh          # wasm をビルドし ../../src/assets/gacha_core.wasm を更新
```

追加ツール不要（rustup + cargo のみ）。この端末は Homebrew 版 rustc が PATH を
奪うため、build.sh が rustup ツールチェインの bin を前置きして wasm の std を解決する。

## テスト

```bash
cargo test          # コアロジックの単体テスト（16 件）
```
