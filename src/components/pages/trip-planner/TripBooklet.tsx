import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ImagePlus, Printer, Trash2 } from 'lucide-react';
import './TripBooklet.css';

type Props = { open: boolean; onClose(): void; children: ReactNode };

export default function TripBooklet({ open, onClose, children }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);

  if (!open) return null;

  return <section className="tp-booklet" aria-labelledby="tp-booklet-title">
    <div className="tp-booklet-toolbar">
      <button type="button" className="tp-secondary" onClick={() => { setLoading(Boolean(photo)); onClose(); }}><ArrowLeft size={16} aria-hidden="true" />旅程に戻る</button>
      <h2 ref={heading} tabIndex={-1}>しおりのプレビュー</h2>
      <div>
        <button type="button" className="tp-secondary" onClick={() => fileInput.current?.click()}><ImagePlus size={16} aria-hidden="true" />{photo ? '写真を変更' : '写真を追加'}</button>
        <input ref={fileInput} type="file" aria-label="しおりの写真" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
            setError('JPEG・PNG・WebP形式で、10MB以下の写真を選んでください。');
            return;
          }
          try {
            setPhoto(URL.createObjectURL(file));
            setLoading(true);
            setError('');
          } catch {
            setError('写真を読み込めませんでした。もう一度選び直してください。');
          }
        }} />
        {photo && <button type="button" className="tp-secondary" onClick={() => { setPhoto(null); setLoading(false); setError(''); }}><Trash2 size={16} aria-hidden="true" />写真を外す</button>}
        <button type="button" className="tp-primary" disabled={loading} onClick={() => window.print()}><Printer size={16} aria-hidden="true" />印刷・PDF保存</button>
      </div>
      <p>写真は表紙に1枚追加できます（JPEG・PNG・WebP、10MBまで）。外部に送信せず、再読み込み・旅程の切り替えで消えます。</p>
      {loading && <p role="status">写真を読み込み中…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <article className="tp-booklet-paper">
      {photo && <figure className="tp-booklet-cover"><img key={photo} src={photo} alt="しおりの表紙写真" onLoad={() => setLoading(false)} onError={() => {
        setPhoto(null);
        setLoading(false);
        setError('写真を表示できませんでした。JPEG・PNG・WebP形式の別の写真を選んでください。');
      }} /></figure>}
      {children}
    </article>
  </section>;
}
