import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ListPanel from '@/components/molecules/ListPanel';

describe('ListPanel', () => {
  it('items を renderItem で描画する', () => {
    render(
      <ListPanel
        prefix="jg"
        title="履歴"
        items={['a', 'b']}
        emptyText="なし"
        renderItem={(x) => <span>{x}</span>}
      />,
    );
    expect(screen.getByRole('heading', { name: '履歴' })).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.queryByText('なし')).not.toBeInTheDocument();
  });

  it('空のとき emptyText を表示する', () => {
    render(
      <ListPanel
        prefix="fh"
        title="お気に入り"
        items={[]}
        emptyText="まだありません"
        renderItem={() => null}
      />,
    );
    expect(screen.getByText('まだありません')).toBeInTheDocument();
  });

  it('onClear があるときクリアボタンを表示し、押すと呼ばれる', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <ListPanel
        prefix="jg"
        title="履歴"
        items={[]}
        emptyText="なし"
        renderItem={() => null}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'クリア' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('onClear が無いときクリアボタンを表示しない', () => {
    render(
      <ListPanel
        prefix="jg"
        title="お気に入り"
        items={[]}
        emptyText="なし"
        renderItem={() => null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'クリア' })).not.toBeInTheDocument();
  });
});
