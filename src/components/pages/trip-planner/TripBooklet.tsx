import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ImagePlus, Printer, Trash2 } from 'lucide-react';
import './TripBooklet.css';

type Props = { open: boolean; onClose(): void; children: ReactNode };
type Photo = { url: string; loaded: boolean };

export default function TripBooklet({ open, onClose, children }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const photoUrls = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const urls = photoUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);

  const loading = photos.some((photo) => !photo.loaded);
  function removePhoto(url: string) {
    setPhotos((current) => current.filter((photo) => photo.url !== url));
    photoUrls.current.delete(url);
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return <section className="tp-booklet" aria-labelledby="tp-booklet-title">
    <div className="tp-booklet-toolbar">
      <button type="button" className="tp-secondary" onClick={() => { setPhotos((current) => current.map((photo) => ({ ...photo, loaded: false }))); onClose(); }}><ArrowLeft size={16} aria-hidden="true" />旅程に戻る</button>
      <h2 ref={heading} tabIndex={-1}>しおりのプレビュー</h2>
      <div>
        <button type="button" className="tp-secondary" onClick={() => fileInput.current?.click()}><ImagePlus size={16} aria-hidden="true" />写真を追加</button>
        <input ref={fileInput} type="file" aria-label="しおりの写真" accept="image/*" multiple hidden onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = '';
          if (!files.length) return;
          const added: Photo[] = [];
          let message = '';
          for (const file of files) {
            try {
              const url = URL.createObjectURL(file);
              photoUrls.current.add(url);
              added.push({ url, loaded: false });
            } catch {
              message = '読み込めない写真がありました。もう一度選び直してください。';
            }
          }
          if (added.length) setPhotos((current) => [...current, ...added]);
          setError(message);
        }} />
        <button type="button" className="tp-primary" disabled={loading} onClick={() => window.print()}><Printer size={16} aria-hidden="true" />印刷・PDF保存</button>
      </div>
      <p>旅のあとに写真を複数追加して、思い出のアルバムにできます。外部に送信せず、再読み込み・旅程の切り替えで消えます。残したいアルバムはPDFで保存してください。</p>
      {loading && <p role="status">写真を読み込み中…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <article className="tp-booklet-paper">
      {children}
      <section className={`tp-booklet-album${photos.length ? '' : ' is-empty'}`} aria-labelledby="tp-booklet-album-title">
        <div className="tp-booklet-album-heading">
          <div><h2 id="tp-booklet-album-title">旅のアルバム</h2><p aria-live="polite">{photos.length ? `${photos.length}枚の思い出` : '旅のあとに、撮った写真を並べよう。'}</p></div>
          <button type="button" className="tp-secondary" onClick={() => fileInput.current?.click()}><ImagePlus size={16} aria-hidden="true" />アルバムに写真を追加</button>
        </div>
        {photos.length > 0 ? <div className="tp-booklet-album-grid">
          {photos.map((photo, index) => <figure key={photo.url} className="tp-booklet-photo">
            <img src={photo.url} alt={`旅の写真 ${index + 1}`} onLoad={() => setPhotos((current) => current.map((item) => item.url === photo.url ? { ...item, loaded: true } : item))} onError={() => {
              removePhoto(photo.url);
              setError('このブラウザーで表示できない写真をアルバムから外しました。対応していない形式か、画像ファイルが壊れている可能性があります。');
            }} />
            <figcaption><span>PHOTO {String(index + 1).padStart(2, '0')}</span><button type="button" aria-label={`写真${index + 1}をアルバムから外す`} onClick={() => removePhoto(photo.url)}><Trash2 size={15} aria-hidden="true" />外す</button></figcaption>
          </figure>)}
        </div> : <p className="tp-booklet-album-empty">写真は一度に複数枚選べます。あとから追加して、自分だけの旅の記録を作れます。</p>}
      </section>
      <footer className="tp-booklet-footer">ゆっくり、いこう。 — 旅の余白</footer>
    </article>
  </section>;
}
