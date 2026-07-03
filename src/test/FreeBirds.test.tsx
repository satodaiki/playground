import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hitCage } from '@/components/pages/free-birds/constants';
import FreeBirds from '@/components/pages/FreeBirds';
import { mockWasmFetch, mockWasmFetchFailure } from './wasm';

describe('hitCage', () => {
  const cage = { x: 100, y: 100, w: 200, h: 150 };

  it('籠の内側はヒットする', () => {
    expect(hitCage(200, 175, cage)).toBe(true);
  });

  it('既定の余白ぶん外側までヒットする（タップしやすさ）', () => {
    expect(hitCage(90, 90, cage)).toBe(true); // pad=24 の範囲内
  });

  it('余白の外はヒットしない', () => {
    expect(hitCage(50, 50, cage)).toBe(false);
    expect(hitCage(400, 300, cage)).toBe(false);
  });
});

describe('FreeBirds', () => {
  beforeEach(() => {
    mockWasmFetch('free_birds.wasm');
    // jsdom は canvas 2D を実装しないので getContext をスタブ。
    // rAF はループを止め、状態遷移だけを決定的に検証する。
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('読み込み中は「扉を開ける」が無効で、完了後に有効になる', async () => {
    render(<FreeBirds />);
    expect(screen.getByRole('button', { name: '扉を開ける' })).toBeDisabled();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '扉を開ける' })).toBeEnabled(),
    );
  });

  it('扉を開けると「籠に戻す」になり、戻すと再び「扉を開ける」', async () => {
    const user = userEvent.setup();
    render(<FreeBirds />);
    const open = await screen.findByRole('button', { name: '扉を開ける' });
    await waitFor(() => expect(open).toBeEnabled());

    await user.click(open);
    const back = await screen.findByRole('button', { name: '籠に戻す' });
    expect(
      screen.getByText('誰も命じていないのに、群れは形を見つける。'),
    ).toBeInTheDocument();

    await user.click(back);
    expect(await screen.findByRole('button', { name: '扉を開ける' })).toBeInTheDocument();
  });

  it('WASM 読み込み失敗時はエラーメッセージを表示し操作は無効のまま', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWasmFetchFailure();
    render(<FreeBirds />);

    expect(await screen.findByText(/WASM を読み込めませんでした/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '扉を開ける' })).toBeDisabled();
  });
});
