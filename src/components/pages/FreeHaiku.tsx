import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import haikuWasmUrl from '@/assets/free_haiku.wasm?url';
import './FreeHaiku.css';

// free_haiku.wasm のエクスポート。句の「構造」（行数・各行のセグメント数・
// 各セグメントが引く語彙バンク）と韻律スコアは Rust 側に閉じている。
// 語そのものの選択は pick() を使って TS 側で行う。
type WasmExports = {
  seed: (s0: number, s1: number) => void;
  pick: (n: number) => number;
  roll: () => number;
  line_len: (i: number) => number;
  seg_bank: (i: number, j: number) => number;
  score_reset: () => void;
  score_push: (len: number) => void;
  score_eval: () => number;
};

type WordBank = { label: string; words: string[] };
type Poem = { lines: string[]; score: number };
type Entry = { text: string; score: number };

// 語彙バンク。Rust の compose::BANK_COUNT (=6) と個数を一致させる契約。
// seg_bank(i,j) が返す index がこの配列の添字になる。
const BANKS: WordBank[] = [
  {
    label: '季と空',
    words: [
      '春の雪', '夏のひかり', '秋のけはい', '冬の星', '夕立',
      '朝もや', '宵闇', '木枯らし', '陽炎', 'みなも', '遠雷',
    ],
  },
  {
    label: '風景',
    words: [
      '駅のホーム', '路地裏', '窓辺', '岬', 'ひとけのない坂',
      '水たまり', '渡り廊下', '夜の交差点', '空き地', '川べり', '屋上',
    ],
  },
  {
    label: '心',
    words: [
      'さみしさ', 'ときめき', 'あこがれ', 'とまどい', 'やすらぎ',
      'ためらい', 'こころもとなさ', 'いとおしさ', 'なつかしさ', 'かすかな痛み',
    ],
  },
  {
    label: 'うごき',
    words: [
      'ふりむく', 'こぼれる', 'ながれてゆく', 'ゆれている', '消えてゆく',
      'たちどまる', 'ほどける', 'にじむ', 'こだまする', 'まぎれてゆく',
    ],
  },
  {
    label: '光と色',
    words: [
      'あかね色', '銀のひかり', '群青', '透きとおる', 'にぶい影',
      'まばゆさ', '乳白', 'うす紅', 'ひかりの粒', '黒みがかった青',
    ],
  },
  {
    label: '余白',
    words: [
      '永遠', 'ひとひら', '沈黙', 'まばたき', 'ひとつの呼吸',
      '名もない時間', 'かすかな余韻', 'ふいの間', 'とおいざわめき', '無',
    ],
  },
];

const HISTORY_KEY = 'free_haiku_history';
const FAV_KEY = 'free_haiku_favorites';
const HISTORY_LIMIT = 50;

function readList(key: string): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? (v as Entry[]) : [];
  } catch {
    return [];
  }
}
function writeList(key: string, list: Entry[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

function poemText(poem: Poem): string {
  return poem.lines.join('\n');
}
function oneLine(text: string): string {
  return text.split('\n').join(' / ');
}

function makeSeed(): [number, number] {
  const r = () => Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  return [r(), (r() ^ (Date.now() & 0xffffffff)) >>> 0];
}

// WASM を呼んで自由律俳句を 1 句生成する。
// 構造は roll/line_len/seg_bank、語の選択は pick、字数の韻律評価は score_* を使う。
function generate(w: WasmExports): Poem {
  const [s0, s1] = makeSeed();
  w.seed(s0, s1);

  const lineCount = w.roll() >>> 0;
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const segs = w.line_len(i) >>> 0;
    const parts: string[] = [];
    for (let j = 0; j < segs; j++) {
      const bank = BANKS[w.seg_bank(i, j) >>> 0];
      const word = bank.words[w.pick(bank.words.length) >>> 0];
      parts.push(word);
    }
    lines.push(parts.join(''));
  }

  w.score_reset();
  for (const line of lines) {
    w.score_push([...line].length);
  }
  const score = w.score_eval() | 0;

  return { lines, score };
}

export default function FreeHaiku() {
  const wasmRef = useRef<WasmExports | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [poem, setPoem] = useState<Poem | null>(null);
  const [genId, setGenId] = useState(0); // 再生成アニメ用キー
  // 永続データは初回描画時に localStorage から読み込む（lazy initializer）。
  const [history, setHistory] = useState<Entry[]>(() => readList(HISTORY_KEY));
  const [favorites, setFavorites] = useState<Entry[]>(() => readList(FAV_KEY));

  // 起動時: WASM のインスタンス化（外部 import なし・空オブジェクトで instantiate）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(haikuWasmUrl);
        const buf = await res.arrayBuffer();
        // コアは外部 import を持たないので空オブジェクトでインスタンス化できる。
        const { instance } = await WebAssembly.instantiate(buf, {});
        if (!cancelled) {
          wasmRef.current = instance.exports as unknown as WasmExports;
          setReady(true);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const compose = useCallback(() => {
    const w = wasmRef.current;
    if (!w) return;
    const p = generate(w);
    setPoem(p);
    setGenId((n) => n + 1);
    setHistory((prev) => {
      const next = [{ text: poemText(p), score: p.score }, ...prev].slice(0, HISTORY_LIMIT);
      writeList(HISTORY_KEY, next);
      return next;
    });
  }, []);

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
      <Link href="/">
        <a className="fh-back">← トップに戻る</a>
      </Link>

      <header className="fh-hero">
        <h1>自由律俳句</h1>
        <p className="fh-tagline">
          テーマ「自由」— 五・七・五に縛られず、ことばを置く。
        </p>
      </header>

      <main className="fh-layout">
        <section className="fh-stage">
          <div className="fh-paper">
            {error && (
              <div className="fh-error">
                WASM の読み込みに失敗しました。ビルドし直して再読み込みしてください。
              </div>
            )}
            {!error && !poem && (
              <div className="fh-placeholder">
                {ready ? '「詠む」を押して一句を生む' : '読み込み中…'}
              </div>
            )}
            {!error && poem && (
              <div key={genId} className="fh-poem">
                {poem.lines.map((line, i) => (
                  <p className="fh-line" key={i}>
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>

          {!error && poem && (
            <div className="fh-meta">
              <span className="fh-score" title="自由律らしさ（韻律スコア）">
                詩情 {poem.score}
              </span>
              <span className="fh-len">{poem.lines.length} 行</span>
            </div>
          )}

          <div className="fh-actions">
            <button className="fh-primary" onClick={compose} disabled={!ready}>
              {poem ? 'もう一句' : '詠む'}
            </button>
            <button className="fh-mini" onClick={toggleFavorite} disabled={!poem}>
              {isFavorite ? '★ お気に入り済' : '☆ お気に入り'}
            </button>
            <button className="fh-mini" onClick={copyText} disabled={!poem}>
              コピー
            </button>
          </div>
        </section>

        <aside className="fh-side">
          <div className="fh-panel">
            <div className="fh-panel-head">
              <h2>お気に入り</h2>
            </div>
            <ul className="fh-list">
              {favorites.length === 0 ? (
                <li className="fh-empty">お気に入りはまだありません</li>
              ) : (
                favorites.map((f, i) => (
                  <li key={i}>
                    <span className="fh-tag">詩情 {f.score}</span>
                    {oneLine(f.text)}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="fh-panel">
            <div className="fh-panel-head">
              <h2>履歴</h2>
              <button className="fh-mini fh-ghost" onClick={clearHistory}>
                クリア
              </button>
            </div>
            <ul className="fh-list">
              {history.length === 0 ? (
                <li className="fh-empty">まだ詠んでいません</li>
              ) : (
                history.map((h, i) => (
                  <li key={i}>
                    <span className="fh-tag">詩情 {h.score}</span>
                    {oneLine(h.text)}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </main>

      <footer className="fh-foot">Rust → WebAssembly / フロントエンド完結</footer>
    </div>
  );
}
