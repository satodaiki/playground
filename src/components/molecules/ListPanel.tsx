import type { ReactNode } from 'react';

type ListPanelProps<T> = {
  // ページスコープCSSの接頭辞（'jg' | 'fh' など）。これから各サブクラスを導出する。
  prefix: string;
  title: string;
  items: T[];
  emptyText: string;
  renderItem: (item: T, index: number) => ReactNode;
  onClear?: () => void;
};

// お気に入り/履歴のリストパネル。gacha・haiku で共有し、見た目は prefix で切り替える。
// DOM 構造とクラス名は元のページと完全一致させる（スコープCSSを壊さないため）。
export default function ListPanel<T>({
  prefix,
  title,
  items,
  emptyText,
  renderItem,
  onClear,
}: ListPanelProps<T>) {
  return (
    <div className={`${prefix}-panel`}>
      <div className={`${prefix}-panel-head`}>
        <h2>{title}</h2>
        {onClear && (
          <button className={`${prefix}-mini ${prefix}-ghost`} onClick={onClear}>
            クリア
          </button>
        )}
      </div>
      <ul className={`${prefix}-list`}>
        {items.length === 0 ? (
          <li className={`${prefix}-empty`}>{emptyText}</li>
        ) : (
          items.map((item, i) => <li key={i}>{renderItem(item, i)}</li>)
        )}
      </ul>
    </div>
  );
}
