import React, { useState } from 'react';
import { createStage } from '@/utils/tetlis/gameHelpers';

// Hooks
import { usePlayer } from '@/hooks/tetlis/usePlayer';
import { useStage } from '@/hooks/tetlis/useStage';

// Components
import Stage from '@/components/tetlis/Stage';

const Tetris = () => {
  const [dropTime, setDropTime] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  const [player, updatePlayerPos, resetPlayer] = usePlayer();
  const [stage, setStage] = useStage(player, resetPlayer);

  const movePlayer = dir => {
    // 本当はここで衝突判定(checkCollision)を行う
    updatePlayerPos({ x: dir, y: 0 });
  };

  const startGame = () => {
    // ゲームリセット処理
    setStage(createStage());
    resetPlayer();
    setGameOver(false);
  };

  const drop = () => {
    updatePlayerPos({ x: 0, y: 1, collided: false });
  };

  const dropPlayer = () => {
    drop();
  };

  // キーボード操作のハンドリング
  const move = ({ keyCode }) => {
    if (!gameOver) {
      if (keyCode === 37) { // Left Arrow
        movePlayer(-1);
      } else if (keyCode === 39) { // Right Arrow
        movePlayer(1);
      } else if (keyCode === 40) { // Down Arrow
        dropPlayer();
      }
    }
  };

  return (
    // キー操作を受け付けるためにtabIndexとoutlineの設定が必要
    <div 
      role="button" 
      tabIndex={0}
      onKeyDown={e => move(e)} 
      style={{ width: '100vw', height: '100vh', background: '#000', color: '#fff', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '40px' }}>
        <Stage stage={stage} />
        <aside style={{ padding: '20px' }}>
          {gameOver ? (
            <div style={{ color: 'red' }}>Game Over</div>
          ) : (
            <div>
              <button onClick={startGame} style={{ padding: '20px', cursor: 'pointer' }}>
                Start Game
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Tetris;