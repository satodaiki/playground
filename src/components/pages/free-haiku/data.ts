// 自由律俳句ジェネレーターのデータ定義（語彙バンク）と永続キー。
export type WordBank = { label: string; words: string[] };
export type Poem = { lines: string[]; score: number };
export type Entry = { text: string; score: number };

// 語彙バンク。Rust の compose::BANK_COUNT (=6) と個数を一致させる契約。
// seg_bank(i,j) が返す index がこの配列の添字になる。
export const BANKS: WordBank[] = [
  {
    label: '季と空',
    words: [
      '春の雪', '夏のひかり', '秋のけはい', '冬の星', '夕立',
      '朝もや', '宵闇', '木枯らし', '陽炎', 'みなも', '遠雷',
    ],
  },
  {
    label: '風景',
    words: [
      '駅のホーム', '路地裏', '窓辺', '岬', 'ひとけのない坂',
      '水たまり', '渡り廊下', '夜の交差点', '空き地', '川べり', '屋上',
    ],
  },
  {
    label: '心',
    words: [
      'さみしさ', 'ときめき', 'あこがれ', 'とまどい', 'やすらぎ',
      'ためらい', 'こころもとなさ', 'いとおしさ', 'なつかしさ', 'かすかな痛み',
    ],
  },
  {
    label: 'うごき',
    words: [
      'ふりむく', 'こぼれる', 'ながれてゆく', 'ゆれている', '消えてゆく',
      'たちどまる', 'ほどける', 'にじむ', 'こだまする', 'まぎれてゆく',
    ],
  },
  {
    label: '光と色',
    words: [
      'あかね色', '銀のひかり', '群青', '透きとおる', 'にぶい影',
      'まばゆさ', '乳白', 'うす紅', 'ひかりの粒', '黒みがかった青',
    ],
  },
  {
    label: '余白',
    words: [
      '永遠', 'ひとひら', '沈黙', 'まばたき', 'ひとつの呼吸',
      '名もない時間', 'かすかな余韻', 'ふいの間', 'とおいざわめき', '無',
    ],
  },
];

export const HISTORY_KEY = 'free_haiku_history';
export const FAV_KEY = 'free_haiku_favorites';
export const HISTORY_LIMIT = 50;
