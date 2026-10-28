import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TripPlanner from '@/components/pages/TripPlanner';
import TripBooklet from '@/components/pages/trip-planner/TripBooklet';
import { emptyTrip, saveTripDraft } from '@/components/pages/trip-planner/draft';
import type { Stop } from '@/components/pages/trip-planner/draft';

vi.mock('@/components/pages/trip-planner/TripMap', () => ({ default: () => <div>地図</div> }));

const stops: Stop[] = [
  { id: 'station', name: '集合場所', address: '駅前広場', duration: 45, color: 0 },
  { id: 'beach', name: '海', address: '海水浴場入口', duration: 60, color: 1 },
];
const items = [
  { id: 'wallet', name: '財布', reason: 'どの旅にも', checked: true, custom: false },
  { id: 'swim-goggles', name: 'ゴーグル', reason: '海・ビーチ', checked: false, custom: false },
];
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function booklet(open = true, onClose = vi.fn()) {
  return <TripBooklet open={open} onClose={onClose}><h1 id="tp-booklet-title">旅のしおり</h1></TripBooklet>;
}

describe('紙のしおり', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    createObjectURL.mockReset().mockReturnValueOnce('blob:photo-1').mockReturnValueOnce('blob:photo-2');
    revokeObjectURL.mockReset();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('編集後の旅程・移動・翌日の時刻と持ち物の準備状態を印刷でき、編集に戻れる', async () => {
    const draft = emptyTrip();
    saveTripDraft({ ...draft, stops, departure: '23:30', packing: { ...draft.packing, destination: '海への旅行', items } });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: '集合場所から海への移動時間を追加' }));
    await user.clear(screen.getByLabelText('場所名'));
    await user.type(screen.getByLabelText('場所名'), '駅で集合{Enter}');
    await user.type(screen.getByLabelText('次に行きたい場所は？'), 'カフェ');
    await user.click(screen.getByRole('button', { name: 'しおり' }));

    const preview = screen.getByRole('region', { name: '旅のしおり' });
    expect(within(preview).getByRole('heading', { name: '駅で集合' })).toBeInTheDocument();
    expect(preview).toHaveTextContent('23:30 — 00:15（1日後） · 滞在45分');
    expect(preview).toHaveTextContent('00:30（1日後） — 01:30（1日後）');
    expect(preview).toHaveTextContent('次の場所まで徒歩：15分');
    expect(within(preview).getByText('駅前広場')).toBeInTheDocument();
    expect(within(preview).getByText('財布').closest('li')).toHaveTextContent('☑');
    expect(within(preview).getByText('ゴーグル').closest('li')).toHaveTextContent('☐');
    expect(screen.queryByRole('button', { name: '新しい旅程を作る' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '印刷・PDF保存' }));
    expect(print).toHaveBeenCalledExactlyOnceWith();

    await user.click(screen.getByRole('button', { name: '旅程に戻る' }));
    expect(screen.queryByRole('region', { name: '旅のしおり' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('次に行きたい場所は？')).toHaveValue('カフェ');
    fireEvent.change(screen.getByLabelText('滞在時間（分）'), { target: { value: '60' } });
    await user.click(screen.getByRole('button', { name: 'しおり' }));
    expect(screen.getByRole('region', { name: '旅のしおり' })).toHaveTextContent('23:30 — 00:30（1日後） · 滞在1時間');
  });

  it('移動時間が未入力なら、しおりでも目安の時刻と未入力区間を明示する', async () => {
    saveTripDraft({ ...emptyTrip(), stops });
    render(<TripPlanner />);
    await userEvent.click(screen.getByRole('button', { name: 'しおり' }));
    const preview = screen.getByRole('region', { name: '旅のしおり' });
    expect(preview).toHaveTextContent('1区間の移動時間が未入力');
    expect(preview).toHaveTextContent('終了目安');
    expect(preview).toHaveTextContent('次の場所まで徒歩：未入力');
  });

  it('空の旅程ではボタンを無効にし、持ち物だけでもしおりを作れる', async () => {
    const view = render(<TripPlanner />);
    expect(screen.getByRole('button', { name: 'しおり' })).toBeDisabled();
    view.unmount();
    const draft = emptyTrip();
    saveTripDraft({ ...draft, packing: { ...draft.packing, items } });
    render(<TripPlanner />);
    await userEvent.click(screen.getByRole('button', { name: 'しおり' }));
    expect(screen.getByRole('heading', { name: '持ち物チェックリスト' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '一日の旅程' })).not.toBeInTheDocument();
  });

  it('写真の読み込みを待って印刷し、閉じて開き直す・変更・削除時に写真を適切に扱う', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(booklet(true, onClose));
    const photo = new File(['photo'], 'beach.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('しおりの写真'), photo);
    expect(createObjectURL).toHaveBeenCalledWith(photo);
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeDisabled();
    fireEvent.load(screen.getByAltText('しおりの表紙写真'));
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '旅程に戻る' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(booklet(false, onClose));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.rerender(booklet(true, onClose));
    expect(screen.getByAltText('しおりの表紙写真')).toHaveAttribute('src', 'blob:photo-1');
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeDisabled();
    fireEvent.load(screen.getByAltText('しおりの表紙写真'));

    await user.upload(screen.getByLabelText('しおりの写真'), photo);
    expect(screen.getByAltText('しおりの表紙写真')).toHaveAttribute('src', 'blob:photo-2');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    await user.click(screen.getByRole('button', { name: '写真を外す' }));
    expect(screen.queryByAltText('しおりの表紙写真')).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();
  });

  it.each([
    new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
  ])('非対応の形式や大きすぎる写真は読み込まない: $name', (file) => {
    render(booklet());
    fireEvent.change(screen.getByLabelText('しおりの写真'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('10MB以下');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('壊れた画像は取り除き、写真なしで印刷を続けられる', async () => {
    const view = render(booklet());
    await userEvent.upload(screen.getByLabelText('しおりの写真'), new File(['broken'], 'broken.png', { type: 'image/png' }));
    fireEvent.error(screen.getByAltText('しおりの表紙写真'));
    expect(screen.getByRole('alert')).toHaveTextContent('写真を表示できませんでした');
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    await userEvent.upload(screen.getByLabelText('しおりの写真'), new File(['photo'], 'photo.png', { type: 'image/png' }));
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
  });
});
