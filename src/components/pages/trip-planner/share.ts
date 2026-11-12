import { normalizeTripDraft, newTripId } from './draft';
import type { TripDraft } from './draft';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** 旅程を共有リンクのハッシュに埋め込むための文字列にする。 */
export function encodeTrip(draft: TripDraft): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(draft)));
}

/** 共有リンク／JSON文字列から旅程を復元する。新しいIDを振って返す。 */
export function decodeTrip(text: string): TripDraft | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(text.trim()));
    const draft = normalizeTripDraft(JSON.parse(json));
    return draft ? { ...draft, id: newTripId(), isSample: false } : null;
  } catch {
    return null;
  }
}

export function parseTripJson(text: string): TripDraft | null {
  try {
    const draft = normalizeTripDraft(JSON.parse(text));
    return draft ? { ...draft, id: newTripId(), isSample: false } : null;
  } catch {
    return null;
  }
}

export function tripShareUrl(draft: TripDraft, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = `t=${encodeTrip(draft)}`;
  return url.toString();
}

export function tripFromHash(hash: string): TripDraft | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const encoded = params.get('t');
  return encoded ? decodeTrip(encoded) : null;
}
