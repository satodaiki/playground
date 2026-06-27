import { useEffect, useRef, useState } from 'react';

export type WasmStatus = 'loading' | 'ready' | 'error';

// 3 ページ共通の WASM ロード。コアは外部 import を持たないので空オブジェクトで
// インスタンス化できる（content-type 非依存にするため instantiateStreaming は使わず
// fetch → arrayBuffer → instantiate）。アンマウント後の setState は cancel ガードで抑止。
export function useWasm<T>(url: string): { exports: T | null; status: WasmStatus } {
  const exportsRef = useRef<T | null>(null);
  const [status, setStatus] = useState<WasmStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(buf, {});
        if (!cancelled) {
          exportsRef.current = instance.exports as unknown as T;
          setStatus('ready');
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { exports: exportsRef.current, status };
}
