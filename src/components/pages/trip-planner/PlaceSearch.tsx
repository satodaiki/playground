import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Plus } from 'lucide-react';
import { loadGoogleMaps } from './maps';
import type { Place, PlaceSelectEvent } from './maps';

type Props = {
  label: string;
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  onChange(value: string): void;
  onAdd(place: Place): void;
};

export default function PlaceSearch({ label, value, inputRef, autoFocus = false, onChange, onAdd }: Props) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const search = useRef<HTMLDivElement>(null);
  const widget = useRef<(HTMLElement & { value: string }) | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(key ? 'loading' : 'unavailable');
  const [notice, setNotice] = useState(key ? 'Google Mapsの候補検索を読み込み中…' : 'Google Mapsの候補検索は未接続です。場所名を直接入力して追加できます。');
  const add = useEffectEvent(onAdd);
  const change = useEffectEvent(onChange);
  const readValue = useEffectEvent(() => value);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let request = 0;
    let autocomplete: (HTMLElement & { value: string }) | undefined;
    const selectPlace = (event: Event) => {
      const current = ++request;
      setNotice('選んだ場所を取得中…');
      void (async () => {
        try {
          const place = (event as PlaceSelectEvent).placePrediction.toPlace();
          await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
          if (cancelled || current !== request) return;
          const lat = place.location?.lat();
          const lng = place.location?.lng();
          if (!place.id || lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)
            || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Missing location');
          const name = place.displayName || place.formattedAddress || '追加した場所';
          add({ id: place.id, name, address: place.formattedAddress || '', lat, lng });
          change('');
          if (autocomplete) { autocomplete.value = ''; autocomplete.focus(); }
          setNotice(`${name}を追加しました。次の場所を検索できます。`);
        } catch {
          if (!cancelled && current === request) setNotice('場所を取得できませんでした。別の候補を選ぶか、場所名を直接入力してください。');
        }
      })();
    };
    const input = () => change(autocomplete?.value || '');
    const searchError = () => {
      ++request;
      autocomplete?.remove();
      widget.current = null;
      setStatus('unavailable');
      setNotice('Google Mapsの候補検索を利用できません。場所名を直接入力して追加できます。');
    };
    void (async () => {
      try {
        const google = await loadGoogleMaps(key);
        await google.importLibrary('places');
        if (cancelled || !search.current) return;
        autocomplete = new google.places.PlaceAutocompleteElement();
        autocomplete.setAttribute('aria-labelledby', 'tp-place-search-label');
        autocomplete.setAttribute('aria-describedby', 'tp-place-search-notice');
        autocomplete.setAttribute('placeholder', '都市名・駅・観光スポットを検索');
        autocomplete.value = readValue();
        autocomplete.addEventListener('gmp-select', selectPlace);
        autocomplete.addEventListener('gmp-error', searchError);
        autocomplete.addEventListener('input', input);
        widget.current = autocomplete;
        search.current.replaceChildren(autocomplete);
        setStatus('ready');
        setNotice('Google Mapsの候補を選ぶと、住所・位置情報付きで旅程に追加します。');
      } catch {
        if (!cancelled) searchError();
      }
    })();
    return () => {
      cancelled = true;
      autocomplete?.removeEventListener('gmp-select', selectPlace);
      autocomplete?.removeEventListener('gmp-error', searchError);
      autocomplete?.removeEventListener('input', input);
      autocomplete?.remove();
      widget.current = null;
    };
  }, [key]);

  useEffect(() => {
    if (widget.current && widget.current.value !== value) widget.current.value = value;
  }, [value]);

  useEffect(() => {
    if (status === 'ready' && autoFocus) widget.current?.focus();
  }, [status, autoFocus]);

  const manualForm = (
    <form className="tp-add-form" onSubmit={(event) => {
      event.preventDefault();
      const name = value.trim();
      if (!name || name.length > 150) return;
      onAdd({ id: crypto.randomUUID(), name, address: name });
      onChange('');
      inputRef.current?.focus();
    }}>
      <label htmlFor="tp-add-place">{status === 'ready' ? '追加する場所名' : label}</label>
      <div>
        <input ref={inputRef} id="tp-add-place" value={value} maxLength={150} onChange={(event) => onChange(event.target.value)} placeholder="例：京都駅、白馬のスキー場" required autoFocus={autoFocus} />
        <button type="submit" aria-label="場所を追加" disabled={!value.trim()}><Plus size={18} aria-hidden="true" /></button>
      </div>
      <p>名前だけで追加した場所には、地図上の位置情報は付きません。</p>
    </form>
  );

  return <div className="tp-place-entry">
    <div hidden={status !== 'ready'}>
      <p id="tp-place-search-label" className="tp-place-search-label">{label}</p>
      <div ref={search} className="tp-place-search" />
    </div>
    <p id="tp-place-search-notice" className="tp-place-search-notice" role="status">{notice}</p>
    {status === 'ready' ? <details className="tp-place-manual"><summary>場所名だけで追加する</summary>{manualForm}</details> : manualForm}
  </div>;
}
