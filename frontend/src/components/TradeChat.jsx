import { useEffect, useRef, useState } from 'react';

export default function TradeChat({ disabled, messages, currentUser, onSend }) {
  const [message, setMessage] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function submit(event) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    onSend(clean);
    setMessage('');
  }

  return (
    <section className="card chat-panel">
      <div className="panel-title-row">
        <h2>Trade Chat</h2>
        <span className="status-pill">Realtime</span>
      </div>

      <div className="chat-log">
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
        {messages.map(item => (
          <div
            className={item.userId === currentUser.id ? 'chat-message mine' : 'chat-message'}
            key={item.id}
          >
            <strong>{item.username}</strong>
            <p>{item.message}</p>
            <small>{new Date(item.createdAt).toLocaleTimeString()}</small>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={message}
          onChange={event => setMessage(event.target.value)}
          disabled={disabled}
          maxLength={500}
          placeholder={disabled ? 'Join a 1v1 room to chat' : 'Send a trade message...'}
        />
        <button disabled={disabled}>Send</button>
      </form>
    </section>
  );
}
