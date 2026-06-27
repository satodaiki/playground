// 2x32bit のシードを生成する。WASM 側の決定的 PRNG を毎回別系列で初期化するため
// 乱数と現在時刻を混ぜる。3 ページ共通。
export function makeSeed(): [number, number] {
  const r = () => Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  return [r(), (r() ^ (Date.now() & 0xffffffff)) >>> 0];
}
