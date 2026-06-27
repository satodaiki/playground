// JIYU GACHA のデータ定義（発想パーツのワードバンクとレアリティ表）と永続キー。
export type Category = { label: string; cls: string; words: string[] };
export type Rarity = { key: string; cls: string; cardCls: string; label: string; title: string };
export type Part = { label: string; cls: string; word: string };
export type DrawResult = { rarityIndex: number; parts: Part[] };
export type Entry = { rarity: string; text: string };

// CATEGORIES[0..count) を使う。count はレアリティに応じて Rust が決める。
// レアリティが上がるほど企画が肉付けされる並び順:
//   N(2)=領域+ターゲット / R(3)=+技術 / SR(4)=+ひねり / SSR(5)=+禁断
export const CATEGORIES: Category[] = [
  {
    label: '領域',
    cls: 'cat-domain',
    words: [
      '防災・減災', '教育・学習', 'ヘルスケア・健康', '地域活性・観光',
      'フードロス削減', '高齢者支援', '子育て支援', '環境・サステナビリティ',
      '防犯・安全', '交通・モビリティ', '働き方・生産性', 'メンタルヘルス',
      'アクセシビリティ', '家計・お金', 'コミュニティづくり', '農業・一次産業',
      'ペットとの暮らし', '災害時の情報共有',
    ],
  },
  {
    label: 'ターゲット',
    cls: 'cat-target',
    words: [
      '一人暮らしの高齢者', '共働き家庭', '新社会人', '外国人観光客', '受験生',
      '子育て中の親', '地方の中小企業', '視覚に障害のある人', '単身赴任者',
      '介護をする家族', 'リモートワーカー', '部活動の学生', '商店街の店主',
      '災害避難者', 'ひとり親世帯', 'Uターン移住者',
    ],
  },
  {
    label: '技術',
    cls: 'cat-tech',
    words: [
      '生成AI / LLM', '位置情報(GPS)', '画像認識', '音声認識・合成',
      'AR(拡張現実)', 'IoTセンサー', 'QRコード', 'プッシュ通知',
      'リアルタイム通信', '地図API', 'チャットボット', 'レコメンド',
      'ウェアラブル連携', 'オフライン対応(PWA)', 'NFC / タッチ',
    ],
  },
  {
    label: 'ひねり',
    cls: 'cat-twist',
    words: [
      '操作はボタン1つだけ', '文字を使わず絵文字だけ', '30秒で価値を体感',
      '完全オフラインで動く', 'ゲーミフィケーションを入れる', '1日1回だけ使える',
      '家族で同時に使う', '音だけで完結', '完全匿名で使える', '通知ゼロ設計',
      'あえてアナログと連携', '使うほど人とつながる',
    ],
  },
  {
    label: '禁断',
    cls: 'cat-kindan',
    words: [
      '🔥予算・人員は無限', '🔥既存の法規制は一旦無視', '🔥10年後の技術が前提',
      '🔥失敗が許される世界で', '🔥世界中が同時に使う', '🔥AIが全部やってくれる前提で',
      '🔥物理法則を1つ破ってよい',
    ],
  },
];

export const RARITIES: Rarity[] = [
  { key: 'N', cls: 'r-n', cardCls: '', label: 'N', title: 'ノーマル' },
  { key: 'R', cls: 'r-r', cardCls: '', label: 'R', title: 'レア' },
  { key: 'SR', cls: 'r-sr', cardCls: 'jg-rcard-sr', label: 'SR', title: 'スーパーレア' },
  { key: 'SSR', cls: 'r-ssr', cardCls: 'jg-rcard-ssr', label: 'SSR', title: 'スーパースペシャルレア' },
];

export const HISTORY_KEY = 'jiyu_gacha_history';
export const FAV_KEY = 'jiyu_gacha_favorites';
export const HISTORY_LIMIT = 50;
