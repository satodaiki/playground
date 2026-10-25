import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TripPlanner from '@/components/pages/TripPlanner';

vi.mock('@/components/pages/trip-planner/TripMap', () => ({
  default: ({ stops, onRoute }: {
    stops: { id: string; name: string }[];
    onRoute: (durations: number[] | null) => void;
  }) => (
    <div>
      <output data-testid="map-stop-order">{stops.map((stop) => stop.id).join(',')}</output>
      <button onClick={() => onRoute([10, 20, 15, 5].slice(0, stops.length - 1))}>
        徒歩時間を取得（テスト）
      </button>
    </div>
  ),
}));

vi.mock('@/components/pages/trip-planner/PlaceSearch', async (original) => {
  const { default: PlaceSearch } = await original<typeof import('@/components/pages/trip-planner/PlaceSearch')>();
  return { default: (props: ComponentProps<typeof PlaceSearch>) => <>
    <PlaceSearch {...props} />
    <button onClick={() => props.onAdd({ id: 'station', name: '金沢駅', address: '石川県金沢市', lat: 36.578, lng: 136.648 })}>
      場所を追加（テスト）
    </button>
  </> };
});

async function renderSample() {
  const view = render(<TripPlanner />);
  await userEvent.click(screen.getByRole('button', { name: '金沢のサンプルを見る' }));
  return view;
}

describe('TripPlanner', () => {
  it('予定の間から1クリックで移動を追加し、短いボタン操作で時間を変更できる', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));

    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:30');
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('未入力3区間');
    expect(screen.getByTestId('trip-stop-omicho')).toHaveStyle({ marginRight: '30px' });
    expect(screen.getByRole('button', { name: '15分' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '30分' }));
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:45');
    expect(screen.getByTestId('trip-stop-omicho')).toHaveStyle({ marginRight: '60px' });
    expect(screen.getByLabelText('移動時間（分）')).toHaveValue(30);

    await user.click(screen.getByRole('button', { name: '入力を解除' }));
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:15');
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' })).toBeInTheDocument();
  });

  it('全区間に手入力すれば、地図未接続でも移動込みの終了予定を表示できる', async () => {
    const user = userEvent.setup();
    await renderSample();
    for (const button of screen.getAllByRole('button', { name: /への移動時間を追加$/ })) {
      await user.click(button);
    }

    expect(screen.getByTestId('trip-summary')).toHaveTextContent('終了予定14:15');
    expect(screen.getByTestId('trip-summary')).not.toHaveTextContent('未入力');
    expect(screen.queryByText(/区間の移動時間が未入力/)).not.toBeInTheDocument();
  });

  it('移動時間は入力し直せ、0分を未入力と混同せず、上限を超える値を確定しない', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    const input = screen.getByLabelText('移動時間（分）');

    await user.clear(input);
    await user.type(input, '7');
    await user.tab();
    expect(input).toHaveValue(7);
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:22');

    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間0分を編集' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('未入力3区間');

    await user.clear(input);
    await user.type(input, '999');
    await user.tab();
    expect(input).toHaveValue(240);
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('17:15');
  });

  it('地図の時間が後から届いても手入力を優先し、入力解除で地図の値へ戻せる', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    await user.click(screen.getByRole('button', { name: '30分' }));
    await user.click(screen.getByRole('button', { name: '徒歩時間を取得（テスト）' }));

    expect(screen.getByTestId('trip-summary')).toHaveTextContent('14:25');
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間30分を編集' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '入力を解除' }));
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('14:05');
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間10分を編集' })).toBeInTheDocument();
  });

  it('自動取得した時間を開いて閉じただけでは、手入力に変更しない', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '徒歩時間を取得（テスト）' }));
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間10分を編集' }));
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間10分を編集' }));

    expect(screen.getByText('Google Mapsの目安')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を解除' })).not.toBeInTheDocument();
  });

  it('並べ替えで移動先が変われば時間を流用せず、同じ区間へ戻すと入力を保つ', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    await user.click(screen.getByRole('button', { name: '30分' }));
    await user.click(screen.getByRole('button', { name: 'ひとつ後ろへ' }));

    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:15');
    expect(screen.getByRole('button', { name: 'ひがし茶屋街から近江町市場への移動時間を追加' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ひとつ前へ' }));
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間30分を編集' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:45');
  });

  it('削除を取り消すと、その地点への手入力の移動時間も復元する', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    await user.click(screen.getByRole('button', { name: 'ひがし茶屋街、滞在60分' }));
    await user.click(screen.getByRole('button', { name: '予定から外す' }));

    expect(screen.getByTestId('trip-summary')).toHaveTextContent('12:15');
    expect(screen.getByRole('button', { name: '近江町市場から金沢城公園への移動時間を追加' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:30');
    expect(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間15分を編集' })).toBeInTheDocument();
  });

  it('移動時間が未取得なら、滞在だけの終了時刻を表示する', async () => {
    await renderSample();

    const summary = screen.getByTestId('trip-summary');
    expect(summary).toHaveTextContent('13:15');
    expect(summary).toHaveTextContent('滞在のみの終了');
    expect(screen.getByTestId('trip-stop-omicho')).toHaveStyle({ width: '90px' });
  });

  it('滞在時間を伸ばすと棒と終了時刻が変わり、取得済みの徒歩時間も残る', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '徒歩時間を取得（テスト）' }));
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('14:05');

    await user.click(screen.getByRole('button', { name: '近江町市場、滞在45分' }));
    fireEvent.change(screen.getByLabelText('滞在時間（分）'), { target: { value: '60' } });

    expect(screen.getByTestId('trip-stop-omicho')).toHaveStyle({ width: '120px' });
    expect(screen.getByRole('button', { name: '近江町市場、滞在60分' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('14:20');
    expect(screen.getByTestId('trip-summary')).not.toHaveTextContent('滞在のみの終了');
  });

  it('順番を変えると地図側の順番も変わり、古い徒歩時間を使わない', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '徒歩時間を取得（テスト）' }));
    await user.click(screen.getByRole('button', { name: '近江町市場、滞在45分' }));
    await user.click(screen.getByRole('button', { name: 'ひとつ後ろへ' }));

    expect(screen.getByTestId('map-stop-order')).toHaveTextContent('higashi,omicho,castle,kenroku,daisetz');
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('滞在のみの終了');
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:15');
  });

  it('削除を取り消すと元の位置に戻り、その間に編集した別の予定も保つ', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '金沢城公園、滞在45分' }));
    await user.click(screen.getByRole('button', { name: '予定から外す' }));

    expect(screen.queryByRole('button', { name: '金沢城公園、滞在45分' })).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('12:30');
    expect(screen.getByTestId('map-stop-order')).toHaveTextContent('omicho,higashi,kenroku,daisetz');

    await user.click(screen.getByRole('button', { name: '兼六園、滞在60分' }));
    fireEvent.change(screen.getByLabelText('滞在時間（分）'), { target: { value: '90' } });

    await user.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByRole('button', { name: '金沢城公園、滞在45分' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '兼六園、滞在90分' })).toBeInTheDocument();
    expect(screen.getByTestId('map-stop-order')).toHaveTextContent('omicho,higashi,castle,kenroku,daisetz');
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:45');
  });

  it('地点を追加した直後は、それまでの経路時間を使わない', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '徒歩時間を取得（テスト）' }));
    await user.click(screen.getByRole('button', { name: '場所を追加（テスト）' }));

    expect(screen.getByTestId('map-stop-order')).toHaveTextContent('omicho,higashi,castle,kenroku,daisetz,station');
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('滞在のみの終了');
  });

  it('出発時刻を変えると、滞在時間を保ったまま終了時刻が変わる', async () => {
    await renderSample();
    fireEvent.change(screen.getByLabelText('出発時刻'), { target: { value: '10:30' } });

    expect(screen.getByTestId('trip-summary')).toHaveTextContent('14:45');
    expect(screen.getByTestId('trip-stop-omicho')).toHaveStyle({ width: '90px' });
  });

  it('数値欄を消して入力し直せ、範囲外の時間は確定時に上限へ収める', async () => {
    const user = userEvent.setup();
    await renderSample();
    const duration = screen.getByLabelText('滞在時間（分）');

    await user.clear(duration);
    await user.type(duration, '90');
    await user.tab();
    expect(duration).toHaveValue(90);
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('14:00');

    await user.clear(duration);
    await user.type(duration, '999');
    await user.tab();
    expect(duration).toHaveValue(240);
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('16:30');
  });

  it('棒の端はキーボードでも調整でき、選択中の予定と数値欄が一致する', async () => {
    const user = userEvent.setup();
    await renderSample();
    const slider = screen.getByRole('slider', { name: 'ひがし茶屋街の滞在時間' });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(slider).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByLabelText('滞在時間（分）')).toHaveValue(75);
    expect(screen.getByRole('button', { name: 'ひがし茶屋街、滞在75分' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('trip-stop-higashi')).toHaveStyle({ width: '150px' });
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:30');
  });

  it('端のドラッグを離した後は時間が変わらず、クリックでも元の時間へ戻らない', async () => {
    await renderSample();
    const slider = screen.getByRole('slider', { name: '近江町市場の滞在時間' });
    Object.defineProperty(slider, 'setPointerCapture', { value: vi.fn() });

    fireEvent(slider, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100 }));
    fireEvent(slider, new MouseEvent('pointermove', { bubbles: true, clientX: 160 }));
    fireEvent.pointerUp(slider);
    fireEvent.click(slider);
    fireEvent(slider, new MouseEvent('pointermove', { bubbles: true, clientX: 220 }));

    expect(slider).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByLabelText('滞在時間（分）')).toHaveValue(75);
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('13:45');
  });

  it('すべての予定を外しても、新しい場所を追加して再開できる', async () => {
    const user = userEvent.setup();
    await renderSample();
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole('button', { name: '予定から外す' }));
    }

    expect(screen.getByTestId('map-stop-order')).toBeEmptyDOMElement();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('09:00');
    await user.click(screen.getByRole('button', { name: '場所を追加（テスト）' }));
    expect(screen.getByRole('button', { name: '金沢駅、滞在45分' })).toBeInTheDocument();
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('09:45');
  });

  it('外した場所を再追加してから取り消しても、それぞれの訪問を独立して外せる', async () => {
    const user = userEvent.setup();
    await renderSample();
    await user.click(screen.getByRole('button', { name: '場所を追加（テスト）' }));
    await user.click(screen.getByRole('button', { name: '予定から外す' }));
    await user.click(screen.getByRole('button', { name: '場所を追加（テスト）' }));
    await user.click(screen.getByRole('button', { name: '元に戻す' }));

    expect(screen.getAllByRole('button', { name: '金沢駅、滞在45分' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '予定から外す' }));
    expect(screen.getAllByRole('button', { name: '金沢駅、滞在45分' })).toHaveLength(1);
  });
});
