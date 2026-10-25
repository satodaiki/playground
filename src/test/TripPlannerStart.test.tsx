import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TripPlanner from '@/components/pages/TripPlanner';
import { TRIP_DRAFT_KEY } from '@/components/pages/trip-planner/draft';

vi.mock('@/components/pages/trip-planner/TripMap', () => ({ default: () => <div>地図</div> }));

describe('新しい旅の準備', () => {
  it('追加した場所をリネームでき、時間・移動・IDを保ったまま名前と検索先を保存する', async () => {
    const user = userEvent.setup();
    const view = render(<TripPlanner />);
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '京と駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    await user.type(screen.getByLabelText('次に行きたい場所は？'), '京都タワー');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    await user.click(screen.getByRole('button', { name: '京と駅から京都タワーへの移動時間を追加' }));
    await user.click(screen.getByRole('button', { name: '京と駅、滞在45分' }));
    fireEvent.change(screen.getByLabelText('滞在時間（分）'), { target: { value: '60' } });
    const before = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);

    await user.clear(screen.getByLabelText('場所名'));
    await user.type(screen.getByLabelText('場所名'), '  京都駅  {Enter}');

    expect(screen.getByRole('button', { name: '京都駅、滞在60分' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '京都駅から京都タワーへの移動時間15分を編集' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('11:00');
    const link = new URL(screen.getByRole('link', { name: 'Google Mapsで見る' }).getAttribute('href')!);
    expect(link.searchParams.get('query')).not.toContain('京と駅');
    const saved = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);
    expect(saved.stops[0]).toMatchObject({ id: before.stops[0].id, name: '京都駅', address: '京都駅', duration: 60 });
    expect(saved.manualTravel).toEqual(before.manualTravel);

    view.unmount();
    render(<TripPlanner />);
    expect(screen.getByLabelText('場所名')).toHaveValue('京都駅');
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('11:00');
  });

  it.each(['', '   '])('空の名前を保存せず、入力し直してリネームできる: %j', async (name) => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '京都駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    const input = screen.getByLabelText('場所名');
    await user.clear(input);
    if (name) await user.type(input, name);
    await user.click(screen.getByRole('button', { name: '名前を変更' }));
    expect(input).toBeInvalid();
    expect(screen.getByRole('button', { name: '京都駅、滞在45分' })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '駅前で集合{Enter}');
    expect(input).toBeValid();
    expect(screen.getByRole('button', { name: '駅前で集合、滞在45分' })).toBeInTheDocument();
  });

  it('座標のある場所は住所を保ってリネームし、選択と旅程の切り替えに編集欄が追従する', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: '金沢のサンプルを見る' }));
    const before = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);
    await user.clear(screen.getByLabelText('場所名'));
    await user.type(screen.getByLabelText('場所名'), '朝ごはん');
    await user.click(screen.getByRole('button', { name: '名前を変更' }));
    const saved = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);
    expect(saved.stops[0]).toEqual({ ...before.stops[0], name: '朝ごはん' });
    expect(screen.queryByText('サンプル：金沢')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ひがし茶屋街、滞在60分' }));
    expect(screen.getByLabelText('場所名')).toHaveValue('ひがし茶屋街');
    await user.click(screen.getByRole('button', { name: '朝ごはん、滞在45分' }));
    await user.click(screen.getByRole('button', { name: '金沢のサンプルを見る' }));
    await user.click(screen.getByRole('button', { name: 'サンプルに切り替える' }));
    expect(screen.getByLabelText('場所名')).toHaveValue('近江町市場');
  });

  it('初回は空の旅程で始まり、最初の場所を名前で追加できる', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    expect(screen.queryByText('サンプル：金沢')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '近江町市場、滞在45分' })).not.toBeInTheDocument();
    expect(screen.getByText('まずは、行きたい場所をひとつ。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '場所を追加' })).toBeDisabled();
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '京都駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    expect(screen.getByRole('button', { name: '京都駅、滞在45分' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('09:45');
    expect(screen.queryByText('まずは、行きたい場所をひとつ。')).not.toBeInTheDocument();
  });

  it('サンプルは任意で開け、キャンセルで旅程を残し、確認後は空の旅程を作れる', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: '金沢のサンプルを見る' }));
    expect(screen.getByText('サンプル：金沢')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    fireEvent.change(screen.getByLabelText('出発時刻'), { target: { value: '08:30' } });
    await user.click(screen.getByRole('button', { name: '予定から外す' }));
    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }));
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByRole('button', { name: 'ひがし茶屋街、滞在60分' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }));
    await user.click(screen.getByRole('button', { name: '空の旅程に切り替える' }));
    expect(screen.queryByRole('button', { name: 'ひがし茶屋街、滞在60分' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument();
    expect(screen.queryByText('サンプル：金沢')).not.toBeInTheDocument();
    expect(screen.getByLabelText('最初に行きたい場所は？')).toHaveFocus();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('09:00');
  });

  it('手入力の移動時間も、ブラウザーで開き直したときに復元する', async () => {
    const user = userEvent.setup();
    const view = render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: '金沢のサンプルを見る' }));
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    fireEvent.change(screen.getByLabelText('出発時刻'), { target: { value: '08:30' } });
    view.unmount();
    render(<TripPlanner />);
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間15分を編集' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:00');
  });

  it('旅先と目的の入力から持ち物を提案し、チェック・追加・削除できる', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    expect(screen.getByRole('button', { name: '持ち物を提案' })).toBeDisabled();
    await user.type(screen.getByLabelText('旅先・場所の情報'), '白馬');
    await user.type(screen.getByLabelText('旅の目的・やりたいこと'), 'スキー');
    await user.click(screen.getByRole('button', { name: '持ち物を提案' }));
    const list = screen.getByRole('list', { name: '持ち物チェックリスト' });
    expect(within(list).getByRole('checkbox', { name: /スキー板/ })).toBeInTheDocument();
    expect(within(list).getByRole('checkbox', { name: /リフト券/ })).toBeInTheDocument();
    expect(within(list).queryByRole('checkbox', { name: /サーフボード/ })).not.toBeInTheDocument();
    await user.click(within(list).getByRole('checkbox', { name: /財布/ }));
    expect(screen.getByText(/準備済み 1 \//)).toBeInTheDocument();
    await user.type(screen.getByLabelText('自分に必要なものを追加'), 'カメラ');
    await user.click(screen.getByRole('button', { name: '持ち物を追加' }));
    expect(within(list).getByRole('checkbox', { name: /カメラ/ })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'カメラを持ち物から外す' }));
    expect(within(list).queryByRole('checkbox', { name: /カメラ/ })).not.toBeInTheDocument();
  });

  it('提案条件の変更を知らせ、提案し直しても共通のチェックと追加項目を保つ', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: 'スキー・スノーボード' }));
    await user.click(screen.getByRole('button', { name: '持ち物を提案' }));
    await user.click(screen.getByRole('checkbox', { name: /財布/ }));
    await user.type(screen.getByLabelText('自分に必要なものを追加'), 'カメラ');
    await user.click(screen.getByRole('button', { name: '持ち物を追加' }));
    await user.click(screen.getByRole('button', { name: 'スキー・スノーボード' }));
    await user.click(screen.getByRole('button', { name: 'サーフィン' }));
    expect(screen.getByText(/条件を変更しました/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '持ち物を提案し直す' }));
    expect(screen.getByRole('checkbox', { name: /サーフボード/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /スキー板/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /財布/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /カメラ/ })).toBeInTheDocument();
    expect(screen.queryByText(/条件を変更しました/)).not.toBeInTheDocument();
  });

  it('旅程の場所を提案条件へ取り込み、再表示でも旅程と準備状況を復元する', async () => {
    const user = userEvent.setup();
    const view = render(<TripPlanner />);
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '白馬スキー場');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    fireEvent.change(screen.getByLabelText('出発時刻'), { target: { value: '08:30' } });
    await user.click(screen.getByRole('button', { name: '旅程の場所を入力する' }));
    await user.click(screen.getByRole('button', { name: '持ち物を提案' }));
    await user.click(screen.getByRole('checkbox', { name: /リフト券/ }));
    view.unmount();
    render(<TripPlanner />);
    expect(screen.getByRole('button', { name: '白馬スキー場、滞在45分' })).toBeInTheDocument();
    expect(screen.getByLabelText('出発時刻')).toHaveValue('08:30');
    expect(screen.getByLabelText('旅先・場所の情報')).toHaveValue('白馬スキー場');
    expect(screen.getByRole('checkbox', { name: /リフト券/ })).toBeChecked();
  });

  it('新しい旅程への切り替えでは、前の持ち物と条件も消す', async () => {
    const user = userEvent.setup();
    const view = render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: 'サーフィン' }));
    await user.click(screen.getByRole('button', { name: '持ち物を提案' }));
    await user.click(screen.getByRole('checkbox', { name: /サーフボード/ }));
    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }));
    expect(screen.getByRole('checkbox', { name: /サーフボード/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '空の旅程に切り替える' }));
    expect(screen.queryByRole('list', { name: '持ち物チェックリスト' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'サーフィン' })).toHaveAttribute('aria-pressed', 'false');
    view.unmount();
    render(<TripPlanner />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each(['壊れたJSON', JSON.stringify({ stops: [{}] })])('保存データが不正でも空の旅程から開始できる: %s', (saved) => {
    localStorage.setItem(TRIP_DRAFT_KEY, saved);
    render(<TripPlanner />);
    expect(screen.getByText('まずは、行きたい場所をひとつ。')).toBeInTheDocument();
  });

  it('保存が拒否されても編集を続けられ、保存できないことを知らせる', async () => {
    vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    const user = userEvent.setup();
    render(<TripPlanner />);
    expect(await screen.findByRole('alert')).toHaveTextContent('保存できません');
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '京都駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    expect(screen.getByRole('button', { name: '京都駅、滞在45分' })).toBeInTheDocument();
  });
});
