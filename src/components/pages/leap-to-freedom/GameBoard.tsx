import { useEffect, useRef } from 'react';

import { MAX_DT_MS } from './constants';
import type { Phase, WasmExports } from './constants';
import { draw } from './render';

// 盤面（距離ゲージ＋Canvas＋状態オーバーレイ）。描画ループ（rAF）を内部で回し、
// プレイ中のみ tick を進めてゲームオーバーを検出する。状態遷移自体はページが持つ。
export default function GameBoard({
  exports: w,
  phase,
  phaseRef,
  finalScore,
  highscore,
  onPointer,
  onGameOver,
}: {
  exports: WasmExports | null;
  phase: Phase;
  phaseRef: { current: Phase };
  finalScore: number;
  highscore: number;
  onPointer: (e: React.PointerEvent) => void;
  onGameOver: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 描画ループ。ライブのスコアは canvas に直接描くため毎フレームの再描画は行わない。
  useEffect(() => {
    if (phase === 'loading' || phase === 'error') {
      return;
    }
    const canvas = canvasRef.current;
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
          onGameOver(w.score());
        }
      }

      draw(ctx, w);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, w, phaseRef, onGameOver]);

  return (
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
            <p className="ltf-big">
              {finalScore}
              <i>m</i>
            </p>
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
  );
}
