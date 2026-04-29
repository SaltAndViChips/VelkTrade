import { useState } from 'react';
import { api, setToken } from '../api';

export default function AuthForm({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const data = await api(`/api/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      setToken(data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Login' : 'Register'}</h1>

        {error && <p className="error">{error}</p>}

        <input
          value={username}
          onChange={event => setUsername(event.target.value)}
          placeholder="Username"
        />

        <input
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="Password"
          type="password"
        />

        <button type="submit">
          {mode === 'login' ? 'Login' : 'Register'}
        </button>

        <button
          type="button"
          className="ghost"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
        </button>
      </form>
    </main>
  );
}
