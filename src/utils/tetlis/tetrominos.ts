// 各ブロックの形状と色を定義
export const TETROMINOS = {
  0: { shape: [[0]], color: '0, 0, 0' }, // 空白
  I: {
    shape: [
      [0, 'I', 0, 0],
      [0, 'I', 0, 0],
      [0, 'I', 0, 0],
      [0, 'I', 0, 0],
    ],
    color: '80, 227, 230',
  },
  J: {
    shape: [
      [0, 'J', 0],
      [0, 'J', 0],
      ['J', 'J', 0],
    ],
    color: '36, 95, 223',
  },
  // ...他のL, O, S, T, Zも同様に定義（長くなるので省略）
  // 動作確認用にとりあえずIとJがあれば動きます
};

// ランダムにミノを生成する関数
export const randomTetromino = () => {
  const tetrominos = 'IJ'; // 全種類実装したら 'IJLOSTZ' にする
  const randTetromino =
    tetrominos[Math.floor(Math.random() * tetrominos.length)];
  return TETROMINOS[randTetromino];
};