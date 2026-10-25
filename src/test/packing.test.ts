import { describe, expect, it } from 'vitest';
import { emptyPacking, suggestPacking } from '@/components/pages/trip-planner/packing';

describe('旅先と目的に合う持ち物', () => {
  it('自由入力のスキー旅行から道具とチケット、防寒具を提案する', () => {
    const result = suggestPacking({ ...emptyPacking(), destination: '冬の白馬', purpose: 'スキーと温泉' });
    const names = result.items.map((item) => item.name).join('、');
    expect(names).toContain('スキー板');
    expect(names).toContain('リフト券');
    expect(names).toContain('タオル');
    expect(result.items.filter((item) => item.id === 'warm')).toHaveLength(1);
    expect(result.items.find((item) => item.id === 'warm')?.reason).toContain('雪・寒さ');
    expect(names).not.toContain('サーフボード');
  });

  it('海水浴とサーフィンを区別し、目的の選択だけでも提案できる', () => {
    const beach = suggestPacking({ ...emptyPacking(), destination: '海', purpose: 'のんびり過ごす' });
    expect(beach.items.some((item) => item.id === 'swimwear')).toBe(true);
    expect(beach.items.some((item) => item.id === 'surfboard')).toBe(false);
    const surf = suggestPacking({ ...emptyPacking(), activities: ['beach', 'surf'] });
    expect(surf.items.some((item) => item.id === 'surfboard')).toBe(true);
    expect(surf.items.filter((item) => item.id === 'sun')).toHaveLength(1);
    expect(surf.items.some((item) => item.id === 'ski-gear')).toBe(false);
  });

  it('北海道を海と誤認せず、未対応の目的でも基本の持ち物を提案する', () => {
    const result = suggestPacking({ ...emptyPacking(), destination: '北海道', purpose: '友人に会う' });
    expect(result.items.some((item) => item.id === 'wallet')).toBe(true);
    expect(result.items.some((item) => item.id === 'booking')).toBe(true);
    expect(result.items.some((item) => item.id === 'swimwear')).toBe(false);
  });

  it('目的を変えると古い道具を除き、共通のチェックと自分の持ち物を残す', () => {
    const ski = suggestPacking({ ...emptyPacking(), activities: ['ski'] });
    ski.items.find((item) => item.id === 'wallet')!.checked = true;
    ski.items.push({ id: 'custom-camera', name: 'カメラ', reason: '自分で追加', checked: true, custom: true });
    const beach = suggestPacking({ ...ski, activities: ['beach'] });
    expect(beach.items.some((item) => item.id === 'ski-gear')).toBe(false);
    expect(beach.items.find((item) => item.id === 'wallet')?.checked).toBe(true);
    expect(beach.items.find((item) => item.id === 'swimwear')?.checked).toBe(false);
    expect(beach.items.find((item) => item.id === 'custom-camera')).toMatchObject({ name: 'カメラ', checked: true });
  });
});
