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
    let photoSequence = 0;
    createObjectURL.mockReset().mockImplementation(() => `blob:photo-${++photoSequence}`);
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

  it('写真をまとめて追加し、追加入力・個別削除・再表示でも残りの写真を保つ', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(booklet(true, onClose));
    const first = new File(['beach'], 'beach.jpg', { type: 'image/jpeg' });
    const second = new File(['cafe'], 'cafe.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('しおりの写真'), [first, second]);
    expect(screen.getByText('2枚の思い出')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(createObjectURL).toHaveBeenCalledWith(first);
    expect(createObjectURL).toHaveBeenCalledWith(second);
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeDisabled();
    fireEvent.load(screen.getByAltText('旅の写真 1'));
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeDisabled();
    fireEvent.load(screen.getByAltText('旅の写真 2'));
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();

    await user.upload(screen.getByLabelText('しおりの写真'), first);
    expect(screen.getByText('3枚の思い出')).toBeInTheDocument();
    expect(screen.getByAltText('旅の写真 1')).toHaveAttribute('src', 'blob:photo-1');
    expect(screen.getByAltText('旅の写真 3')).toHaveAttribute('src', 'blob:photo-3');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeDisabled();
    fireEvent.load(screen.getByAltText('旅の写真 3'));
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '旅程に戻る' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(booklet(false, onClose));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.rerender(booklet(true, onClose));
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeDisabled();
    screen.getAllByRole('img').forEach((image) => fireEvent.load(image));

    await user.click(screen.getByRole('button', { name: '写真2をアルバムから外す' }));
    expect(screen.getByText('2枚の思い出')).toBeInTheDocument();
    expect(screen.getByAltText('旅の写真 1')).toHaveAttribute('src', 'blob:photo-1');
    expect(screen.getByAltText('旅の写真 2')).toHaveAttribute('src', 'blob:photo-3');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-3');
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it.each([
    new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }),
    new File(['photo'], 'image.heic', { type: 'image/heic' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
  ])('形式の許可リストや10MB上限で写真を拒否しない: $name', (file) => {
    render(booklet());
    fireEvent.change(screen.getByLabelText('しおりの写真'), { target: { files: [file] } });
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(file);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('形式情報が空の写真も他の写真と一緒に追加できる', () => {
    render(booklet());
    const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const unknown = new File(['photo'], 'unknown.jpg');
    fireEvent.change(screen.getByLabelText('しおりの写真'), { target: { files: [unknown, photo] } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(createObjectURL).toHaveBeenCalledWith(unknown);
    expect(createObjectURL).toHaveBeenCalledWith(photo);
  });

  it('一部の写真の読み込みに失敗しても、残りの写真と追加済みの写真を保つ', async () => {
    render(booklet());
    const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('しおりの写真'), photo);
    createObjectURL.mockImplementationOnce(() => { throw new Error('Read failed'); });
    fireEvent.change(screen.getByLabelText('しおりの写真'), { target: { files: [photo, photo] } });
    expect(screen.getByRole('alert')).toHaveTextContent('読み込めない写真');
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('壊れた画像だけを外し、他の写真は印刷と追加を続けられる', async () => {
    const view = render(booklet());
    await userEvent.upload(screen.getByLabelText('しおりの写真'), [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }), new File(['broken'], 'broken.png', { type: 'image/png' })]);
    fireEvent.load(screen.getByAltText('旅の写真 1'));
    fireEvent.error(screen.getByAltText('旅の写真 2'));
    expect(screen.getByRole('alert')).toHaveTextContent('表示できない写真をアルバムから外しました');
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '印刷・PDF保存' })).toBeEnabled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
    await userEvent.upload(screen.getByLabelText('しおりの写真'), new File(['photo'], 'photo.png', { type: 'image/png' }));
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo-3');
  });
});
