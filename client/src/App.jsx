// src/App.jsx
import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Login from './login';
import Chat from './Chat';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This instantly triggers when a user logs in or logs out
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>;

  // If no user, show login. If user exists, show the chat app.
  return user ? <Chat currentUser={user} /> : <Login />;
}

export default App;