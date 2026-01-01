// const ROLES = {
//   MASTER: { id: 'master', label: 'マスター', canSeeTheme: true },
//   INSIDER: { id: 'insider', label: 'インサイダー', canSeeTheme: true },
//   COMMONER: { id: 'commoner', label: '市民', canSeeTheme: false },
//   // 拡張: SPY: { id: 'spy', label: 'スパイ', canSeeTheme: false }
// };

// 送信するデータのイメージ
// {
//   type: "ASSIGN_ROLES", 
//   payload: { "peerId1": "master", "peerId2": "insider", ... }
// }

import React, { useState, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import { Users, Send, Link, Play, Timer, CheckCircle, Crown, Search } from 'lucide-react';

// --- 型定義 ---
type Role = 'master' | 'insider' | 'commoner';
type GameStatus = 'lobby' | 'theme_setup' | 'discussion' | 'voting' | 'result';

interface Player {
  id: string;
  name: string;
  role?: Role;
  isHost: boolean;
  votedTo?: string;
}

interface GamePayload {
  type: 'SYNC_PEERS' | 'START_GAME' | 'SET_THEME' | 'START_VOTING' | 'VOTE' | 'CHAT';
  peerIds?: string[];
  players?: Player[];
  theme?: string;
  timerDuration?: number;
  fromId?: string;
  fromName?: string;
  text?: string;
  targetId?: string;
}

const InsiderGame = () => {
  // --- States ---
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState(`プレイヤー${Math.floor(Math.random() * 100)}`);
  const [status, setStatus] = useState<GameStatus>('lobby');
  const [players, setPlayers] = useState<Player[]>([]);
  const [theme, setTheme] = useState('');
  const [timer, setTimer] = useState(0);
  const [messages, setMessages] = useState<{ name: string; text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [configTimer, setConfigTimer] = useState(5); // 分

  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<{ [key: string]: any }>({});

  const isHost = players.find(p => p.id === myId)?.isHost ?? false;
  const myRole = players.find(p => p.id === myId)?.role;

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setMyId(id);
      setPlayers([{ id, name: myName, isHost: true }]);
      
      const hashId = window.location.hash.replace('#', '');
      if (hashId) connectToPeer(hashId);
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => setupConnection(conn));
    });

    return () => peer.destroy();
  }, []);

  // 名前が変更されたら全接続先に通知（今回は簡略化のため初期値固定推奨）
  
  const setupConnection = (conn: any) => {
    connectionsRef.current[conn.peer] = conn;
    
    // 新規参加者が来たら現在のプレイヤーリストを更新
    if (isHost) {
      const newPlayers = [...players, { id: conn.peer, name: "Guest", isHost: false }];
      updateAndBroadcastPlayers(newPlayers);
    }

    conn.on('data', (data: GamePayload) => {
      switch (data.type) {
        case 'START_GAME':
          setPlayers(data.players || []);
          setStatus('theme_setup');
          break;
        case 'SET_THEME':
          setTheme(data.theme || '');
          setStatus('discussion');
          setTimer((data.timerDuration || 5) * 60);
          break;
        case 'START_VOTING':
          setStatus('voting');
          break;
        case 'VOTE':
          handleReceiveVote(data.fromId!, data.targetId!);
          break;
        case 'CHAT':
          setMessages(prev => [...prev, { name: data.fromName || '', text: data.text || '' }]);
          break;
      }
    });
  };

  const connectToPeer = (id: string) => {
    if (!id || id === myId) return;
    const conn = peerRef.current.connect(id);
    setupConnection(conn);
  };

  const broadcast = (payload: GamePayload) => {
    Object.values(connectionsRef.current).forEach((conn: any) => conn.send(payload));
  };

  const updateAndBroadcastPlayers = (newPlayers: Player[]) => {
    setPlayers(newPlayers);
    broadcast({ type: 'START_GAME', players: newPlayers }); // 実際は状態更新用
  };

  // --- ゲームロジック ---

  const startGame = () => {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const updatedPlayers = shuffled.map((p, i) => ({
      ...p,
      role: (i === 0 ? 'master' : i === 1 ? 'insider' : 'commoner') as Role
    }));
    setPlayers(updatedPlayers);
    broadcast({ type: 'START_GAME', players: updatedPlayers });
    setStatus('theme_setup');
  };

  const submitTheme = (val: string) => {
    setTheme(val);
    setStatus('discussion');
    setTimer(configTimer * 60);
    broadcast({ type: 'SET_THEME', theme: val, timerDuration: configTimer });
  };

  const startVoting = () => {
    setStatus('voting');
    broadcast({ type: 'START_VOTING' });
  };

  const castVote = (targetId: string) => {
    broadcast({ type: 'VOTE', fromId: myId, targetId });
    handleReceiveVote(myId, targetId);
  };

  const handleReceiveVote = (fromId: string, targetId: string) => {
    setPlayers(prev => {
      const next = prev.map(p => p.id === fromId ? { ...p, votedTo: targetId } : p);
      if (next.every(p => p.role === 'master' || p.votedTo)) {
        setStatus('result');
      }
      return next;
    });
  };

  // --- タイマー処理 ---
  useEffect(() => {
    if (status === 'discussion' && timer > 0) {
      const id = setInterval(() => setTimer(t => t - 1), 1000);
      return () => clearInterval(id);
    }
  }, [status, timer]);

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-4 font-sans">
      <div className="max-w-md mx-auto space-y-4">
        
        {/* Header */}
        <div className="bg-zinc-800 p-4 rounded-xl border border-zinc-700 shadow-xl">
          <h1 className="text-xl font-black text-red-500 italic flex items-center gap-2">
             INSIDER GAME
          </h1>
          <p className="text-xs text-zinc-500">Status: {status.toUpperCase()}</p>
        </div>

        {/* Lobby Status */}
        {status === 'lobby' && (
          <div className="bg-zinc-800 p-6 rounded-xl space-y-4 border border-zinc-700">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500">SET NAME</label>
              <input 
                className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg outline-none focus:border-red-500"
                value={myName} onChange={e => setMyName(e.target.value)}
              />
            </div>
            <button 
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}#${myId}`;
                navigator.clipboard.writeText(url);
                alert("URLをコピーしました");
              }}
              className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm flex items-center justify-center gap-2 transition"
            >
              <Link size={16}/> 招待URLをコピー
            </button>
            <div className="pt-4">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2 text-zinc-400">
                <Users size={16}/> 参加メンバー ({players.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {players.map(p => (
                  <div key={p.id} className="bg-zinc-900 p-2 rounded text-xs border border-zinc-700 truncate">
                    {p.name} {p.id === myId && "(自分)"}
                  </div>
                ))}
              </div>
            </div>
            {isHost && players.length >= 3 && (
              <div className="space-y-3 pt-4 border-t border-zinc-700">
                <div className="flex justify-between items-center text-sm">
                  <span>質問タイム設定</span>
                  <input type="number" className="w-16 bg-zinc-900 border border-zinc-700 p-1 rounded" value={configTimer} onChange={e => setConfigTimer(Number(e.target.value))} />
                  <span>分</span>
                </div>
                <button onClick={startGame} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg transition transform active:scale-95">
                  ゲーム開始
                </button>
              </div>
            )}
          </div>
        )}

        {/* Theme Setup Phase */}
        {status === 'theme_setup' && (
          <div className="bg-zinc-800 p-8 rounded-xl border border-red-900 text-center space-y-4">
            <Crown className="mx-auto text-yellow-500" size={48} />
            <h2 className="text-xl font-bold">役職: {myRole === 'master' ? 'マスター' : myRole === 'insider' ? 'インサイダー' : '市民'}</h2>
            {myRole === 'master' ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">お題を入力してゲームを開始してください</p>
                <input 
                  className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg text-center"
                  placeholder="例: リンゴ"
                  onKeyPress={e => e.key === 'Enter' && submitTheme(e.currentTarget.value)}
                />
              </div>
            ) : (
              <p className="animate-pulse text-zinc-500 text-sm">マスターがお題を設定中です...</p>
            )}
          </div>
        )}

        {/* Discussion Phase */}
        {status === 'discussion' && (
          <div className="bg-zinc-800 p-6 rounded-xl border-t-4 border-red-600 space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-red-500 font-bold">
                <Timer /> {Math.floor(timer/60)}:{(timer%60).toString().padStart(2, '0')}
              </div>
              <div className="text-xs bg-zinc-700 px-2 py-1 rounded">Role: {myRole}</div>
            </div>
            
            {(myRole === 'master' || myRole === 'insider') && (
              <div className="bg-zinc-900 p-4 rounded-lg border border-red-500/30 text-center">
                <p className="text-xs text-zinc-500 uppercase mb-1">正解のお題</p>
                <p className="text-2xl font-black tracking-widest">{theme}</p>
              </div>
            )}

            {isHost && (
              <button onClick={startVoting} className="w-full py-3 bg-zinc-100 text-zinc-900 font-bold rounded-lg hover:bg-white transition">
                投票タイムを開始する
              </button>
            )}
          </div>
        )}

        {/* Voting Phase */}
        {status === 'voting' && (
          <div className="bg-zinc-800 p-6 rounded-xl space-y-4">
            <h2 className="text-center font-bold flex items-center justify-center gap-2">
              <Search className="text-red-500" /> インサイダーは誰だ？
            </h2>
            <div className="grid gap-2">
              {players.filter(p => p.role !== 'master').map(p => (
                <button 
                  key={p.id}
                  disabled={!!players.find(me => me.id === myId)?.votedTo}
                  onClick={() => castVote(p.id)}
                  className={`p-4 rounded-lg border transition flex justify-between items-center ${
                    players.find(me => me.id === myId)?.votedTo === p.id 
                    ? 'border-red-500 bg-red-500/10' 
                    : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900'
                  }`}
                >
                  <span>{p.name} {p.id === myId && "(自分)"}</span>
                  {players.find(me => me.id === myId)?.votedTo === p.id && <CheckCircle size={18} />}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-zinc-500 italic">全員の投票を待っています...</p>
          </div>
        )}

        {/* Result Phase */}
        {status === 'result' && (
          <div className="bg-zinc-800 p-6 rounded-xl border-t-4 border-yellow-500 space-y-6">
            <h2 className="text-2xl font-black text-center">RESULT</h2>
            <div className="bg-zinc-900 p-4 rounded-lg space-y-2">
              <p className="text-sm text-zinc-500 border-b border-zinc-700 pb-2 mb-2">正解: {theme}</p>
              {players.map(p => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className={`font-bold ${p.role === 'insider' ? 'text-red-500' : p.role === 'master' ? 'text-yellow-500' : 'text-zinc-400'}`}>
                    {p.role?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.reload()} className="w-full py-3 bg-zinc-700 rounded-lg text-sm">
              トップに戻る
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default InsiderGame;