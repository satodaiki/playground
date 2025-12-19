import React, { useState, useRef, useEffect } from 'react';

import bellSoundFile from './assets/bonsho.mp3'; 

export default function JoyaNoKane() {
  const canvasRef = useRef(null);
  const [strikeCount, setStrikeCount] = useState(0);

  const mousePosRef = useRef({ x: 0, y: 0 });
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  const physicsRef = useRef({
    bellSwing: 0,
    bellVelocity: 0,
    hammerRecoil: 0,
    hammerRecoilVelocity: 0
  });

  const lastStrikeTimeRef = useRef(0);
  const animationRef = useRef(null);

  const levelThresholds = [
    { threshold: 0, multiplier: 1, label: "Lv.0: 凡夫", message: "" },
    { threshold: 10, multiplier: 2, label: "Lv.1: 修行者", message: "✨ 心身浄化 ✨" },
    { threshold: 30, multiplier: 4, label: "Lv.2: 熟練者", message: "✨ 意気軒昂 ✨" },
    { threshold: 50, multiplier: 8, label: "Lv.3: 達人", message: "✨ 精神統一 ✨" },
    { threshold: 108, multiplier: 16, label: "Lv.4: 羅漢", message: "🔔 煩 悩 消 滅 🔔" },
    { threshold: 300, multiplier: 32, label: "Lv.5: 菩薩", message: "🔔 四 智 円 明 🔔" },
    { threshold: 500, multiplier: 64, label: "Lv.6: 明王", message: "🔥 破 邪 顕 正 🔥" },
    { threshold: 1080, multiplier: 108, label: "Lv.7: 如来", message: "✨ 功 徳 無 量 ✨" },
    { threshold: 3000, multiplier: 216, label: "Lv.8: 聖者", message: "✨ 諸 行 無 常 ✨" },
    { threshold: 5000, multiplier: 432, label: "Lv.9: 大聖者", message: "✨ 色 即 是 空 ✨" },
    { threshold: 10800, multiplier: 1080, label: "Lv.10: 超越者", message: "🌌 宇 宙 の 真 理 🌌" },
    { threshold: 30000, multiplier: 2160, label: "Lv.11: 半神", message: "🌌 超 越 瞑 想 🌌" },
    { threshold: 50000, multiplier: 4320, label: "Lv.12: 現人神", message: "🌌 天 上 天 下 🌌" },
    { threshold: 108000, multiplier: 10800, label: "Lv.13: 世界の理", message: "🌌 唯 我 独 尊 🌌" },
    { threshold: 300000, multiplier: 21600, label: "Lv.14: 銀河の意志", message: "🪐 銀 河 旋 回 🪐" },
    { threshold: 500000, multiplier: 43200, label: "Lv.15: 星々の導き", message: "🪐 因 果 応 報 🪐" },
    { threshold: 1080000, multiplier: 108000, label: "Lv.MAX: 終焉と始原の理", message: "♾️ 寂 滅 為 楽 ♾️" },
  ];

  const getCurrentLevelInfo = () => {
    let current = levelThresholds[0];
    for (const level of levelThresholds) {
      if (strikeCount >= level.threshold) current = level;
      else break;
    }
    return current;
  };

  const currentLevel = getCurrentLevelInfo();
  const isMaxLevel = strikeCount >= 1080000;

  const playBellSound = (lvIdx) => {
    // 【変更点2】インポートした変数(bellSoundFile)を渡します
    const audio = new Audio(bellSoundFile);
    
    // 再生速度（ピッチ）の変化演出
    const rate = Math.max(0.6, 1.0 - (lvIdx * 0.025));
    audio.playbackRate = rate;
    
    // エラーハンドリング（自動再生ブロック対策など）
    audio.play().catch(e => {
      console.warn("音声再生エラー: 画面をクリックしてから操作してください", e);
    });
  };

  const onMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    prevMousePosRef.current = { ...mousePosRef.current };
    mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const animate = () => {
      const p = physicsRef.current;
      const m = mousePosRef.current;
      const pm = prevMousePosRef.current;
      const now = Date.now();
      const info = getCurrentLevelInfo();
      const lvIdx = levelThresholds.indexOf(info);

      // --- 物理演算 ---
      p.bellSwing += p.bellVelocity * 0.016;
      p.bellVelocity = (p.bellVelocity - p.bellSwing * 0.04) * 0.99;
      p.hammerRecoil += p.hammerRecoilVelocity * 0.016;
      p.hammerRecoilVelocity = (p.hammerRecoilVelocity - p.hammerRecoil * 0.2) * 0.9;

      // --- 衝突判定 ---
      const bellCenterX = 400 + p.bellSwing;
      const hL = 260 + (lvIdx * 4); 
      const hammerCenterX = m.x + p.hammerRecoil;
      
      const hammerLeft = hammerCenterX - (hL / 2);
      const hammerRight = hammerCenterX + (hL / 2);

      const bellHitRadius = 60; 
      const bellLeft = bellCenterX - bellHitRadius;
      const bellRight = bellCenterX + bellHitRadius;

      const isOverlapping = hammerRight > bellLeft && hammerLeft < bellRight;
      const mouseSpeed = Math.abs(m.x - pm.x);
      const moveDir = m.x - pm.x;
      const isCooldownOver = now - lastStrikeTimeRef.current > 150;

      if (isOverlapping && isCooldownOver && mouseSpeed > 1.5) {
        let hitDetected = false;

        // 左側からの打撃
        if (moveDir > 0 && hammerCenterX < bellCenterX + 30) {
          hitDetected = true;
          p.bellVelocity += Math.max(mouseSpeed * 3.0, 20) * (1 + lvIdx * 0.1);
          p.hammerRecoilVelocity = -Math.max(mouseSpeed * 10.0, 80);
        }
        // 右側からの打撃
        else if (moveDir < 0 && hammerCenterX > bellCenterX - 30) {
          hitDetected = true;
          p.bellVelocity -= Math.max(mouseSpeed * 3.0, 20) * (1 + lvIdx * 0.1);
          p.hammerRecoilVelocity = Math.max(mouseSpeed * 10.0, 80);
        }

        if (hitDetected) {
          lastStrikeTimeRef.current = now;
          playBellSound(lvIdx);
          setStrikeCount(prev => prev + info.multiplier);
        }
      }

      // --- 描画 ---
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = isMaxLevel ? `hsl(${(now/50)%360}, 15%, 5%)` : '#020617';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 梁
        ctx.fillStyle = '#2d1a0a';
        ctx.fillRect(0, 0, canvas.width, 40);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(400, 40);
        ctx.lineTo(bellCenterX, 140);
        ctx.stroke();

        // 鐘
        ctx.save();
        ctx.translate(bellCenterX, 240);
        ctx.rotate(p.bellSwing * 0.002);
        
        if (isMaxLevel) {
          ctx.shadowBlur = 40;
          ctx.shadowColor = `hsl(${(now/5)%360}, 100%, 70%)`;
        }
        const grd = ctx.createLinearGradient(-60, 0, 60, 0);
        if (isMaxLevel) {
          const h = (now / 5) % 360;
          grd.addColorStop(0, `hsl(${h}, 60%, 20%)`);
          grd.addColorStop(0.5, `hsl(${h}, 90%, 50%)`);
          grd.addColorStop(1, `hsl(${h}, 60%, 20%)`);
        } else {
          grd.addColorStop(0, '#1e293b');
          grd.addColorStop(0.5, '#475569');
          grd.addColorStop(1, '#1e293b');
        }
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(-50, -100); ctx.lineTo(50, -100);
        ctx.quadraticCurveTo(80, 80, 90, 100); ctx.lineTo(-90, 100);
        ctx.quadraticCurveTo(-80, 80, -50, -100);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-65, -20); ctx.lineTo(65, -20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-85, 60); ctx.lineTo(85, 60); ctx.stroke();
        ctx.restore();

        // 杵
        if (m.x > 0) {
          const hX = m.x + p.hammerRecoil;
          const hY = m.y;
          const hW = 35 + (lvIdx * 1.5);
          
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(hX - hL/2 + 40, 0); ctx.lineTo(hX - hL/2 + 40, hY - 15);
          ctx.moveTo(hX + hL/2 - 40, 0); ctx.lineTo(hX + hL/2 - 40, hY - 15);
          ctx.stroke();
          
          ctx.fillStyle = lvIdx >= 10 ? `hsl(${(now / 5) % 360}, 80%, 60%)` : (lvIdx >= 5 ? '#eab308' : '#5c3a21');
          ctx.fillRect(hX - hL/2, hY - hW/2, hL, hW);
          
          ctx.strokeStyle = isOverlapping ? '#fff' : 'rgba(255,255,255,0.3)';
          ctx.lineWidth = isOverlapping ? 3 : 1;
          ctx.strokeRect(hX - hL/2, hY - hW/2, hL, hW);
        }

        // UI
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 22px serif';
        ctx.textAlign = 'left';
        ctx.fillText(`累計徳: ${strikeCount.toLocaleString()}`, 30, 80);
        
        ctx.fillStyle = isMaxLevel ? `hsl(${(now/10)%360}, 100%, 75%)` : '#38bdf8';
        ctx.font = 'bold 24px serif';
        ctx.fillText(info.label, 30, 115);
        
        ctx.fillStyle = isMaxLevel ? '#fbbf24' : '#94a3b8';
        ctx.font = '16px serif';
        ctx.fillText(`威力: +${info.multiplier.toLocaleString()}`, 30, 145);

        if (info.message) {
          ctx.textAlign = 'center';
          ctx.font = `bold ${40 + Math.min(lvIdx * 2, 30)}px serif`;
          ctx.fillStyle = lvIdx >= 10 ? `hsl(${(now/5)%360}, 100%, 75%)` : '#fbbf24';
          if (lvIdx >= 10) { ctx.shadowBlur = 25; ctx.shadowColor = 'white'; }
          ctx.fillText(info.message, canvas.width / 2, 540);
          ctx.shadowBlur = 0;
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [strikeCount]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <div className="mb-4">
        <button onClick={() => setStrikeCount(0)} className="px-6 py-2 bg-slate-900 text-slate-500 rounded-full text-xs hover:bg-red-950 hover:text-white transition-all border border-slate-800">
          リセット
        </button>
      </div>
      <canvas 
        ref={canvasRef} width={800} height={600} 
        onMouseMove={onMouseMove} 
        className="rounded-3xl shadow-2xl cursor-none border border-slate-900 bg-black" 
      />
      <p className="mt-4 text-slate-500 text-sm font-serif">
        ※ 最初にキャンバスを一度クリックしてください。その後、鐘を突くと音が鳴ります。
      </p>
      <p>
        <a href="https://otologic.jp">OtoLogic</a>提供の音声素材を使用しています。
      </p>
    </div>
  );
}