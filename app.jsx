import { useState } from 'react';

function App() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!message.trim() || loading) return;

    setLoading(true);
    setReply('');

    try {
      const response = await fetch(
        'http://localhost:5000/api/chat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setReply(data.reply);
      setMessage('');

    } catch (error) {
      setReply('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '650px',
      margin: '50px auto',
      padding: '20px',
      fontFamily: 'Arial'
    }}>

      <h1>🌾 KisanMitra AI</h1>

      <p>Your Smart Agriculture Assistant</p>

      <textarea
        rows="5"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask anything about farming..."
        style={{
          width: '100%',
          padding: '12px',
          boxSizing: 'border-box'
        }}
      />

      <button
        onClick={sendMessage}
        disabled={loading}
        style={{
          marginTop: '10px',
          padding: '12px 25px',
          background: 'green',
          color: 'white',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Thinking...' : 'Ask KisanMitra'}
      </button>

      {reply && (
        <div style={{
          marginTop: '25px',
          padding: '15px',
          background: '#f0f8f0',
          borderRadius: '8px',
          whiteSpace: 'pre-wrap'
        }}>
          <h3>AI Response:</h3>
          {reply}
        </div>
      )}

    </div>
  );
}

export default App;
