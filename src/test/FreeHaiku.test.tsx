import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FreeHaiku from '@/components/pages/FreeHaiku';
import { mockWasmFetch, mockWasmFetchFailure } from './wasm';

describe('FreeHaiku', () => {
  beforeEach(() => {
    mockWasmFetch('free_haiku.wasm');
  });

  it('ハッカソン発表資料リンクを表示する', () => {
    render(<FreeHaiku />);
    expect(screen.getByRole('link', { name: /ハッカソン発表資料/ })).toBeInTheDocument();
  });

  it('WASM 読み込み前は「詠む」が無効、読み込み後に有効化される', async () => {
    render(<FreeHaiku />);

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '詠む' })).toBeDisabled();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '詠む' })).toBeEnabled(),
    );
    expect(screen.getByText('「詠む」を押して一句を生む')).toBeInTheDocument();
  });

  it('「詠む」で一句（1行以上）と詩情スコアが表示され履歴に積まれる', async () => {
    const user = userEvent.setup();
    render(<FreeHaiku />);

    const compose = await screen.findByRole('button', { name: '詠む' });
    await waitFor(() => expect(compose).toBeEnabled());
    await user.click(compose);

    // 句が生成され、行が描画される。
    const poem = await screen.findByRole('button', { name: 'もう一句' });
    expect(poem).toBeInTheDocument();
    const lines = document.querySelectorAll('.fh-line');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    // 韻律スコアの表示と履歴の積み上げ（.fh-score で一意に特定）。
    expect(document.querySelector('.fh-score')).toHaveTextContent('詩情');
    expect(screen.queryByText('まだ詠んでいません')).not.toBeInTheDocument();
    expect(localStorage.getItem('free_haiku_history')).toBeTruthy();
  });

  it('生成前はお気に入り・コピーが無効', async () => {
    render(<FreeHaiku />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '詠む' })).toBeEnabled(),
    );
    expect(screen.getByRole('button', { name: '☆ お気に入り' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'コピー' })).toBeDisabled();
  });

  it('WASM 読み込み失敗時はエラーメッセージを表示する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWasmFetchFailure();
    render(<FreeHaiku />);

    expect(
      await screen.findByText(/WASM の読み込みに失敗しました/),
    ).toBeInTheDocument();
  });
});
