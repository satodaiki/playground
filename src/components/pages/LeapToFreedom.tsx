import { useCallback, useEffect, useRef, useState } from 'react';

import BackLink from '@/components/atoms/BackLink';
import PageFooter from '@/components/atoms/PageFooter';
import SlidesLink from '@/components/atoms/SlidesLink';
import { useWasm } from '@/hooks/useWasm';
import { makeSeed } from '@/lib/seed';
import wasmUrl from '@/assets/leap_to_freedom.wasm?url';
import './LeapToFreedom.css';

import { HIGHSCORE_KEY, readHighscore } from './leap-to-freedom/constants';
import type { Phase, WasmExports } from './leap-to-freedom/constants';
import Hero from './leap-to-freedom/Hero';
import GameBoard from './leap-to-freedom/GameBoard';

export default function LeapToFreedom() {
  const { exports: w, status } = useWasm<WasmExports>(wasmUrl);

  // rAF クロージャから最新フェーズを参照するためのミラー。
  const phaseRef = useRef<Phase>('loading');
  const [phase, setPhase] = useState<Phase>('loading');
  const [finalScore, setFinalScore] = useState(0);
  const [highscore, setHighscore] = useState<number>(() => readHighscore());

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // WASM ロード状態を phase に反映する。playing/over はゲーム側でローカル管理する。
  useEffect(() => {
    if (status === 'ready') {
      setPhaseBoth('ready');
    } else if (status === 'error') {
      setPhaseBoth('error');
    }
  }, [status, setPhaseBoth]);

  const startGame = useCallback(() => {
    if (!w) {
      return;
    }
    const [s0, s1] = makeSeed();
    w.init(s0, s1);
    setPhaseBoth('playing');
  }, [w, setPhaseBoth]);

  // ワンボタン入力：プレイ中は重力反転、待機/終了中はゲーム開始。
  const onAction = useCallback(() => {
    if (!w) {
      return;
    }
    if (phaseRef.current === 'playing') {
      w.flip();
    } else if (phaseRef.current === 'ready' || phaseRef.current === 'over') {
      startGame();
    }
  }, [w, startGame]);

  const onGameOver = useCallback(
    (final: number) => {
      setFinalScore(final);
      setPhaseBoth('over');
      setHighscore((prev) => {
        if (final <= prev) {
          return prev;
        }
        localStorage.setItem(HIGHSCORE_KEY, String(final));
        return final;
      });
    },
    [setPhaseBoth],
  );

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
      <BackLink className="ltf-back" />
      <Hero />

      <main className="ltf-stage">
        <GameBoard
          exports={w}
          phase={phase}
          phaseRef={phaseRef}
          finalScore={finalScore}
          highscore={highscore}
          onPointer={onPointer}
          onGameOver={onGameOver}
        />

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
              <span className="ltf-flip-glyph" aria-hidden="true">
                ⇅
              </span>
              FLIP GRAVITY
              <kbd>SPACE</kbd>
            </>
          ) : (
            'START'
          )}
        </button>
      </main>

      <PageFooter className="ltf-foot">
        RUST → WEBASSEMBLY · 完全フロントエンド · <SlidesLink className="ltf-slides" />
      </PageFooter>
    </div>
  );
}
