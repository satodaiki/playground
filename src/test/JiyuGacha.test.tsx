import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import JiyuGacha from '@/components/pages/JiyuGacha';
import { mockWasmFetch, mockWasmFetchFailure } from './wasm';

describe('JiyuGacha', () => {
  beforeEach(() => {
    mockWasmFetch('gacha_core.wasm');
  });

  it('WASM 読み込み前はレバーが無効、読み込み後に有効化される', async () => {
    render(<JiyuGacha />);

    // 初期は「読み込み中…」で無効。
    const lever = screen.getByRole('button', { name: '読み込み中…' });
    expect(lever).toBeDisabled();

    // 読み込み完了でラベルが変わり、操作可能になる。
    const ready = await screen.findByRole('button', { name: 'レバーを引く' });
    expect(ready).toBeEnabled();
  });

  it('レバーを引くと結果カード（領域チップ）が表示され履歴に積まれる', async () => {
    const user = userEvent.setup();
    render(<JiyuGacha />);

    const lever = await screen.findByRole('button', { name: 'レバーを引く' });
    await user.click(lever);

    // ガチャ演出(700ms)後にカードが出る。最低レアリティ(N)でも「領域」は必ず含む。
    const card = await screen.findByText('領域', {}, { timeout: 3000 });
    expect(card).toBeInTheDocument();

    // 履歴パネルに 1 件積まれている（空表示が消える）。
    expect(screen.queryByText('まだ引いていません')).not.toBeInTheDocument();
    expect(localStorage.getItem('jiyu_gacha_history')).toBeTruthy();
  });

  it('お気に入りに登録できる', async () => {
    const user = userEvent.setup();
    render(<JiyuGacha />);

    const lever = await screen.findByRole('button', { name: 'レバーを引く' });
    await user.click(lever);
    await screen.findByText('領域', {}, { timeout: 3000 });

    const favBtn = await screen.findByRole('button', { name: '☆ お気に入り' });
    await user.click(favBtn);

    expect(await screen.findByRole('button', { name: '★ お気に入り済' })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('jiyu_gacha_favorites')).toBeTruthy());
  });

  it('WASM 読み込み失敗時はエラーメッセージを表示する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWasmFetchFailure();
    render(<JiyuGacha />);

    expect(
      await screen.findByText(/WASM の読み込みに失敗しました/),
    ).toBeInTheDocument();
  });

  it('履歴をクリアできる', async () => {
    const user = userEvent.setup();
    render(<JiyuGacha />);

    const lever = await screen.findByRole('button', { name: 'レバーを引く' });
    await user.click(lever);
    await screen.findByText('領域', {}, { timeout: 3000 });

    const historyPanel = screen.getByRole('heading', { name: '履歴' }).closest('.jg-panel')!;
    await user.click(within(historyPanel as HTMLElement).getByRole('button', { name: 'クリア' }));

    expect(within(historyPanel as HTMLElement).getByText('まだ引いていません')).toBeInTheDocument();
  });
});
