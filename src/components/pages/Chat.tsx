import { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

import { randomName } from '@/utils/string';

const ChatApp = () => {
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState(''); // 自分の表示名
  const [tempName, setTempName] = useState(''); // 入力中の名前
  const [isNameSet, setIsNameSet] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [peers, setPeers] = useState({}); // { peerId: { conn: DataConnection, name: string } }
  const [copyStatus, setCopyStatus] = useState('URLをコピー');
  
  const peerRef = useRef(null);
  const peersRef = useRef({}); // 状態管理用
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!isNameSet) return;

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setMyId(id);
      const targetId = window.location.hash.substring(1);
      if (targetId && targetId !== id) {
        connectToPeer(targetId);
      }
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    const handleBeforeUnload = () => {
      Object.values(peersRef.current).forEach(({ conn }) => {
        conn.send({ type: 'leave', senderName: myName });
        conn.close();
      });
      peerRef.current?.destroy();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      peerRef.current?.destroy();
    };
  }, [isNameSet]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const setupConnection = (conn) => {
    if (peersRef.current[conn.peer]) return;

    conn.on('open', () => {
      // 1. 接続直後に自分の名前を相手に送る
      conn.send({ type: 'introduce', name: myName });
    });

    conn.on('data', (data) => {
      if (data.type === 'introduce') {
        // 名前を受け取って登録
        peersRef.current[conn.peer] = { conn, name: data.name };
        setPeers({ ...peersRef.current });
        setMessages(prev => [...prev, { system: true, text: `${data.name}が入室しました` }]);

        // 自分がリーダーなら、他の全メンバーのIDリストを共有
        const otherIds = Object.keys(peersRef.current).filter(id => id !== conn.peer);
        if (otherIds.length > 0) {
          conn.send({ type: 'member-list', ids: otherIds });
        }
      } 
      else if (data.type === 'chat') {
        setMessages(prev => [...prev, { sender: data.senderName, text: data.text }]);
      } 
      else if (data.type === 'member-list') {
        data.ids.forEach(id => connectToPeer(id));
      }
      else if (data.type === 'leave') {
        cleanup(conn.peer, data.senderName);
      }
    });

    const cleanup = (id: string) => {
      if (peersRef.current[id]) {
        const displayName = peersRef.current[id].name || "不明なユーザー";
        delete peersRef.current[id];
        setPeers({ ...peersRef.current });
        setMessages(prev => [...prev, { system: true, text: `${displayName}が退室しました` }]);
      }
    };

    conn.on('close', () => cleanup(conn.peer));
    conn.on('error', () => cleanup(conn.peer));
  };

  const connectToPeer = (id) => {
    if (!id || id === myId || peersRef.current[id]) return;
    const conn = peerRef.current.connect(id);
    setupConnection(conn);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageInput) return;

    const payload = { type: 'chat', senderName: myName, text: messageInput };
    Object.values(peersRef.current).forEach(({ conn }) => {
      if (conn.open) conn.send(payload);
    });

    setMessages(prev => [...prev, { sender: '自分', text: messageInput }]);
    setMessageInput('');
  };

  // 招待用URLをコピーする関数
  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}#${myId}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopyStatus('コピー完了！');
      setTimeout(() => setCopyStatus('URLをコピー'), 2000);
    });
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (tempName.trim()) {
      setMyName(tempName);
      setIsNameSet(true);
    }
  };

  // 名前入力画面
  if (!isNameSet) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <form onSubmit={handleNameSubmit} className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-80 text-center">
          <h2 className="text-indigo-400 font-bold mb-4 text-xl">名前を設定してください</h2>
          <input 
            className="w-full bg-slate-700 border-none rounded-lg px-4 py-2 text-white mb-4 outline-none focus:ring-2 focus:ring-indigo-500"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder="ユーザー名"
            autoFocus
          />
          <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition-all">
            チャットを開始
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 text-slate-100 font-sans">
      <div className="max-w-2xl mx-auto w-full flex flex-col h-full bg-slate-800 rounded-xl shadow-2xl overflow-hidden border border-slate-700">
        
        {/* ヘッダーセクション */}
        <div className="bg-slate-800 p-5 text-white">
          <h1 className="text-xl font-bold mb-2 text-center text-indigo-400">P2P Chat</h1>
          <h2>名前: {myName}</h2>
          <p className="text-[10px] text-slate-400">参加人数: {Object.keys(peers).length + 1}名</p>
          <div className="bg-slate-700 rounded-lg p-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Your ID</div>
            <div className="text-sm font-mono break-all text-indigo-200">{myId || '発行中...'}</div>
            
            {myId && (
              <button 
                onClick={copyInviteLink}
                className="mt-1 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded transition-colors font-bold"
              >
                {copyStatus}
              </button>
            )}
          </div>
        </div>

        {/* チャットログ */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/30">
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.sender === '自分' ? 'items-end' : 'items-start'}`}>
              {msg.system ? (
                <span className="text-[10px] text-slate-500 mx-auto my-1 uppercase">{msg.text}</span>
              ) : (
                <div className={`max-w-[85%] flex flex-col ${msg.sender === '自分' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-slate-400 px-1 mb-1">{msg.sender}</span>
                  <div className={`px-4 py-2 rounded-2xl text-sm ${
                    msg.sender === '自分' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-100 rounded-tl-none border border-slate-600'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 送信フォーム */}
        <div className="p-4 bg-slate-800 border-t border-slate-700">
          <form onSubmit={sendMessage} className="flex gap-2">
            <input 
              type="text" 
              className="flex-1 bg-slate-900 border border-slate-600 rounded-full px-5 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="メッセージ..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button type="submit" className="bg-indigo-600 text-white px-5 py-2 rounded-full text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50">
              送信
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatApp;