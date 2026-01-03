import { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

const ChatApp = () => {
  const [myId, setMyId] = useState('');
  const [messages, setMessages] = useState<{ sender?: string; text: string; system?: boolean }[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [conns, setConns] = useState<{ [key: string]: DataConnection }>({}); // 接続中の全Peerを管理 {peerId: connection}
  const [copyStatus, setCopyStatus] = useState('URLをコピー');

  const peerRef = useRef<Peer>(null);
  const connsRef = useRef<{ [key: string]: DataConnection }>({}); // レンダリングを跨いで最新の接続状態を保持
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setMyId(id);
      
      // URLのハッシュ（#）からIDを取得
      const targetId = window.location.hash.substring(1); // #を除いた文字列を取得
      if (targetId) {
        connectToPeer(targetId);
      }
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    return () => peer.destroy();
  }, []);

  // --- タブを閉じる時に明示的に切断するハンドラ ---
  useEffect(() => {
    const handleBeforeUnload = () => {
      Object.values(connsRef.current).forEach(conn => {
        conn.send({ type: 'leave', peerId: myId }); // 退出を通知
        conn.close();
      });
      peerRef.current?.destroy();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      peerRef.current?.destroy();
    };
  }, []);

  // 常に最新メッセージまでスクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const setupConnection = (conn: DataConnection) => {
    // 定期的な接続チェック
    const checkInterval = setInterval(() => {
      if (!conn.open) {
        cleanup();
      }
    }, 5000);

    const cleanup = () => {
      clearInterval(checkInterval);
      if (connsRef.current[conn.peer]) {
        delete connsRef.current[conn.peer];
        setConns({ ...connsRef.current });
        setMessages(prev => [...prev, { system: true, text: "誰かが退室しました" }]);
      }
    };

    conn.on('open', () => {
      // 接続リストに追加
      addConnection(conn);
      setMessages(prev => [...prev, { system: true, text: `${conn.peer.substring(0,5)}... が入室しました` }]);

      // 【リーダーの役割】新しい人が来たら、現在接続中の他の全員のIDを教える
      const otherPeerIds = Object.keys(connsRef.current).filter(id => id !== conn.peer);
      if (otherPeerIds.length > 0) {
        conn.send({ type: 'member-list', ids: otherPeerIds });
      }
    });
    conn.on('data', (data: { type: string; sender?: string; text?: string, ids?: string[] }) => {
      if (data.type === 'chat') {
        // メッセージの受信
        setMessages(prev => [...prev, { sender: data.sender!, text: data.text! }]);
      } else if (data.type === 'member-list') {
        // 【新人の役割】リーダーから貰った名簿をもとに、全員に自分から接続する
        data.ids!.forEach(id => {
          if (!connsRef.current[id]) {
            connectToPeer(id);
          }
        });
      } else if (data.type === 'leave') {
        // 明示的な退出通知を受け取った場合
        cleanup();
        conn.close();
      }
    });
    conn.on('close', cleanup);
    conn.on('error', cleanup);
  };

  const addConnection = (conn: DataConnection) => {
    connsRef.current[conn.peer] = conn;
    setConns({ ...connsRef.current });
  };

  const connectToPeer = (id: string) => {
    if (id === myId || connsRef.current[id] || !peerRef.current) return;
    const conn = peerRef.current.connect(id);
    setupConnection(conn);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageInput) return;

    const payload = {
      type: 'chat',
      sender: myId.substring(0, 5),
      text: messageInput
    };
  
    // 接続している全員に送信（ブロードキャスト）
    Object.values(conns).forEach(conn => {
      if (conn.open) {
        conn.send(payload);
      }
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

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 text-slate-100">
      <div className="max-w-2xl mx-auto w-full flex flex-col h-full bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        
        {/* ヘッダーセクション */}
        <div className="bg-slate-800 p-5 text-white">
          <h1 className="text-xl font-bold mb-2 text-center text-indigo-400">P2P Chat</h1>
          <p className="text-[10px] text-slate-400">参加人数: {Object.keys(conns).length + 1}名</p>
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50">
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.sender === '自分' ? 'items-end' : 'items-start'}`}>
              {msg.system ? (
                <span className="text-[10px] text-slate-500 italic mx-auto my-2 uppercase tracking-widest">{msg.text}</span>
              ) : (
                <>
                  <span className="text-[10px] text-slate-400 mb-1 ml-1">{msg.sender}</span>
                  <div className={`px-4 py-2 rounded-2xl text-sm max-w-[80%] break-all ${
                    msg.sender === '自分' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-100 rounded-tl-none border border-slate-600'
                  }`}>
                    {msg.text}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 入力エリア */}
        <form onSubmit={sendMessage} className="p-4 bg-slate-800 border-t border-slate-700 flex gap-2">
          <input 
            type="text" 
            className="flex-1 bg-slate-700 border-none rounded-lg px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="全員にメッセージを送信..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
          />
          <button type="submit" className="bg-indigo-600 p-3 rounded-lg hover:bg-indigo-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatApp;