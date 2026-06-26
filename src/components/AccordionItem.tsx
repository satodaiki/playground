import React, { useState } from 'react';

// --- アコーディオン用コンポーネント ---
export default (
  { title, children }: {
    title: string, 
    children: React.ReactElement | React.ReactElement[]
  }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #1e293b', width: '100%', maxWidth: '800px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '1.2rem',
          background: 'none',
          border: 'none',
          color: '#f8fafc',
          textAlign: 'left',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span>{title}</span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '0.3s' }}>▼</span>
      </button>
      <div style={{
        maxHeight: isOpen ? '500px' : '0',
        overflow: 'hidden',
        transition: '0.3s ease-in-out',
        background: '#0f172a'
      }}>
        <div style={{ padding: '1.5rem', color: '#94a3b8', lineHeight: '1.8', fontSize: '0.95rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
};