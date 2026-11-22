import { useEffect, useState } from 'react';

// This code runs in the visitor's BROWSER. Every fetch('/api/...') below is an
// API call that goes: browser -> load balancer -> Nginx (frontend pod) -> backend Service.
export default function App() {
  const [notes, setNotes] = useState([]);
  const [source, setSource] = useState('');
  const [info, setInfo] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function loadNotes() {
    try {
      const res = await fetch('/api/notes');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNotes(data.notes);
      setSource(data.source); // "cache" (Redis) or "database" (Postgres)
      setError('');
    } catch (err) {
      setError(`Could not reach the backend: ${err.message}`);
    }
  }

  async function loadInfo() {
    try {
      const res = await fetch('/api/info');
      setInfo(await res.json());
    } catch {
      setInfo(null);
    }
  }

  async function addNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      setText('');
      loadNotes();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || `HTTP ${res.status}`);
    }
  }

  useEffect(() => {
    loadNotes();
    loadInfo();
  }, []);

  return (
    <main className="container">
      <h1>📝 Notes on EKS</h1>
      <p className="subtitle">
        React (frontend) → Express (backend) → Redis (cache) + Postgres (database)
      </p>

      <section className="panel stats">
        <div>
          <span className="label">Frontend version</span>
          <strong>{import.meta.env.VITE_APP_VERSION || 'dev'}</strong>
        </div>
        <div>
          <span className="label">Backend version</span>
          <strong>{info ? info.version : '…'}</strong>
        </div>
        <div>
          <span className="label">Answered by backend pod</span>
          <strong>{info ? info.pod : '…'}</strong>
        </div>
        <div>
          <span className="label">Notes came from</span>
          <strong className={`badge ${source}`}>{source || '…'}</strong>
        </div>
      </section>

      <form className="panel" onSubmit={addNote}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a note…"
          maxLength={200}
        />
        <button type="submit">Add</button>
        <button type="button" className="secondary" onClick={() => { loadNotes(); loadInfo(); }}>
          Refresh
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="notes">
        {notes.map((n) => (
          <li key={n.id} className="panel">
            <span>{n.text}</span>
            <time>{new Date(n.created_at).toLocaleString()}</time>
          </li>
        ))}
        {notes.length === 0 && !error && <li className="empty">No notes yet. Add one!</li>}
      </ul>
    </main>
  );
}
