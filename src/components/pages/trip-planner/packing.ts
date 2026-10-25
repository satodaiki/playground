export type PackingItem = {
  id: string;
  name: string;
  reason: string;
  checked: boolean;
  custom: boolean;
};

export type PackingDraft = {
  destination: string;
  purpose: string;
  activities: string[];
  items: PackingItem[];
  generatedFor: string | null;
};

type Suggestion = { id: string; name: string };
type Activity = { id: string; label: string; pattern: RegExp; items: Suggestion[] };

const SUN: Suggestion = { id: 'sun', name: '日焼け止め・帽子' };
const TOWEL: Suggestion = { id: 'towel', name: 'タオル' };
const WATER: Suggestion = { id: 'water', name: '飲み物・水筒' };
const RAIN: Suggestion = { id: 'rain', name: '雨具' };
const WARM: Suggestion = { id: 'warm', name: '防寒着・手袋' };

export const ACTIVITIES: Activity[] = [
  { id: 'ski', label: 'スキー・スノーボード', pattern: /スキー|スノボ|スノーボード|ゲレンデ|ski|snowboard/, items: [
    { id: 'ski-gear', name: 'スキー板・ストックまたはスノーボード（レンタル予約でも可）' },
    { id: 'ski-boots', name: 'スキー・スノーボード用ブーツ' },
    { id: 'ski-wear', name: 'スノーウェア・防水グローブ' },
    { id: 'ski-protection', name: 'ゴーグル・ヘルメット' },
    { id: 'ski-pass', name: 'リフト券・レンタル予約の控え' }, WARM, SUN,
  ] },
  { id: 'beach', label: '海・ビーチ', pattern: /海水浴|ビーチ|海辺|海岸|海で|海に|海へ|(?:^|\s)海(?:\s|$)|プール|beach|swim/, items: [
    { id: 'swimwear', name: '水着・ラッシュガード' }, TOWEL,
    { id: 'sandals', name: 'ビーチサンダル' },
    { id: 'waterproof', name: '防水バッグ・濡れたものを入れる袋' }, SUN, WATER,
  ] },
  { id: 'surf', label: 'サーフィン', pattern: /サーフ|surf/, items: [
    { id: 'surfboard', name: 'サーフボード（レンタル予約でも可）' },
    { id: 'surf-leash', name: 'リーシュコード・ワックス' },
    { id: 'wetsuit', name: '水温に合うウェットスーツ' },
    { id: 'waterproof', name: '防水バッグ・濡れたものを入れる袋' }, TOWEL, SUN, WATER,
  ] },
  { id: 'hike', label: '登山・ハイキング', pattern: /登山|ハイキング|トレッキング|山登り|hiking|trekking/, items: [
    { id: 'hiking-shoes', name: '歩くコースに合う登山靴' },
    { id: 'trail-map', name: '登山地図・オフラインのルート' },
    { id: 'light', name: 'ヘッドライト・予備電池' },
    { id: 'food', name: '行動食・非常食' },
    { id: 'first-aid', name: '救急用品' }, WATER, RAIN, WARM, SUN,
  ] },
  { id: 'camp', label: 'キャンプ', pattern: /キャンプ|camp/, items: [
    { id: 'tent', name: 'テント・ペグ（施設の備品も確認）' },
    { id: 'sleeping', name: '寝袋・マット' },
    { id: 'light', name: 'ヘッドライト・予備電池' },
    { id: 'cookware', name: '食材・調理道具・食器（施設のルールを確認）' },
    { id: 'camp-booking', name: 'キャンプ場の予約・受付情報' },
    { id: 'trash', name: 'ごみ袋' }, WATER, RAIN, WARM,
  ] },
  { id: 'onsen', label: '温泉', pattern: /温泉|銭湯|サウナ|onsen/, items: [TOWEL,
    { id: 'bath-change', name: '入浴後の着替え' },
    { id: 'bath-bag', name: '洗面用品・濡れたものを入れる袋' },
  ] },
  { id: 'city', label: '街歩き', pattern: /街歩き|観光|散策|美術館|city/, items: [
    { id: 'walking-shoes', name: '歩きやすい靴' },
    { id: 'day-bag', name: '身軽に歩けるバッグ' }, WATER, RAIN,
  ] },
  { id: 'overseas', label: '海外旅行', pattern: /海外|外国|ハワイ|アメリカ|米国|カナダ|韓国|台湾|タイ(?:旅行|へ|に|$)|ベトナム|シンガポール|ヨーロッパ|フランス|イタリア|ドイツ|イギリス|オーストラリア|overseas|hawaii/, items: [
    { id: 'passport', name: 'パスポート・渡航先の入国条件の確認' },
    { id: 'adapter', name: '渡航先に合う電源プラグ' },
    { id: 'connectivity', name: '海外で使う通信手段の準備' },
    { id: 'insurance', name: '旅行保険・緊急連絡先の控え' },
  ] },
];

const BASICS: Suggestion[] = [
  { id: 'wallet', name: '財布・現金・決済手段' },
  { id: 'phone', name: 'スマートフォン' },
  { id: 'charger', name: '充電器・モバイルバッテリー' },
  { id: 'id', name: '本人確認書類' },
  { id: 'booking', name: '交通・宿泊・施設のチケットや予約の控え' },
  { id: 'clothes', name: '日数に合う着替え・洗面用品' },
  { id: 'personal', name: '普段使う薬・眼鏡など、自分に欠かせないもの' },
];

export function emptyPacking(): PackingDraft {
  return { destination: '', purpose: '', activities: [], items: [], generatedFor: null };
}

export function packingContext(draft: PackingDraft): string {
  return JSON.stringify([draft.destination.trim(), draft.purpose.trim(), [...draft.activities].sort()]);
}

export function suggestPacking(draft: PackingDraft): PackingDraft {
  const text = `${draft.destination} ${draft.purpose}`.normalize('NFKC').toLowerCase().trim();
  const suggestions = new Map<string, { suggestion: Suggestion; reasons: string[] }>();
  const add = (suggestion: Suggestion, reason: string) => {
    const current = suggestions.get(suggestion.id);
    if (current) current.reasons.push(reason);
    else suggestions.set(suggestion.id, { suggestion, reasons: [reason] });
  };
  BASICS.forEach((item) => add(item, 'どの旅にも'));
  ACTIVITIES.filter((activity) => draft.activities.includes(activity.id) || activity.pattern.test(text))
    .forEach((activity) => activity.items.forEach((item) => add(item, activity.label)));
  if (/雪|寒冷|冬|snow|cold/.test(text)) add(WARM, '雪・寒さへの備え');
  if (/雨|梅雨|rain/.test(text)) add(RAIN, '雨への備え');
  const checked = new Map(draft.items.map((item) => [item.id, item.checked]));
  const items: PackingItem[] = [...suggestions.values()].map(({ suggestion, reasons }) => ({
    ...suggestion, reason: [...new Set(reasons)].join('・'), checked: checked.get(suggestion.id) ?? false, custom: false,
  }));
  return { ...draft, generatedFor: packingContext(draft), items: [...items, ...draft.items.filter((item) => item.custom)] };
}

export function isPackingDraft(value: unknown): value is PackingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as PackingDraft;
  return typeof draft.destination === 'string' && typeof draft.purpose === 'string'
    && Array.isArray(draft.activities) && draft.activities.every((id) => ACTIVITIES.some((activity) => activity.id === id))
    && (draft.generatedFor === null || typeof draft.generatedFor === 'string')
    && Array.isArray(draft.items) && draft.items.every((item) => item && typeof item.id === 'string'
      && typeof item.name === 'string' && typeof item.reason === 'string' && typeof item.checked === 'boolean' && typeof item.custom === 'boolean');
}
