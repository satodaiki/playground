// LEAP TO FREEDOM のヒーロー。署名要素＝水平線の上下で反転して映るタイトル。
export default function Hero() {
  return (
    <header className="ltf-hero">
      <div className="ltf-titleblock">
        <h1 className="ltf-title">LEAP TO FREEDOM</h1>
        <div className="ltf-horizon">
          <span className="ltf-axis" aria-hidden="true">
            ↕
          </span>
        </div>
        <span className="ltf-title ltf-title--echo" aria-hidden="true">
          LEAP TO FREEDOM
        </span>
      </div>
      <p className="ltf-tagline">
        重力は、ただの初期設定だ。ワンボタンで上下を反転し、 迫る壁の<em>あいだ</em>を抜けてゆけ。
      </p>
    </header>
  );
}
