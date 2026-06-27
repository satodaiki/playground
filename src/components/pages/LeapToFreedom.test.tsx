import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LeapToFreedom from './LeapToFreedom';
import { mockWasmFetch, mockWasmFetchFailure } from '@/test/wasm';

describe('LeapToFreedom', () => {
  beforeEach(() => {
    mockWasmFetch('leap_to_freedom.wasm');
    // jsdom は canvas 2D を実装しないので getContext をスタブ。
    // rAF はゲームループを止めるため no-op にし、状態遷移だけを決定的に検証する。
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('読み込み後にスタート画面（重力反転の案内と START）が出る', async () => {
    render(<LeapToFreedom />);

    // 読み込み中は START が無効（leap はラベルが常に START で disabled で表す）。
    expect(screen.getByRole('button', { name: 'START' })).toBeDisabled();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();

    // 読み込み完了で START が有効化し、待機オーバーレイが出る。
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'START' })).toBeEnabled(),
    );
    expect(screen.getByText('重力を、反転しろ')).toBeInTheDocument();
  });

  it('START を押すとプレイ中になり FLIP GRAVITY ボタンに変わる', async () => {
    const user = userEvent.setup();
    render(<LeapToFreedom />);

    const start = await screen.findByRole('button', { name: 'START' });
    await user.click(start);

    expect(await screen.findByRole('button', { name: /FLIP GRAVITY/ })).toBeInTheDocument();
  });

  it('ハイスコア(BEST DISTANCE)を表示する', async () => {
    render(<LeapToFreedom />);
    await screen.findByRole('button', { name: 'START' });
    expect(screen.getByText('BEST DISTANCE')).toBeInTheDocument();
  });

  it('WASM 読み込み失敗時はエラーメッセージを表示する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWasmFetchFailure();
    render(<LeapToFreedom />);

    expect(await screen.findByText(/WASM を読み込めませんでした/)).toBeInTheDocument();
    // エラー時もメイン操作（START）は無効のまま。
    expect(screen.getByRole('button', { name: 'START' })).toBeDisabled();
  });
});
