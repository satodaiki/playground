export const STAGE_WIDTH = 12;
export const STAGE_HEIGHT = 20;

// ステージの初期化（すべて0で埋める）
export const createStage = () =>
  Array.from(Array(STAGE_HEIGHT), () =>
    new Array(STAGE_WIDTH).fill([0, 'clear'])
  );