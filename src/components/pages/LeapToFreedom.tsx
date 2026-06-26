import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import wasmUrl from '@/assets/leap_to_freedom.wasm?url';
import './LeapToFreedom.css';

// leap_to_freedom.wasm のエクスポート（整数/浮動小数のみの C ABI）。
// 描画に必要なレイアウト値もゲッターで取り、契約の単一定義点を Rust 側に置く。
type WasmExports = {
  init: (s0: number, s1: number) => void;
  flip: () => void;
  tick: (dtMs: number) => void;
  player_y: () => number;
  player_vel: () => number;
  obstacle_count: () => number;
  obstacle_x: (i: number) => number;
  obstacle_y: (i: number) => number;
  obstacle_w: (i: number) => number;
  obstacle_h: (i: number) => number;
  score: () => number;
  is_over: () => number;
  field_w: () => number;
  field_h: () => number;
  player_x: () => number;
  player_w: () => number;
  player_h: () => number;
};

// 描画に属する値（色）は TS 側に置く。
// プレイヤーは重力が下向き＝拘束のとき amber、上向き＝解放のとき mint。
// この 2 色がページ全体の配色（amber=下/拘束・mint=上/自由）の出処になっている。
const COLORS = {
  bgTop: '#0b1020',
  bgBottom: '#0f1730',
  wall: '#39456f',
  wallEdge: '#5b6aa3',
  playerDown: '#ffc24b',
  playerUp: '#6ff0c0',
  grid: 'rgba(111, 240, 192, 0.06)',
  hud: '#eef2ff',
} as const;

type Phase = 'loading' | 'error' | 'ready' | 'playing' | 'over';

const HIGHSCORE_KEY = 'leap_to_freedom_highscore';
// 1 フレームの最大 dt（タブ復帰などの巨大 dt を抑え、すり抜けを防ぐ）。
const MAX_DT_MS = 50;

function readHighscore(): number {
  const raw = localStorage.getItem(HIGHSCORE_KEY);
  if (raw === null) {
    return 0;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function makeSeed(): [number, number] {
  const r = () => Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  return [r(), (r() ^ (Date.now() & 0xffffffff)) >>> 0];
}

function draw(ctx: CanvasRenderingContext2D, w: WasmExports) {
  const fw = w.field_w();
  const fh = w.field_h();

  const grad = ctx.createLinearGradient(0, 0, 0, fh);
  grad.addColorStop(0, COLORS.bgTop);
  grad.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, fw, fh);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= fw; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, fh);
    ctx.stroke();
  }

  const n = w.obstacle_count();
  for (let i = 0; i < n; i++) {
    const ox = w.obstacle_x(i);
    const oy = w.obstacle_y(i);
    const ow = w.obstacle_w(i);
    const oh = w.obstacle_h(i);
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(ox, oy, ow, oh);
    ctx.fillStyle = COLORS.wallEdge;
    ctx.fillRect(ox, oy, ow, 3);
    ctx.fillRect(ox, oy + oh - 3, ow, 3);
  }

  // プレイヤー（重力の向きで色を変え「跳躍」を表現）。
  const px = w.player_x();
  const py = w.player_y();
  ctx.fillStyle = w.player_vel() >= 0 ? COLORS.playerDown : COLORS.playerUp;
  ctx.fillRect(px, py, w.player_w(), w.player_h());

  ctx.fillStyle = COLORS.hud;
  ctx.font = 'bold 20px "Space Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`${w.score()} m`, 14, 12);
}

export default function LeapToFreedom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<WasmExports | null>(null);
  // rAF クロージャから最新フェーズを参照するためのミラー。
  const phaseRef = useRef<Phase>('loading');

  const [phase, setPhase] = useState<Phase>('loading');
  const [finalScore, setFinalScore] = useState(0);
  const [highscore, setHighscore] = useState<number>(() => readHighscore());

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // 起動時: WASM のインスタンス化（外部 import なし・空オブジェクトで instantiate）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(wasmUrl);
        const buf = await res.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(buf, {});
        if (cancelled) {
          return;
        }
        wasmRef.current = instance.exports as unknown as WasmExports;
        setPhaseBoth('ready');
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setPhaseBoth('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPhaseBoth]);

  // 描画ループ（requestAnimationFrame）。プレイ中のみ tick を進める。
  // ライブのスコアは canvas に直接描くため、毎フレームの React 再描画は行わない。
  useEffect(() => {
    if (phase === 'loading' || phase === 'error') {
      return;
    }
    const canvas = canvasRef.current;
    const w = wasmRef.current;
    if (!canvas || !w) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    // バックストアの解像度はフィールド定数（Rust 側の単一定義点）に合わせる。
    canvas.width = w.field_w();
    canvas.height = w.field_h();

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(now - last, MAX_DT_MS);
      last = now;

      if (phaseRef.current === 'playing') {
        w.tick(dt);
        if (w.is_over() !== 0) {
          const final = w.score();
          setFinalScore(final);
          setPhaseBoth('over');
          setHighscore((prev) => {
            if (final <= prev) {
              return prev;
            }
            localStorage.setItem(HIGHSCORE_KEY, String(final));
            return final;
          });
        }
      }

      draw(ctx, w);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, setPhaseBoth]);

  const startGame = useCallback(() => {
    const w = wasmRef.current;
    if (!w) {
      return;
    }
    const [s0, s1] = makeSeed();
    w.init(s0, s1);
    setPhaseBoth('playing');
  }, [setPhaseBoth]);

  // ワンボタン入力：プレイ中は重力反転、待機/終了中はゲーム開始。
  const onAction = useCallback(() => {
    const w = wasmRef.current;
    if (!w) {
      return;
    }
    if (phaseRef.current === 'playing') {
      w.flip();
    } else if (phaseRef.current === 'ready' || phaseRef.current === 'over') {
      startGame();
    }
  }, [startGame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        onAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAction]);

  const onPointer = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      onAction();
    },
    [onAction],
  );

  return (
    <div className="ltf-root">
      <Link href="/">
        <a className="ltf-back">← トップに戻る</a>
      </Link>

      <header className="ltf-hero">
        <div className="ltf-titleblock">
          <h1 className="ltf-title">LEAP TO FREEDOM</h1>
          <div className="ltf-horizon">
            <span className="ltf-axis" aria-hidden="true">↕</span>
          </div>
          <span className="ltf-title ltf-title--echo" aria-hidden="true">
            LEAP TO FREEDOM
          </span>
        </div>
        <p className="ltf-tagline">
          重力は、ただの初期設定だ。ワンボタンで上下を反転し、
          迫る壁の<em>あいだ</em>を抜けてゆけ。
        </p>
      </header>

      <main className="ltf-stage">
        <div className="ltf-field">
          <div className="ltf-gauge" aria-hidden="true">
            <span className="ltf-gauge-label">DIST</span>
            <span className="ltf-gauge-unit">m</span>
          </div>

          <div className="ltf-board" onPointerDown={onPointer}>
            <canvas ref={canvasRef} className="ltf-canvas" />

            {phase === 'loading' && (
              <div className="ltf-overlay">
                <p className="ltf-sub">読み込み中…</p>
              </div>
            )}

            {phase === 'error' && (
              <div className="ltf-overlay ltf-error">
                <p className="ltf-big">読み込み失敗</p>
                <p className="ltf-sub">
                  WASM を読み込めませんでした。ビルドし直して再読み込みしてください。
                </p>
              </div>
            )}

            {phase === 'ready' && (
              <div className="ltf-overlay">
                <p className="ltf-kicker">ONE BUTTON · GRAVITY FLIP</p>
                <p className="ltf-big">重力を、反転しろ</p>
                <p className="ltf-sub">Space / クリック / タップ で上下が入れ替わる</p>
                <span className="ltf-cta">タップでスタート</span>
              </div>
            )}

            {phase === 'over' && (
              <div className="ltf-overlay">
                <p className="ltf-kicker">FALLEN · 落下</p>
                <p className="ltf-big">{finalScore}<i>m</i></p>
                <p className="ltf-sub">
                  {finalScore >= highscore && finalScore > 0
                    ? '自己ベスト更新'
                    : `ベスト ${highscore} m`}
                </p>
                <span className="ltf-cta">タップでリスタート</span>
              </div>
            )}
          </div>
        </div>

        <div className="ltf-hud">
          <span className="ltf-stat">
            <em>BEST DISTANCE</em>
            <b>
              {highscore}
              <i>m</i>
            </b>
          </span>
        </div>

        <button
          className="ltf-flip"
          onClick={onAction}
          disabled={phase === 'loading' || phase === 'error'}
        >
          {phase === 'playing' ? (
            <>
              <span className="ltf-flip-glyph" aria-hidden="true">⇅</span>
              FLIP GRAVITY
              <kbd>SPACE</kbd>
            </>
          ) : (
            'START'
          )}
        </button>
      </main>

      <footer className="ltf-foot">RUST → WEBASSEMBLY · 完全フロントエンド</footer>
    </div>
  );
}
