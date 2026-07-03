import { useEffect, useRef } from 'react';

import { makeSeed } from '@/lib/seed';

import { MAX_DT_MS, REDUCED_MOTION_SCALE, hitCage } from './constants';
import type { Phase, WasmExports } from './constants';
import { draw } from './render';

// 空（Canvas）。init・rAF ループ・リサイズ・ポインタ＝風・籠クリックでの解放を担う。
// 状態遷移（phase）自体はページが持ち、ここは wasm と描画に徹する。
export default function FlockCanvas({
  exports: w,
  phaseRef,
  onRelease,
}: {
  exports: WasmExports | null;
  phaseRef: { current: Phase };
  onRelease: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !w) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // jsdom 等 matchMedia 未実装の環境でも落ちないようガードする。
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeScale = reduced ? REDUCED_MOTION_SCALE : 1;

    // 実表示サイズにバックストアを合わせる。0 のとき（jsdom・非表示）は触らない。
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      w.resize(canvas.width, canvas.height);
    };
    fit();
    const [s0, s1] = makeSeed();
    w.init(s0, s1, canvas.width, canvas.height);
    window.addEventListener('resize', fit);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, MAX_DT_MS) * timeScale;
      last = now;
      if (canvas.width === 0 || canvas.height === 0) {
        return;
      }
      w.tick(dt);
      const count = w.bird_count();
      // メモリは grow で ArrayBuffer が差し替わり得るため、ビューは毎フレーム作り直す。
      const view = new Float32Array(w.memory.buffer, w.birds_ptr(), count * 4);
      const cage = { x: w.cage_x(), y: w.cage_y(), w: w.cage_w(), h: w.cage_h() };
      draw(ctx, view, count, cage, w.is_released() !== 0, now);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [w]);

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!w) {
      return;
    }
    const [x, y] = toLocal(e);
    w.set_pointer(x, y, 1);
  };

  const onPointerLeave = () => {
    w?.set_pointer(0, 0, 0);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!w || phaseRef.current !== 'caged') {
      return;
    }
    const [x, y] = toLocal(e);
    const cage = { x: w.cage_x(), y: w.cage_y(), w: w.cage_w(), h: w.cage_h() };
    if (hitCage(x, y, cage)) {
      w.release();
      onRelease();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="ftb-canvas"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    />
  );
}
