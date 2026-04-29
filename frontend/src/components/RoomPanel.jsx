import { useState } from 'react';

export default function RoomPanel({ room, onCreateRoom, onJoinRoom }) {
  const [joinId, setJoinId] = useState('');

  return (
    <section className="card room-panel">
      <div>
        <h2>Room</h2>
        <p>{room ? `Room ID: ${room.roomId}` : 'Create or join a 1v1 trading room.'}</p>
      </div>

      <div className="inline-controls">
        <button onClick={onCreateRoom}>Create Room</button>
        <input
          value={joinId}
          onChange={event => setJoinId(event.target.value)}
          placeholder="Room ID"
        />
        <button onClick={() => onJoinRoom(joinId)}>Join Room</button>
      </div>
    </section>
  );
}
