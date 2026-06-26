import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import gachaWasmUrl from '@/assets/gacha_core.wasm?url';
import './JiyuGacha.css';

// WASM コアエンジン(gacha_core.wasm)のエクスポート。
// ロジック（乱数・レアリティ・組み合わせ数）は Rust 側に閉じている。
type WasmExports = {
  seed: (s0: number, s1: number) => void;
  next_u32: () => number;
  pick: (n: number) => number;
  roll_rarity: () => number;
  parts_count_for: (rarity: number) => number;
};

type Category = { label: string; cls: string; words: string[] };
type Rarity = { key: string; cls: string; cardCls: string; label: string; title: string };
type Part = { label: string; cls: string; word: string };
type DrawResult = { rarityIndex: number; parts: Part[] };
type Entry = { rarity: string; text: string };

// ---- 発想パーツのワードバンク ----
// CATEGORIES[0..count) を使う。count はレアリティに応じて Rust が決める。
// レアリティが上がるほど企画が肉付けされる並び順:
//   N(2)=領域+ターゲット / R(3)=+技術 / SR(4)=+ひねり / SSR(5)=+禁断
const CATEGORIES: Category[] = [
  {
    label: '領域',
    cls: 'cat-domain',
    words: [
      '防災・減災', '教育・学習', 'ヘルスケア・健康', '地域活性・観光',
      'フードロス削減', '高齢者支援', '子育て支援', '環境・サステナビリティ',
      '防犯・安全', '交通・モビリティ', '働き方・生産性', 'メンタルヘルス',
      'アクセシビリティ', '家計・お金', 'コミュニティづくり', '農業・一次産業',
      'ペットとの暮らし', '災害時の情報共有',
    ],
  },
  {
    label: 'ターゲット',
    cls: 'cat-target',
    words: [
      '一人暮らしの高齢者', '共働き家庭', '新社会人', '外国人観光客', '受験生',
      '子育て中の親', '地方の中小企業', '視覚に障害のある人', '単身赴任者',
      '介護をする家族', 'リモートワーカー', '部活動の学生', '商店街の店主',
      '災害避難者', 'ひとり親世帯', 'Uターン移住者',
    ],
  },
  {
    label: '技術',
    cls: 'cat-tech',
    words: [
      '生成AI / LLM', '位置情報(GPS)', '画像認識', '音声認識・合成',
      'AR(拡張現実)', 'IoTセンサー', 'QRコード', 'プッシュ通知',
      'リアルタイム通信', '地図API', 'チャットボット', 'レコメンド',
      'ウェアラブル連携', 'オフライン対応(PWA)', 'NFC / タッチ',
    ],
  },
  {
    label: 'ひねり',
    cls: 'cat-twist',
    words: [
      '操作はボタン1つだけ', '文字を使わず絵文字だけ', '30秒で価値を体感',
      '完全オフラインで動く', 'ゲーミフィケーションを入れる', '1日1回だけ使える',
      '家族で同時に使う', '音だけで完結', '完全匿名で使える', '通知ゼロ設計',
      'あえてアナログと連携', '使うほど人とつながる',
    ],
  },
  {
    label: '禁断',
    cls: 'cat-kindan',
    words: [
      '🔥予算・人員は無限', '🔥既存の法規制は一旦無視', '🔥10年後の技術が前提',
      '🔥失敗が許される世界で', '🔥世界中が同時に使う', '🔥AIが全部やってくれる前提で',
      '🔥物理法則を1つ破ってよい',
    ],
  },
];

const RARITIES: Rarity[] = [
  { key: 'N', cls: 'r-n', cardCls: '', label: 'N', title: 'ノーマル' },
  { key: 'R', cls: 'r-r', cardCls: '', label: 'R', title: 'レア' },
  { key: 'SR', cls: 'r-sr', cardCls: 'jg-rcard-sr', label: 'SR', title: 'スーパーレア' },
  { key: 'SSR', cls: 'r-ssr', cardCls: 'jg-rcard-ssr', label: 'SSR', title: 'スーパースペシャルレア' },
];

const HISTORY_KEY = 'jiyu_gacha_history';
const FAV_KEY = 'jiyu_gacha_favorites';
const HISTORY_LIMIT = 50;

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

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

function ideaText(result: DrawResult): string {
  return result.parts.map((p) => `【${p.label}】${p.word}`).join(' × ');
}

function rarityMeta(key: string): Rarity {
  return RARITIES.find((r) => r.key === key) ?? RARITIES[0];
}

function makeSeed(): [number, number] {
  const r = () => Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  return [r(), (r() ^ (Date.now() & 0xffffffff)) >>> 0];
}

// WASM を呼んで 1 回ガチャを引く。
function draw(w: WasmExports): DrawResult {
  const [s0, s1] = makeSeed();
  w.seed(s0, s1);
  const rarityIndex = w.roll_rarity() >>> 0;
  const count = w.parts_count_for(rarityIndex) >>> 0;
  const parts: Part[] = [];
  for (let i = 0; i < count && i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const idx = w.pick(cat.words.length) >>> 0;
    parts.push({ label: cat.label, cls: cat.cls, word: cat.words[idx] });
  }
  return { rarityIndex, parts };
}

export default function JiyuGacha() {
  const wasmRef = useRef<WasmExports | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [drawId, setDrawId] = useState(0); // カードのアニメ再生用キー
  const [history, setHistory] = useState<Entry[]>([]);
  const [favorites, setFavorites] = useState<Entry[]>([]);

  // 起動時: 永続データの読み込みと WASM のインスタンス化。
  useEffect(() => {
    setHistory(readList(HISTORY_KEY));
    setFavorites(readList(FAV_KEY));

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(gachaWasmUrl);
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

  const pull = useCallback(async () => {
    const w = wasmRef.current;
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
  }, [rolling]);

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
      <Link href="/">
        <a className="jg-back">← トップに戻る</a>
      </Link>

      <header className="jg-hero">
        <h1>JIYU&nbsp;GACHA</h1>
        <p className="jg-tagline">テーマ「自由」— ハッカソンのお題を、引き当てろ。</p>
      </header>

      <main className="jg-layout">
        <section className="jg-gacha-area">
          <div className={`jg-machine${shaking ? ' jg-shaking' : ''}`}>
            <div className="jg-dome">
              <div className="jg-capsule jg-c1" />
              <div className="jg-capsule jg-c2" />
              <div className="jg-capsule jg-c3" />
            </div>
            <div className="jg-slot" />
            <div className="jg-brand">JIYU</div>
          </div>

          <button className="jg-lever" onClick={pull} disabled={!ready || rolling}>
            {ready ? 'レバーを引く' : '読み込み中…'}
          </button>

          <div className="jg-result">
            {error && (
              <div className="jg-error">
                WASM の読み込みに失敗しました。ビルドし直して再読み込みしてください。
              </div>
            )}
            {!error && rolling && <div className="jg-rolling">ガチャガチャ…</div>}
            {!error && !rolling && result && rarity && (
              <div
                key={drawId}
                className={`jg-card ${rarity.cls} ${rarity.cardCls}${flash ? ' jg-flash' : ''}`}
              >
                <div className={`jg-rarity-badge ${rarity.cls}`} title={rarity.title}>
                  {rarity.label}
                </div>
                <div className="jg-chips">
                  {result.parts.map((p, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      {i > 0 && <span className="jg-cross">×</span>}
                      <span className={`jg-chip ${p.cls}`}>
                        <span className="jg-chip-label">{p.label}</span>
                        <span className="jg-chip-word">{p.word}</span>
                      </span>
                    </span>
                  ))}
                </div>
                <div className="jg-card-actions">
                  <button className="jg-mini" onClick={toggleFavorite}>
                    {isFavorite ? '★ お気に入り済' : '☆ お気に入り'}
                  </button>
                  <button className="jg-mini" onClick={copyText}>
                    コピー
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="jg-side">
          <div className="jg-panel">
            <div className="jg-panel-head">
              <h2>お気に入り</h2>
            </div>
            <ul className="jg-list">
              {favorites.length === 0 ? (
                <li className="jg-empty">お気に入りはまだありません</li>
              ) : (
                favorites.map((f, i) => (
                  <li key={i}>
                    <span className={`jg-tag ${rarityMeta(f.rarity).cls}`}>{f.rarity}</span>
                    {f.text}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="jg-panel">
            <div className="jg-panel-head">
              <h2>履歴</h2>
              <button className="jg-mini jg-ghost" onClick={clearHistory}>
                クリア
              </button>
            </div>
            <ul className="jg-list">
              {history.length === 0 ? (
                <li className="jg-empty">まだ引いていません</li>
              ) : (
                history.map((h, i) => (
                  <li key={i}>
                    <span className={`jg-tag ${rarityMeta(h.rarity).cls}`}>{h.rarity}</span>
                    {h.text}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </main>

      <footer className="jg-foot">Rust → WebAssembly / フロントエンド完結</footer>
    </div>
  );
}
