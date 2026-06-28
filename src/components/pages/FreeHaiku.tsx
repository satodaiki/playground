import { useCallback, useState } from 'react';

import BackLink from '@/components/atoms/BackLink';
import PageFooter from '@/components/atoms/PageFooter';
import SlidesLink from '@/components/atoms/SlidesLink';
import ListPanel from '@/components/molecules/ListPanel';
import { useWasm } from '@/hooks/useWasm';
import { readList, writeList } from '@/lib/storage';
import haikuWasmUrl from '@/assets/free_haiku.wasm?url';
import './FreeHaiku.css';

import { FAV_KEY, HISTORY_KEY, HISTORY_LIMIT } from './free-haiku/data';
import type { Entry, Poem } from './free-haiku/data';
import { generate, oneLine, poemText, type WasmExports } from './free-haiku/compose';
import Hero from './free-haiku/Hero';
import PoemStage from './free-haiku/PoemStage';

export default function FreeHaiku() {
  const { exports: w, status } = useWasm<WasmExports>(haikuWasmUrl);
  const ready = status === 'ready';
  const error = status === 'error';

  const [poem, setPoem] = useState<Poem | null>(null);
  const [genId, setGenId] = useState(0); // 再生成アニメ用キー
  const [history, setHistory] = useState<Entry[]>(() => readList<Entry>(HISTORY_KEY));
  const [favorites, setFavorites] = useState<Entry[]>(() => readList<Entry>(FAV_KEY));

  const compose = useCallback(() => {
    if (!w) return;
    const p = generate(w);
    setPoem(p);
    setGenId((n) => n + 1);
    setHistory((prev) => {
      const next = [{ text: poemText(p), score: p.score }, ...prev].slice(0, HISTORY_LIMIT);
      writeList(HISTORY_KEY, next);
      return next;
    });
  }, [w]);

  const currentText = poem ? poemText(poem) : '';
  const isFavorite = favorites.some((f) => f.text === currentText);

  const toggleFavorite = useCallback(() => {
    if (!poem) return;
    const text = poemText(poem);
    setFavorites((prev) => {
      const at = prev.findIndex((f) => f.text === text);
      const next =
        at >= 0 ? prev.filter((_, i) => i !== at) : [{ text, score: poem.score }, ...prev];
      writeList(FAV_KEY, next);
      return next;
    });
  }, [poem]);

  const copyText = useCallback(() => {
    if (currentText) void navigator.clipboard?.writeText(currentText);
  }, [currentText]);

  const clearHistory = useCallback(() => {
    writeList(HISTORY_KEY, []);
    setHistory([]);
  }, []);

  return (
    <div className="fh-root">
      <BackLink className="fh-back" />
      <Hero />

      <main className="fh-layout">
        <PoemStage
          error={error}
          ready={ready}
          poem={poem}
          genId={genId}
          isFavorite={isFavorite}
          onCompose={compose}
          onToggleFavorite={toggleFavorite}
          onCopy={copyText}
        />

        <aside className="fh-side">
          <ListPanel
            prefix="fh"
            title="お気に入り"
            items={favorites}
            emptyText="お気に入りはまだありません"
            renderItem={(f) => (
              <>
                <span className="fh-tag">詩情 {f.score}</span>
                {oneLine(f.text)}
              </>
            )}
          />
          <ListPanel
            prefix="fh"
            title="履歴"
            items={history}
            emptyText="まだ詠んでいません"
            onClear={clearHistory}
            renderItem={(h) => (
              <>
                <span className="fh-tag">詩情 {h.score}</span>
                {oneLine(h.text)}
              </>
            )}
          />
        </aside>
      </main>

      <PageFooter className="fh-foot">
        Rust → WebAssembly / フロントエンド完結 · <SlidesLink className="fh-slides" />
      </PageFooter>
    </div>
  );
}
