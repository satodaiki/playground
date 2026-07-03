// ヒーロー。署名要素：解放の瞬間に題字の字間がほどけて広がる（CSS の .is-released）。
export default function Hero({ released }: { released: boolean }) {
  return (
    <header className="ftb-hero">
      <p className="ftb-kicker">FREE THE BIRDS</p>
      <h1 className={`ftb-title${released ? ' is-released' : ''}`}>籠の外へ</h1>
      <p className="ftb-tagline">
        {released
          ? '誰も命じていないのに、群れは形を見つける。'
          : '扉を開けたとき、自由がどんな形になるか見てみよう。'}
      </p>
    </header>
  );
}
