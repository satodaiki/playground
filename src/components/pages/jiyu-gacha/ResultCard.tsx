import type { DrawResult, Rarity } from './data';

// 抽選結果カード（レアリティバッジ＋発想チップ＋お気に入り/コピー操作）。
// アニメ再生のための remount は呼び出し側の key={drawId} で行う。
export default function ResultCard({
  result,
  rarity,
  flash,
  isFavorite,
  onToggleFavorite,
  onCopy,
}: {
  result: DrawResult;
  rarity: Rarity;
  flash: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCopy: () => void;
}) {
  return (
    <div className={`jg-card ${rarity.cls} ${rarity.cardCls}${flash ? ' jg-flash' : ''}`}>
      <div className={`jg-rarity-badge ${rarity.cls}`} title={rarity.title}>
        {rarity.label}
      </div>
      <div className="jg-chips">
        {result.parts.map((p, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span className="jg-cross">×</span>}
            <span className={`jg-chip ${p.cls}`}>
              <span className="jg-chip-label">{p.label}</span>
              <span className="jg-chip-word">{p.word}</span>
            </span>
          </span>
        ))}
      </div>
      <div className="jg-card-actions">
        <button className="jg-mini" onClick={onToggleFavorite}>
          {isFavorite ? '★ お気に入り済' : '☆ お気に入り'}
        </button>
        <button className="jg-mini" onClick={onCopy}>
          コピー
        </button>
      </div>
    </div>
  );
}
