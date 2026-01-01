import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';

const ChatApp = () => {
  const [myId, setMyId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [copyStatus, setCopyStatus] = useState('URLをコピー');

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const scrollRef = useRef(null);

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

    peer.on('connection', (connection) => {
      connRef.current = connection;
      setupConnection();
    });

    return () => peer.destroy();
  }, []);

  // 常に最新メッセージまでスクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const setupConnection = () => {
    const conn = connRef.current;
    conn.on('open', () => {
      setIsConnected(true);
      setMessages(prev => [...prev, { system: true, text: '接続されました' }]);
    });
    conn.on('data', (data) => {
      setMessages(prev => [...prev, { sender: '相手', text: data }]);
    });
    conn.on('close', () => {
      setIsConnected(false);
      setMessages(prev => [...prev, { system: true, text: '切断されました' }]);
    });
  };

  const connectToPeer = (id) => {
    if (!id) return;
    connRef.current = peerRef.current.connect(id);
    setupConnection();
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (messageInput && connRef.current?.open) {
      connRef.current.send(messageInput);
      setMessages(prev => [...prev, { sender: '自分', text: messageInput }]);
      setMessageInput('');
    }
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
    <div className="flex flex-col h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto w-full bg-white shadow-2xl rounded-2xl flex flex-col h-full overflow-hidden">
        
        {/* ヘッダーセクション */}
        <div className="bg-slate-800 p-5 text-white">
          <h1 className="text-xl font-bold mb-2 text-center text-indigo-400">P2P Chat</h1>
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.length === 0 && (
            <p className="text-center text-slate-400 text-sm mt-10">
              招待URLを相手に送って接続してください
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.sender === '自分' ? 'items-end' : 'items-start'}`}>
              {msg.system ? (
                <div className="w-full text-center py-2 text-[10px] text-slate-400 uppercase tracking-widest">{msg.text}</div>
              ) : (
                <div className={`group flex flex-col ${msg.sender === '自分' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-slate-500 mb-1 px-1">{msg.sender}</span>
                  <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm max-w-[90%] break-all ${
                    msg.sender === '自分' 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* メッセージ送信エリア */}
        <div className="p-4 bg-white border-t border-slate-100">
          <form onSubmit={sendMessage} className="flex gap-2 items-center">
            <input 
              type="text" 
              placeholder={isConnected ? "メッセージを入力..." : "接続を待っています..."}
              className="flex-1 text-black bg-slate-100 border-none rounded-full px-5 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              disabled={!isConnected}
            />
            <button 
              type="submit"
              disabled={!isConnected || !messageInput}
              className="bg-indigo-600 text-white w-12 h-12 flex items-center justify-center rounded-full hover:bg-indigo-500 transition-all disabled:bg-slate-300 shadow-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatApp;