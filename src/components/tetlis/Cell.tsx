import React from 'react';
import { TETROMINOS } from '@/utils/tetlis/tetrominos';

// React.memoで再レンダリングを最適化（必須テクニック）
const Cell = ({ type }) => (
  <div style={{
    width: 'auto',
    background: `rgba(${TETROMINOS[type] ? TETROMINOS[type].color : '0,0,0'}, 0.8)`,
    border: type === 0 ? '0px solid' : '4px solid',
    borderBottomColor: `rgba(${TETROMINOS[type] ? TETROMINOS[type].color : '0,0,0'}, 0.1)`,
    borderRightColor: `rgba(${TETROMINOS[type] ? TETROMINOS[type].color : '0,0,0'}, 1)`,
    borderTopColor: `rgba(${TETROMINOS[type] ? TETROMINOS[type].color : '0,0,0'}, 1)`,
    borderLeftColor: `rgba(${TETROMINOS[type] ? TETROMINOS[type].color : '0,0,0'}, 0.3)`,
  }} />
);

export default React.memo(Cell);