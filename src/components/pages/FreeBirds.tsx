import { useCallback, useEffect, useRef, useState } from 'react';

import BackLink from '@/components/atoms/BackLink';
import PageFooter from '@/components/atoms/PageFooter';
import { useWasm } from '@/hooks/useWasm';
import wasmUrl from '@/assets/free_birds.wasm?url';
import './FreeBirds.css';

import type { Phase, WasmExports } from './free-birds/constants';
import Hero from './free-birds/Hero';
import FlockCanvas from './free-birds/FlockCanvas';

export default function FreeBirds() {
  const { exports: w, status } = useWasm<WasmExports>(wasmUrl);

  // rAF・ポインタハンドラから最新フェーズを参照するためのミラー。
  const phaseRef = useRef<Phase>('loading');
  const [phase, setPhase] = useState<Phase>('loading');

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    if (status === 'ready') {
      setPhaseBoth('caged');
    } else if (status === 'error') {
      setPhaseBoth('error');
    }
  }, [status, setPhaseBoth]);

  // 籠クリック（FlockCanvas 内で release 済み）からの通知。
  const onRelease = useCallback(() => setPhaseBoth('released'), [setPhaseBoth]);

  // ボタン：開ける⇄戻す。キーボード操作でも解放できる導線。
  const onToggle = useCallback(() => {
    if (!w) {
      return;
    }
    if (phaseRef.current === 'caged') {
      w.release();
      setPhaseBoth('released');
    } else if (phaseRef.current === 'released') {
      w.reset();
      setPhaseBoth('caged');
    }
  }, [w, setPhaseBoth]);

  return (
    <div className="ftb-root">
      <BackLink className="ftb-back" />
      <Hero released={phase === 'released'} />

      <main className="ftb-stage">
        <div className="ftb-sky-frame">
          <FlockCanvas exports={w} phaseRef={phaseRef} onRelease={onRelease} />

          {phase === 'loading' && (
            <div className="ftb-overlay">
              <p>読み込み中…</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="ftb-overlay ftb-error">
              <p>WASM を読み込めませんでした。ビルドし直して再読み込みしてください。</p>
            </div>
          )}
        </div>

        <button
          className="ftb-door"
          onClick={onToggle}
          disabled={phase === 'loading' || phase === 'error'}
        >
          {phase === 'released' ? '籠に戻す' : '扉を開ける'}
        </button>
      </main>

      <PageFooter className="ftb-foot">
        RUST → WEBASSEMBLY · BOIDS · 完全フロントエンド
      </PageFooter>
    </div>
  );
}
