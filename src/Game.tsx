import { useState, useRef, useEffect } from 'react';
import AccordionItem from './components/AccordionItem';
import bellSoundFile from './assets/bonsho.mp3'; 

const BG_IMAGES_PATHS = {
  normal: {
    night: '/joyanokane/bg/normal_night.jpg',
    sunset: '/joyanokane/bg/normal_sunset.jpg',
    golden: '/joyanokane/bg/normal_golden.jpg',
    space: '/joyanokane/bg/normal_space.jpg',
    max: '/joyanokane/bg/normal_max.jpg'
  },
  hard: {
    blood: '/joyanokane/bg/hard_blood.jpg',
    fire: '/joyanokane/bg/hard_fire.jpg',
    abyss: '/joyanokane/bg/hard_abyss.jpg',
    ruin: '/joyanokane/bg/hard_ruin.jpg',
    void: '/joyanokane/bg/hard_void.jpg'
  }
};

export default function JoyaNoKane() {
  type BgType = typeof BG_IMAGES_PATHS;
  type CategoryType = keyof BgType;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strikeCount, setStrikeCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isHardMode, setIsHardMode] = useState(false);
  const [hasReachedMaxLevel, setHasReachedMaxLevel] = useState(false);
  const [loadedImages, setLoadedImages] = useState<{
    [K in CategoryType]: Partial<Record<keyof BgType[K], HTMLImageElement>>
  }>({ normal: {}, hard: {} });

  const mousePosRef = useRef({ x: 0, y: 0 });
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  
  const physicsRef = useRef({
    bellSwing: 0,       
    bellVelocity: 0,    
    hammerRecoil: 0,    
    hammerRecoilVelocity: 0
  });

  const lastStrikeTimeRef = useRef(0);
  const animationRef = useRef<number>(null);

  // --- 画像のプリロード ---
  useEffect(() => {
    const loadAllImages = async () => {
      const newImages: { [K in CategoryType]: Partial<Record<keyof BgType[K], HTMLImageElement>> } = {
        normal: {},
        hard: {}
      };
      
      const preloadCategory = async <T extends CategoryType>(cat: T) => {
        for (const [key, path] of Object.entries(BG_IMAGES_PATHS[cat])) {
          const bgKey = key as keyof BgType[T];
          
          const img = new Image();
          img.src = path;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const targetCategory = newImages[cat] as Partial<Record<keyof BgType[T], HTMLImageElement>>;

              targetCategory[bgKey] = img;
              resolve();
            };
            img.onerror = () => { resolve(); }; // 失敗しても続行
          });
        }
      };

      const categories: CategoryType[] = ['normal', 'hard'];

      for (const cat of categories) {
        await preloadCategory(cat);
      }

      setLoadedImages(newImages);
    };
    loadAllImages();
  }, []);

  const normalLevels = [
    { threshold: 0, multiplier: 1, label: "Lv.0: 凡夫", message: "「煩悩具足」", detail: "あらゆる煩悩を抱えたままの自分を見つめる。" },
    { threshold: 10, multiplier: 2, label: "Lv.1: 修行者", message: "✨ 心身浄化 ✨", detail: "雑念が消え、心と体が清まり始めた状態。" },
    { threshold: 30, multiplier: 4, label: "Lv.2: 熟練者", message: "✨ 意気軒昂 ✨", detail: "気力が充実し、迷いなく鐘を突く勢いが増す。" },
    { threshold: 50, multiplier: 8, label: "Lv.3: 達人", message: "✨ 精神統一 ✨", detail: "全神経が鐘の音と一体になり、研ぎ澄まされる。" },
    { threshold: 108, multiplier: 16, label: "Lv.4: 羅漢", message: "🔔 煩 悩 消 滅 🔔", detail: "108の煩悩を払い、聖者の域に足を踏み入れた証。" },
    { threshold: 300, multiplier: 32, label: "Lv.5: 菩薩", message: "🔔 四 智 円 明 🔔", detail: "智慧が完成され、鏡のように澄み渡った心の状態。" },
    { threshold: 500, multiplier: 64, label: "Lv.6: 明王", message: "🔥 破 邪 顕 正 🔥", detail: "猛々しい智慧の炎で、一切の邪悪を焼き払う。" },
    { threshold: 1080, multiplier: 108, label: "Lv.7: 如来", message: "✨ 功 徳 無 量 ✨", detail: "計り知れない徳を積み、真理そのものに到達する。" },
    { threshold: 3000, multiplier: 216, label: "Lv.8: 聖者", message: "✨ 諸 行 無 常 ✨", detail: "万物が変化し続ける真理を、音の中に悟る。" },
    { threshold: 5000, multiplier: 432, label: "Lv.9: 大聖者", message: "✨ 色 即 是 空 ✨", detail: "この世の実体は空であり、形あるものに囚われない。" },
    { threshold: 10800, multiplier: 1080, label: "Lv.10: 超越者", message: "🌌 宇 宙 の 真 理 🌌", detail: "個の存在を超え、宇宙の法則と完全に同化する。" },
    { threshold: 30000, multiplier: 2160, label: "Lv.11: 半神", message: "🌌 超 越 瞑 想 🌌", detail: "深い静寂の中で、あらゆる因果を超越する。" },
    { threshold: 50000, multiplier: 4320, label: "Lv.12: 現人神", message: "🌌 天 上 天 下 🌌", detail: "自らが尊い存在であることを全身で体現する。" },
    { threshold: 108000, multiplier: 10800, label: "Lv.13: 世界の理", message: "🌌 唯 我 独 尊 🌌", detail: "全宇宙において、代えがたい唯一無二の理となる。" },
    { threshold: 300000, multiplier: 21600, label: "Lv.14: 銀河の意志", message: "🪐 銀 河 旋 回 🪐", detail: "巨大な星々の流れそのものが、あなたの鐘の音となる。" },
    { threshold: 500000, multiplier: 43200, label: "Lv.15: 星々の導き", message: "🪐 因 果 応 報 🪐", detail: "善き行いが宇宙を巡り、永遠の輝きへと導かれる。" },
    { threshold: 1080000, multiplier: 108000, label: "Lv.MAX: 寂滅為楽", message: "♾️ 終 焉 と 始 原 ♾️", detail: "音は無となり、無は音となる。究極の安らぎ。" },
  ];

  const hardLevels = [
    { threshold: 0, multiplier: 1, label: "Lv.0 極・凡夫", message: "「無知の自覚」", detail: "己の慢心と無知を砕け。道は険しく遠い。" },
    { threshold: 10, multiplier: 1, label: "Lv.1 修羅・一級", message: "🌑 血気沈静 🌑", detail: "浅はかな情熱を捨てよ。冷徹な集中こそが力となる。" },
    { threshold: 30, multiplier: 2, label: "Lv.2 修羅・二級", message: "🌑 剛勇無双 🌑", detail: "迷いは断たれた。一突きに魂の重さを乗せよ。" },
    { threshold: 50, multiplier: 2, label: "Lv.3 修羅・三級", message: "🌑 鋼鉄の意志 🌑", detail: "肉体の限界は疾うに超えた。ここからは精神の削り合い。" },
    { threshold: 108, multiplier: 3, label: "Lv.4 因果の囚人", message: "💀 輪 回 転 生 💀", detail: "108を数えてなお、この苦行は終わらぬ。因果を直視せよ。" },
    { threshold: 300, multiplier: 4, label: "Lv.5 孤独な闘争", message: "💀 焦 熱 地 獄 💀", detail: "助けなどない。ただ独り、この響きを深淵へ届けるのみ。" },
    { threshold: 500, multiplier: 5, label: "Lv.6 絶望の淵", message: "💀 大 叫 喚 💀", detail: "叫びすら音に吸い込まれる。絶望こそが真実への近道。" },
    { threshold: 1080, multiplier: 8, label: "Lv.7 修羅の開眼", message: "🔥 阿 修 羅 道 🔥", detail: "慈悲を捨て、ひたすらに突き続ける修羅の眼が開く。" },
    { threshold: 3000, multiplier: 10, label: "Lv.8 不動明王", message: "🔥 降 魔 鎮 圧 🔥", detail: "動じぬ心。眼前の魔を、己の内なる弱さを、ただ叩き潰す。" },
    { threshold: 5000, multiplier: 15, label: "Lv.9 冥府の門番", message: "🔥 無 間 地 獄 🔥", detail: "門は開かれた。終わりなき修行の深層へと足を踏み入れる。" },
    { threshold: 10800, multiplier: 25, label: "Lv.10 深淵の王", message: "🌌 虚 無 の 淵 🌌", detail: "光すら届かぬ場所で、自らが光であることを否定し、闇を統べる。" },
    { threshold: 30000, multiplier: 50, label: "Lv.11 理の破壊者", message: "🌌 既存の終焉 🌌", detail: "世界の法則を疑い、自らの拳で新たな理を刻み込む。" },
    { threshold: 50000, multiplier: 80, label: "Lv.12 星辰の掠奪者", message: "🌌 恒 星 崩 壊 🌌", detail: "星の輝きすら己の業に取り込む。宇宙があなたの前で震える。" },
    { threshold: 108000, multiplier: 150, label: "Lv.13 修羅の無極", message: "🌌 絶 対 零 度 🌌", detail: "熱も感情も失せ、ただ一つの純粋な「打撃」という事象となる。" },
    { threshold: 300000, multiplier: 300, label: "Lv.14 次元の狭間", message: "🪐 空 間 歪 曲 🪐", detail: "もはや鐘を突く音は、次元の壁を穿ち、異界へ響き渡る。" },
    { threshold: 500000, multiplier: 500, label: "Lv.15 因果の支配者", message: "🪐 運 命 捏 造 🪐", detail: "過去も未来も、この一突きで書き換えられる。神の領域への侵犯。" },
    { threshold: 1080000, multiplier: 1080, label: "Lv.MAX 究極の虚無", message: "♾️ 零 の 凱 旋 ♾️", detail: "何もかもを破壊し尽くし、唯一無二の「無」へと至った。" },
  ];

  // 到達済みの最大レベルインデックスを管理 (最初は 0)
  // モード別に最大到達レベルを管理
  const [maxReachedLevels, setMaxReachedLevels] = useState({
    normal: 0,
    hard: 0
  });
  // 現在表示・適用しているレベルインデックス
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  
  const levels = isHardMode ? hardLevels : normalLevels;
  const currentModeKey = isHardMode ? 'hard' : 'normal';

  // --- スコア更新時の自動レベルアップ処理 ---
  useEffect(() => {
    let targetIdx = 0;
    for (let i = 0; i < levels.length; i++) {
      if (strikeCount >= levels[i].threshold) {
        targetIdx = i;
      } else break;
    }

    // 現在のモードの最大到達レベルをチェック・更新
    if (targetIdx > maxReachedLevels[currentModeKey]) {
      setMaxReachedLevels(prev => ({
        ...prev,
        [currentModeKey]: targetIdx
      }));
      // 新しいレベルに到達したら自動で表示も切り替える
      setCurrentLevelIdx(targetIdx);
    }
  }, [strikeCount, isHardMode, levels, maxReachedLevels, currentModeKey]);

  // --- モード切替時の処理 ---
  const toggleHardMode = () => {
    const nextMode = !isHardMode;
    setIsHardMode(nextMode);
    setStrikeCount(0); // モード切替でスコアはリセット
    setIsPaused(false);
    setShowConfirm(false);
    
    // 切り替え先のモードでの最大到達レベルに表示を合わせる
    const nextModeKey = nextMode ? 'hard' : 'normal';
    setCurrentLevelIdx(maxReachedLevels[nextModeKey]);
  };

  // --- レベルを手動で変更する関数 ---
  const changeLevel = (idx: number) => {
    // 現在のモードの最大到達範囲内でのみ変更可能
    if (idx >= 0 && idx <= maxReachedLevels[currentModeKey]) {
      setCurrentLevelIdx(idx);
    }
  };

  const info = levels[currentLevelIdx];
  const nextLevel = levels[currentLevelIdx + 1] || null;
  const lvIdx = (isHardMode ? hardLevels : normalLevels).indexOf(info);

  const [isSoundEnabled, setIsSoundEnabled] = useState(true); // サウンド設定ステータス
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);
  const MAX_CONCURRENT_SOUNDS = 3;

  // --- サウンド切り替え関数 ---
  const toggleSound = () => {
    const nextState = !isSoundEnabled;
    setIsSoundEnabled(nextState);
    
    // オフにした瞬間、鳴っている音をすべて止める
    if (!nextState) {
      audioPoolRef.current.forEach((audio: HTMLAudioElement) => {
        audio.pause();
        audio.src = "";
      });
      audioPoolRef.current = [];
    }
  };

  // --- 音声再生関数 ---
  const playBellSound = () => {
    if (!isSoundEnabled) {
      if (audioPoolRef.current.length > 0) {
        audioPoolRef.current.forEach((audio: HTMLAudioElement) => {
          audio.pause();
          audio.src = "";
        });
        audioPoolRef.current = [];
      }
      return;
    }

    // 1. すでに3つ再生されている場合は、最も古い音を停止して削除
    if (audioPoolRef.current.length >= MAX_CONCURRENT_SOUNDS) {
      const oldestAudio = audioPoolRef.current.shift()!;
      oldestAudio.pause();
      oldestAudio.src = ""; // メモリ解放を促進
    }

    // 2. 新しい音声インスタンスの作成
    const audio = new Audio(bellSoundFile);
    const rate = isHardMode 
      ? Math.max(0.4, 0.8 - (currentLevelIdx * 0.03))
      : Math.max(0.6, 1.0 - (currentLevelIdx * 0.025));
    audio.playbackRate = rate;
    
    // 音割れ防止のため、個々の音量をわずかに下げる（任意）
    audio.volume = 0.5; 

    // 3. プールに追加
    audioPoolRef.current.push(audio);

    // 4. 再生終了時にプールから削除する設定
    audio.onended = () => {
      audioPoolRef.current = audioPoolRef.current.filter(a => a !== audio);
    };

    audio.play().catch((err) => console.warn("再生失敗:", err));
  };

  // クリーンアップ（コンポーネント破棄時に音を止める）
  useEffect(() => {
    return () => {
      audioPoolRef.current.forEach((a: HTMLAudioElement) => {
        a.pause();
        a.src = "";
      });
    };
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    prevMousePosRef.current = { ...mousePosRef.current };
    mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const animate = () => {
      if (isPaused) return;
      const p = physicsRef.current;
      const m = mousePosRef.current;
      const pm = prevMousePosRef.current;
      const now = Date.now();
      
      const restoringForce = -p.bellSwing * 0.05; 
      p.bellVelocity += restoringForce;
      p.bellVelocity *= 0.98;
      p.bellSwing += p.bellVelocity;

      p.hammerRecoil += p.hammerRecoilVelocity;
      p.hammerRecoilVelocity = (p.hammerRecoilVelocity - p.hammerRecoil * 0.2) * 0.85;

      const bellCenterX = 400 + p.bellSwing;
      const hL = 260 + (lvIdx * 5); 
      const hammerCenterX = m.x + p.hammerRecoil;
      
      const bellLeft = bellCenterX - 60;
      const bellRight = bellCenterX + 60;
      const isOverlapping = (hammerCenterX + hL/2) > bellLeft && (hammerCenterX - hL/2) < bellRight;
      const mouseSpeed = Math.abs(m.x - pm.x);
      const isCooldownOver = now - lastStrikeTimeRef.current > 150;

      if (isOverlapping && isCooldownOver && mouseSpeed > 1.5) {
        let hitDetected = false;
        if (m.x - pm.x > 0 && hammerCenterX < bellCenterX + 30) {
          hitDetected = true;
          p.bellVelocity += Math.min(mouseSpeed * 1.5, 30); 
          p.hammerRecoilVelocity = -Math.min(mouseSpeed * 5.0, 50);
        } else if (m.x - pm.x < 0 && hammerCenterX > bellCenterX - 30) {
          hitDetected = true;
          p.bellVelocity -= Math.min(mouseSpeed * 1.5, 30);
          p.hammerRecoilVelocity = Math.min(mouseSpeed * 5.0, 50);
        }

        if (hitDetected) {
          lastStrikeTimeRef.current = now;
          playBellSound();
          let nextVal = strikeCount + info.multiplier;
          if (!isHardMode && nextVal >= 1080000) setHasReachedMaxLevel(true);
          if (strikeCount < 108 && nextVal >= 108) {
            setStrikeCount(108); setIsPaused(true); setShowConfirm(true);
          } else { setStrikeCount(nextVal); }
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let currentBgImg = null;
        let fallbackGradient = ctx.createLinearGradient(0, 0, 0, 600);
        if (!isHardMode) {
          if (strikeCount < 108) { currentBgImg = loadedImages.normal.night; fallbackGradient.addColorStop(0, '#020617'); fallbackGradient.addColorStop(1, '#0f172a'); }
          else if (strikeCount < 1080) { currentBgImg = loadedImages.normal.sunset; fallbackGradient.addColorStop(0, '#450a0a'); fallbackGradient.addColorStop(1, '#000'); }
          else if (strikeCount < 10800) { currentBgImg = loadedImages.normal.golden; fallbackGradient.addColorStop(0, '#422006'); fallbackGradient.addColorStop(1, '#000'); }
          else if (strikeCount < 1080000) { currentBgImg = loadedImages.normal.space; fallbackGradient.addColorStop(0, '#000000'); fallbackGradient.addColorStop(1, '#020617'); }
          else { currentBgImg = loadedImages.normal.max; fallbackGradient.addColorStop(0, '#000000'); fallbackGradient.addColorStop(1, '#1e1b4b'); }
        } else {
          if (strikeCount < 108) { currentBgImg = loadedImages.hard.blood; fallbackGradient.addColorStop(0, '#450a0a'); fallbackGradient.addColorStop(1, '#000000'); }
          else if (strikeCount < 1080) { currentBgImg = loadedImages.hard.fire; fallbackGradient.addColorStop(0, '#7f1d1d'); fallbackGradient.addColorStop(1, '#2a0a0a'); }
          else if (strikeCount < 10800) { currentBgImg = loadedImages.hard.abyss; fallbackGradient.addColorStop(0, '#000000'); fallbackGradient.addColorStop(1, '#1a1a1a'); }
          else if (strikeCount < 1080000) { currentBgImg = loadedImages.hard.ruin; fallbackGradient.addColorStop(0, '#2e0202'); fallbackGradient.addColorStop(1, '#000000'); }
          else { currentBgImg = loadedImages.hard.void; fallbackGradient.addColorStop(0, '#000000'); fallbackGradient.addColorStop(1, '#000000'); }
        }

        if (currentBgImg) ctx.drawImage(currentBgImg, 0, 0, 800, 600);
        else { ctx.fillStyle = fallbackGradient; ctx.fillRect(0, 0, 800, 600); if (strikeCount >= 10800) { ctx.fillStyle = "white"; for(let i=0; i<80; i++) { let x = (Math.sin(i*123)*0.5+0.5)*800; let y = (Math.cos(i*456)*0.5+0.5)*600; ctx.globalAlpha = Math.sin(now/800+i)*0.5+0.5; ctx.fillRect(x,y,1.2,1.2); } ctx.globalAlpha=1; } }

        ctx.fillStyle = isHardMode ? '#111' : '#2d1a0a'; ctx.fillRect(0, 0, 800, 40);
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(400, 40); ctx.lineTo(bellCenterX, 140); ctx.stroke();

        const isMax = strikeCount >= 1080000;
        const hue = (now / 5) % 360; 

        ctx.save(); ctx.translate(bellCenterX, 240); ctx.rotate(p.bellSwing * 0.001);
        let bellFill;
        if (isMax) { bellFill = ctx.createLinearGradient(-60, 0, 60, 0); bellFill.addColorStop(0, `hsl(${hue}, 80%, 50%)`); bellFill.addColorStop(0.5, `hsl(${(hue+90)%360}, 80%, 50%)`); bellFill.addColorStop(1, `hsl(${(hue+180)%360}, 80%, 50%)`); ctx.shadowBlur = 30; ctx.shadowColor = `hsl(${hue}, 100%, 70%)`; }
        else { bellFill = ctx.createLinearGradient(-60, 0, 60, 0); bellFill.addColorStop(0, isHardMode ? '#000' : '#1e293b'); bellFill.addColorStop(0.5, isHardMode ? '#333' : '#475569'); bellFill.addColorStop(1, isHardMode ? '#000' : '#1e293b'); ctx.shadowBlur = 0; }
        ctx.fillStyle = bellFill; ctx.beginPath(); ctx.moveTo(-50, -100); ctx.lineTo(50, -100); ctx.quadraticCurveTo(80, 80, 90, 100); ctx.lineTo(-90, 100); ctx.quadraticCurveTo(-80, 80, -50, -100); ctx.fill(); ctx.restore();

        if (m.x > 0 && !isPaused) {
          const hX = hammerCenterX; const hY = m.y; const hW = 35 + (lvIdx * 1.5);
          ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.moveTo(hX - hL/2 + 40, 0); ctx.lineTo(hX - hL/2 + 40, hY - 15); ctx.moveTo(hX + hL/2 - 40, 0); ctx.lineTo(hX + hL/2 - 40, hY - 15); ctx.stroke();
          if (isMax) { const hammerFill = ctx.createLinearGradient(hX - hL/2, hY, hX + hL/2, hY); hammerFill.addColorStop(0, `hsl(${(hue+180)%360}, 90%, 60%)`); hammerFill.addColorStop(1, `hsl(${hue}, 90%, 60%)`); ctx.fillStyle = hammerFill; ctx.shadowBlur = 20; ctx.shadowColor = `hsl(${hue}, 100%, 70%)`; }
          else { ctx.fillStyle = isHardMode ? '#7f1d1d' : (lvIdx >= 10 ? '#38bdf8' : (lvIdx >= 5 ? '#eab308' : '#5c3a21')); ctx.shadowBlur = 0; }
          ctx.fillRect(hX - hL/2, hY - hW/2, hL, hW);
        }

        ctx.shadowBlur = 0;
        ctx.fillStyle = isHardMode ? '#ef4444' : (isMax ? `hsl(${hue}, 100%, 85%)` : '#f8fafc'); 
        ctx.font = 'bold 22px serif'; ctx.textAlign = 'left';
        ctx.fillText(`除いた煩悩: ${strikeCount.toLocaleString()}`, 30, 80);
        
        ctx.fillStyle = isHardMode ? '#b91c1c' : (isMax ? `hsl(${hue}, 100%, 75%)` : '#38bdf8'); 
        ctx.font = 'bold 24px serif';
        ctx.fillText(info.label, 30, 115);

        ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 16px serif';
        ctx.fillText(`打ち消せる煩悩の数: ${info.multiplier.toLocaleString()}`, 30, 145);
        
        if (nextLevel) {
          ctx.fillStyle = '#64748b'; ctx.font = '14px serif';
          ctx.fillText(`次まで: あと ${(nextLevel.threshold - strikeCount).toLocaleString()} 回`, 30, 175);
        }
        ctx.textAlign = 'center'; ctx.font = `bold 40px serif`;
        ctx.fillStyle = isHardMode ? '#dc2626' : (isMax ? `hsl(${hue}, 100%, 75%)` : '#fbbf24');
        ctx.fillText(info.message, 400, 530);
        ctx.font = '16px serif'; ctx.fillStyle = '#94a3b8'; ctx.fillText(info.detail, 400, 575);
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [strikeCount, isPaused, isHardMode, lvIdx, info.multiplier, loadedImages, info.message, info.detail]);

  const shareOnX = () => {
    const modeStr = isHardMode ? "ハード" : "ノーマル";
    const scoreStr = strikeCount.toLocaleString();
    const labelStr = info.label;
    
    const text = `除夜の鐘を打ち鳴らした。
モード: ${modeStr}
打ち消した煩悩の数: ${scoreStr}
レベル: ${labelStr}

プレイはこちらから！
playground.neer-engineer.com

#除夜の鐘 #NeerEngineer`;

    const encodedText = encodeURIComponent(text);
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    window.open(shareUrl, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'black', color: 'white', fontFamily: 'serif' }}>
      <div style={{ marginTop: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🔔除夜の鐘🔔</h1>
      </div>
      <div style={{ marginTop: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        {/* サウンドON/OFFボタン */}
        <button
          onClick={toggleSound}
          style={{ 
            padding: '8px 16px', borderRadius: '20px', border: '1px solid #333', 
            background: isSoundEnabled ? '#1e293b' : '#450a0a', 
            color: '#fff', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' 
          }}
        >
          {isSoundEnabled ? '🔊 ON' : '🔇 OFF'}
        </button>
        
        <button onClick={() => { setStrikeCount(0); setIsPaused(false); setShowConfirm(false); setHasReachedMaxLevel(false); setIsHardMode(false); }} style={{ backgroundColor: '#0f172a', color: '#64748b', border: '1px solid #1e293b', padding: '0.5rem 1rem', borderRadius: '999px', fontSize: '0.75rem', cursor: 'pointer' }}>修行をやり直す</button>
        {/* ハードモードボタン */}
        {hasReachedMaxLevel && (
          <button
            onClick={toggleHardMode}
            style={{ backgroundColor: isHardMode ? '#7f1d1d' : '#065f46', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isHardMode ? '通常モードへ戻る' : '修羅の道へ（ハード解禁）'}
          </button>
        )}
      </div>
      
      {/* レベル選択パネル */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ marginBottom: '15px', textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px' }}>
            【到達済みレベル】
          </p>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '800px' }}>
            {levels.map((_lv, idx) => {
              const isLocked = idx > maxReachedLevels[currentModeKey];
              const isSelected = idx === currentLevelIdx;
              return (
                <button
                  key={idx}
                  disabled={isLocked}
                  onClick={() => changeLevel(idx)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    border: '1px solid #333',
                    background: isSelected ? (isHardMode ? '#7f1d1d' : '#1e3a8a') : (isLocked ? '#000' : '#111'),
                    color: isLocked ? '#333' : '#fff',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  {isLocked ? '????' : `Lv.${idx}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} width={800} height={600} onMouseMove={onMouseMove} onClick={playBellSound} style={{ borderRadius: '1.5rem', border: `1px solid ${isHardMode ? '#450a0a' : '#1e293b'}`, cursor: isPaused ? 'default' : 'none' }} />
        {showConfirm && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '1.5rem', zIndex: 10 }}>
            <div style={{ backgroundColor: '#0f172a', border: `1px solid ${isHardMode ? '#ef4444' : '#eab308'}`, padding: '2.5rem', borderRadius: '1rem', textAlign: 'center', maxWidth: '350px' }}>
              <h2 style={{ fontSize: '1.5rem', color: isHardMode ? '#ef4444' : '#eab308', marginBottom: '1rem' }}>108回達成</h2>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '2rem', lineHeight: '1.6' }}>修行を続けますか？</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <button onClick={() => { setIsPaused(false); setShowConfirm(false); }} style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', border: 'none', backgroundColor: isHardMode ? '#b91c1c' : '#ca8a04', color: 'white' }}>Yes</button>
                <button onClick={() => { setStrikeCount(0); setIsPaused(false); setShowConfirm(false); }} style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', border: 'none', backgroundColor: '#1e293b', color: '#94a3b8' }}>No</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        {/* X共有ボタン */}
        <button 
          onClick={shareOnX} 
          style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', background: '#fff', color: '#000', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <span>𝕏</span> 結果を共有
        </button>
      </div>
      <p style={{ marginTop: '1rem', color: '#475569', fontSize: '0.875rem' }}>
        ※ 最初にキャンバスを一度クリックしてください。その後、鐘を突くと音が鳴ります。
      </p>
      <p style={{ marginTop: '1rem', color: '#475569', fontSize: '0.875rem' }}>
        <a href="https://otologic.jp">OtoLogic</a>提供の音声素材を使用しています。
      </p>

      {/* --- 解説セクション --- */}
      <div style={{ marginTop: '4rem', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '5rem' }}>
        <h3 style={{ color: '#fbbf24', marginBottom: '2rem' }}>除夜の鐘の豆知識</h3>

        <AccordionItem title="除夜の鐘とは？">
          <p>「除夜」とは大晦日の夜のことです。「除」には古いものを捨てて新しいものに移るという意味があり、旧年を除く夜、つまり一年の最後の夜を指します。</p>
          <p>この夜にお寺で鳴らされる鐘が「除夜の鐘」であり、日本の冬の風物詩として古くから親しまれています。</p>
        </AccordionItem>

        <AccordionItem title="除夜の鐘の歴史">
          <p>起源は中国の宋時代に遡ると言われています。当初は禅寺で鬼払い（邪気払い）のために毎月の末日に行われていましたが、次第に大晦日だけの行事となりました。</p>
          <p>日本には鎌倉時代に禅宗とともに伝わりました。室町時代から仏教行事として一般に広まり、江戸時代には庶民の間でも大晦日に欠かせない習慣として定着しました。</p>
        </AccordionItem>

        <AccordionItem title="除夜の鐘の由来">
          <p>最も一般的な説は「人間の煩悩の数」に由来するものです。仏教では人間に108つの煩悩（心を惑わす欲望や怒りなど）があると考えられており、鐘を一回突くごとに、その煩悩を一つずつ打ち消していくという意味が込められています。</p>
          <p>多くの場合、古い年のうちに107回を突き、最後の1回を新年（1月1日）になってから突きます。これは「新年に煩悩に惑わされないように」という願いからです。</p>
        </AccordionItem>

        <AccordionItem title="使用する道具の名称">
          <p>鐘のことは正しくは梵鐘（ぼんしょう）、梵鐘を突く木の棒のことを撞木（しゅもく）といいます。</p>
        </AccordionItem>

        <AccordionItem title="ゆく年くる年の放送">
          <p>大晦日の定番番組といえば「ゆく年くる年」ですが、その放送開始はなんと1927年のこと！</p>
          <p>最初の放送ではただスタジオで鐘を鳴らすだけだったらしいです。</p>
          <p>お寺からの中継はその二年後の1929年からで、浅草寺で中継されたそうです。</p>
          <p>現在では全国各地のお寺から中継され、多くの人々が年越しの瞬間を鐘の音とともに迎えています。</p>
        </AccordionItem>
      </div>
    </div>
  );
}