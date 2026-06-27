import type { Poem } from './data';

// 句の紙面・メタ（詩情/行数）・操作ボタンをまとめた舞台。
export default function PoemStage({
  error,
  ready,
  poem,
  genId,
  isFavorite,
  onCompose,
  onToggleFavorite,
  onCopy,
}: {
  error: boolean;
  ready: boolean;
  poem: Poem | null;
  genId: number;
  isFavorite: boolean;
  onCompose: () => void;
  onToggleFavorite: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="fh-stage">
      <div className="fh-paper">
        {error && (
          <div className="fh-error">
            WASM の読み込みに失敗しました。ビルドし直して再読み込みしてください。
          </div>
        )}
        {!error && !poem && (
          <div className="fh-placeholder">
            {ready ? '「詠む」を押して一句を生む' : '読み込み中…'}
          </div>
        )}
        {!error && poem && (
          <div key={genId} className="fh-poem">
            {poem.lines.map((line, i) => (
              <p className="fh-line" key={i}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {!error && poem && (
        <div className="fh-meta">
          <span className="fh-score" title="自由律らしさ（韻律スコア）">
            詩情 {poem.score}
          </span>
          <span className="fh-len">{poem.lines.length} 行</span>
        </div>
      )}

      <div className="fh-actions">
        <button className="fh-primary" onClick={onCompose} disabled={!ready}>
          {poem ? 'もう一句' : '詠む'}
        </button>
        <button className="fh-mini" onClick={onToggleFavorite} disabled={!poem}>
          {isFavorite ? '★ お気に入り済' : '☆ お気に入り'}
        </button>
        <button className="fh-mini" onClick={onCopy} disabled={!poem}>
          コピー
        </button>
      </div>
    </section>
  );
}
