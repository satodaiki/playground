import { useCallback, useState } from 'react';

import BackLink from '@/components/atoms/BackLink';
import PageFooter from '@/components/atoms/PageFooter';
import ListPanel from '@/components/molecules/ListPanel';
import { useWasm } from '@/hooks/useWasm';
import { readList, writeList } from '@/lib/storage';
import gachaWasmUrl from '@/assets/gacha_core.wasm?url';
import './JiyuGacha.css';

import { FAV_KEY, HISTORY_KEY, HISTORY_LIMIT, RARITIES } from './jiyu-gacha/data';
import type { DrawResult, Entry } from './jiyu-gacha/data';
import { draw, ideaText, rarityMeta, type WasmExports } from './jiyu-gacha/draw';
import Hero from './jiyu-gacha/Hero';
import GachaMachine from './jiyu-gacha/GachaMachine';
import ResultCard from './jiyu-gacha/ResultCard';

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

export default function JiyuGacha() {
  const { exports: w, status } = useWasm<WasmExports>(gachaWasmUrl);
  const ready = status === 'ready';
  const error = status === 'error';

  const [rolling, setRolling] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [drawId, setDrawId] = useState(0); // カードのアニメ再生用キー
  const [history, setHistory] = useState<Entry[]>(() => readList<Entry>(HISTORY_KEY));
  const [favorites, setFavorites] = useState<Entry[]>(() => readList<Entry>(FAV_KEY));

  const pull = useCallback(async () => {
    if (rolling || !w) return;
    setRolling(true);
    setResult(null);
    setShaking(true);
    await sleep(700);
    setShaking(false);

    const r = draw(w);
    setResult(r);
    setDrawId((n) => n + 1);

    setHistory((prev) => {
      const next = [{ rarity: RARITIES[r.rarityIndex].key, text: ideaText(r) }, ...prev].slice(
        0,
        HISTORY_LIMIT,
      );
      writeList(HISTORY_KEY, next);
      return next;
    });
    setRolling(false);
  }, [rolling, w]);

  const currentText = result ? ideaText(result) : '';
  const isFavorite = favorites.some((f) => f.text === currentText);

  const toggleFavorite = useCallback(() => {
    if (!result) return;
    const text = ideaText(result);
    const rarityKey = RARITIES[result.rarityIndex].key;
    setFavorites((prev) => {
      const at = prev.findIndex((f) => f.text === text);
      const next = at >= 0 ? prev.filter((_, i) => i !== at) : [{ rarity: rarityKey, text }, ...prev];
      writeList(FAV_KEY, next);
      return next;
    });
  }, [result]);

  const copyText = useCallback(() => {
    if (currentText) void navigator.clipboard?.writeText(currentText);
  }, [currentText]);

  const clearHistory = useCallback(() => {
    writeList(HISTORY_KEY, []);
    setHistory([]);
  }, []);

  const rarity = result ? RARITIES[result.rarityIndex] : null;
  const flash = rarity?.key === 'SR' || rarity?.key === 'SSR';

  return (
    <div className="jg-root">
      <BackLink className="jg-back" />
      <Hero />

      <main className="jg-layout">
        <section className="jg-gacha-area">
          <GachaMachine ready={ready} rolling={rolling} shaking={shaking} onPull={pull} />

          <div className="jg-result">
            {error && (
              <div className="jg-error">
                WASM の読み込みに失敗しました。ビルドし直して再読み込みしてください。
              </div>
            )}
            {!error && rolling && <div className="jg-rolling">ガチャガチャ…</div>}
            {!error && !rolling && result && rarity && (
              <ResultCard
                key={drawId}
                result={result}
                rarity={rarity}
                flash={flash}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                onCopy={copyText}
              />
            )}
          </div>
        </section>

        <aside className="jg-side">
          <ListPanel
            prefix="jg"
            title="お気に入り"
            items={favorites}
            emptyText="お気に入りはまだありません"
            renderItem={(f) => (
              <>
                <span className={`jg-tag ${rarityMeta(f.rarity).cls}`}>{f.rarity}</span>
                {f.text}
              </>
            )}
          />
          <ListPanel
            prefix="jg"
            title="履歴"
            items={history}
            emptyText="まだ引いていません"
            onClear={clearHistory}
            renderItem={(h) => (
              <>
                <span className={`jg-tag ${rarityMeta(h.rarity).cls}`}>{h.rarity}</span>
                {h.text}
              </>
            )}
          />
        </aside>
      </main>

      <PageFooter className="jg-foot">Rust → WebAssembly / フロントエンド完結</PageFooter>
    </div>
  );
}
