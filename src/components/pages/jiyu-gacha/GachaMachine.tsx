// ガチャ筐体とレバー。引く操作は onPull、状態（読み込み・抽選中・振動）は props で受ける。
export default function GachaMachine({
  ready,
  rolling,
  shaking,
  onPull,
}: {
  ready: boolean;
  rolling: boolean;
  shaking: boolean;
  onPull: () => void;
}) {
  return (
    <>
      <div className={`jg-machine${shaking ? ' jg-shaking' : ''}`}>
        <div className="jg-dome">
          <div className="jg-capsule jg-c1" />
          <div className="jg-capsule jg-c2" />
          <div className="jg-capsule jg-c3" />
        </div>
        <div className="jg-slot" />
        <div className="jg-brand">JIYU</div>
      </div>

      <button className="jg-lever" onClick={onPull} disabled={!ready || rolling}>
        {ready ? 'レバーを引く' : '読み込み中…'}
      </button>
    </>
  );
}
