import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const WasmTerminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 1. xterm.js の初期化
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    term.writeln('Initializing Wasm Container...');

    // 2. Web Worker の起動 (container2wasm の実行用)
    // 実際の実装では container2wasm が配布している worker.js を利用します
    const worker = new Worker(new URL('./wasm-worker.ts', import.meta.url));

    // Worker からの出力をターミナルに表示
    worker.onmessage = (e) => {
      term.write(e.data);
    };

    // ターミナルの入力を Worker (Wasm) に送信
    term.onData((data) => {
      worker.postMessage({ type: 'input', data });
    });

    return () => {
      term.dispose();
      worker.terminate();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '500px', backgroundColor: '#000', padding: '10px' }}>
      <div ref={terminalRef} style={{ height: '100%' }} />
    </div>
  );
};

export default WasmTerminal;