// localStorage 上の配列データの読み書き。JSON 破損や非配列は空配列に倒す。
// gacha・haiku の履歴/お気に入り永続で共有する。
export function readList<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function writeList<T>(key: string, list: T[]): void {
  localStorage.setItem(key, JSON.stringify(list));
}
