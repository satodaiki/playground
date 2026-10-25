import { useState } from 'react';
import { Backpack, Plus, Trash2 } from 'lucide-react';
import { ACTIVITIES, packingContext, suggestPacking } from './packing';
import type { PackingDraft } from './packing';

type Props = { value: PackingDraft; onChange(value: PackingDraft): void; stopNames: string[] };

export default function PackingChecklist({ value, onChange, stopNames }: Props) {
  const [customName, setCustomName] = useState('');
  const ready = value.items.filter((item) => item.checked).length;
  const changed = value.generatedFor !== null && value.generatedFor !== packingContext(value);
  const canSuggest = Boolean(value.destination.trim() || value.purpose.trim() || value.activities.length);

  return (
    <section className="tp-packing" aria-labelledby="tp-packing-title">
      <div className="tp-section-heading">
        <div><p className="tp-eyebrow">PACK FOR YOUR DAY</p><h2 id="tp-packing-title"><Backpack size={19} aria-hidden="true" />旅に合う持ち物</h2></div>
        {value.items.length > 0 && <span role="status">準備済み {ready} / {value.items.length}</span>}
      </div>
      <div className="tp-packing-body">
        <p className="tp-packing-description">行く場所と、そこでやりたいことから。忘れたくないものを、一緒に揃えよう。</p>
        <form onSubmit={(event) => { event.preventDefault(); if (canSuggest) onChange(suggestPacking(value)); }}>
          <div className="tp-packing-fields">
            <label htmlFor="tp-destination">旅先・場所の情報<input id="tp-destination" maxLength={500} value={value.destination} placeholder="例：冬の白馬、沖縄のビーチ" onChange={(event) => onChange({ ...value, destination: event.target.value })} /></label>
            <label htmlFor="tp-purpose">旅の目的・やりたいこと<input id="tp-purpose" maxLength={500} value={value.purpose} placeholder="例：スキーを楽しんで、温泉に入る" onChange={(event) => onChange({ ...value, purpose: event.target.value })} /></label>
          </div>
          {stopNames.length > 0 && <button className="tp-use-stops" type="button" onClick={() => onChange({ ...value, destination: stopNames.join('、').slice(0, 500) })}>旅程の場所を入力する</button>}
          <fieldset className="tp-activities"><legend>目的を選んでも始められます（複数選択可）</legend><div>{ACTIVITIES.map((activity) => <button key={activity.id} type="button" aria-pressed={value.activities.includes(activity.id)} onClick={() => onChange({ ...value, activities: value.activities.includes(activity.id) ? value.activities.filter((id) => id !== activity.id) : [...value.activities, activity.id] })}>{activity.label}</button>)}</div></fieldset>
          <div className="tp-packing-submit"><button className="tp-primary" type="submit" disabled={!canSuggest}><Backpack size={16} aria-hidden="true" />{value.generatedFor === null ? '持ち物を提案' : '持ち物を提案し直す'}</button><p>選んだ目的と入力キーワードから提案します。天気・施設の備品・レンタル条件に合わせて調整してください。</p></div>
        </form>
        {changed && <p className="tp-packing-changed" role="status">条件を変更しました。「持ち物を提案し直す」でリストを更新できます。</p>}
        {value.items.length > 0 && <>
          <div className="tp-packing-progress"><label htmlFor="tp-packing-progress">{ready === value.items.length ? '準備が整いました' : `あと${value.items.length - ready}個で準備完了`}</label><progress id="tp-packing-progress" value={ready} max={value.items.length} /></div>
          <ul className="tp-packing-list" aria-label="持ち物チェックリスト">{value.items.map((item) => <li key={item.id} className={item.checked ? 'is-packed' : ''}>
            <label><input type="checkbox" checked={item.checked} onChange={() => onChange({ ...value, items: value.items.map((current) => current.id === item.id ? { ...current, checked: !current.checked } : current) })} /><span><strong>{item.name}</strong><small>{item.reason}</small></span></label>
            <button type="button" aria-label={`${item.name}を持ち物から外す`} onClick={() => onChange({ ...value, items: value.items.filter((current) => current.id !== item.id) })}><Trash2 size={15} aria-hidden="true" /></button>
          </li>)}</ul>
        </>}
        <form className="tp-custom-packing" onSubmit={(event) => {
          event.preventDefault();
          const name = customName.trim();
          if (!name) return;
          onChange({ ...value, items: [...value.items, { id: `custom-${crypto.randomUUID()}`, name, reason: '自分で追加', checked: false, custom: true }] });
          setCustomName('');
        }}><label htmlFor="tp-custom-item">自分に必要なものを追加</label><div><input id="tp-custom-item" value={customName} maxLength={150} placeholder="例：カメラ、子どものお気に入り" onChange={(event) => setCustomName(event.target.value)} /><button type="submit" aria-label="持ち物を追加" disabled={!customName.trim()}><Plus size={17} aria-hidden="true" />追加</button></div></form>
        {value.generatedFor !== null && <p className="tp-packing-note">提案し直しても、自分で追加したものと共通項目のチェックは残ります。外した提案項目は再び候補に入ります。</p>}
      </div>
    </section>
  );
}
