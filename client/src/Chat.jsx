import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from './firebase';
import './Chat.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Helper to format timestamps into readable times (e.g., "10:30 AM")
const formatTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function Chat({ currentUser }) {
  const [socket, setSocket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const messagesEndRef = useRef(null);

  // 1. Initialize Socket Connection
  useEffect(() => {
    const newSocket = io(API_URL, {
      auth: { uid: currentUser.uid },
    });

    setSocket(newSocket);

    newSocket.on('connect', () => console.log('Socket Connected:', newSocket.id));

    // Listen for LIVE incoming messages
    newSocket.on('receive_message', (messageData) => {
      setMessages((prev) => {
        // Only add the message to the screen if we are currently chatting with the sender
        // (Otherwise, it might just trigger a notification in the future)
        if (selectedUser && messageData.senderId === selectedUser.uid) {
          return [...prev, messageData];
        }
        return prev;
      });
    });

    return () => newSocket.disconnect();
  }, [currentUser, selectedUser]); // Re-bind if selected user changes so the closure has the right state

  // 2. Fetch Chat History when a user is selected
  useEffect(() => {
    if (!selectedUser) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`${API_URL}/chat-history?user1=${currentUser.uid}&user2=${selectedUser.uid}`);
        if (res.ok) {
          const history = await res.json();
          setMessages(history);
        } else {
          setMessages([]); // Fallback to empty if no history
        }
      } catch (err) {
        console.error("Failed to fetch history", err);
        setMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [selectedUser, currentUser.uid]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Search Users via Backend
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    try {
      const res = await fetch(`${API_URL}/search-users?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out ourselves from the search results
        setSearchResults(data.filter(u => u.uid !== currentUser.uid));
      }
    } catch (err) {
      console.error("Search failed", err);
    }
  };

  // 4. Send a new message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    const messageData = {
      senderId: currentUser.uid,
      receiverId: selectedUser.uid,
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    // Optimistic UI update (show it immediately for the sender)
    setMessages((prev) => [...prev, messageData]);

    // Send to backend via Socket
    socket.emit('send_message', messageData);
    
    setNewMessage('');
  };

  const handleSignOut = () => auth.signOut();

  return (
    <div className="chat-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="my-profile">
            <div className="avatar">{currentUser.displayName?.charAt(0).toUpperCase()}</div>
            <h3>{currentUser.displayName || 'Me'}</h3>
          </div>
          <button onClick={handleSignOut} className="logout-btn" title="Sign Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </button>
        </div>

        <form onSubmit={handleSearch} className="search-form">
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="search-btn">🔍</button>
        </form>

        <div className="user-list">
          {searchResults.length === 0 ? (
             <p className="no-results">Search for a username to start chatting.</p>
          ) : (
            searchResults.map((user) => (
              <div 
                key={user.uid} 
                className={`user-item ${selectedUser?.uid === user.uid ? 'active' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="avatar small">{user.username?.charAt(0).toUpperCase() || '?'}</div>
                <div className="user-info">
                  <span className="user-name">{user.username}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* MAIN CHAT */}
      <main className="chat-main">
        {!selectedUser ? (
          <div className="blank-state">
            <div className="logo-placeholder">KP</div>
            <h2>Kamand Prompt Chat</h2>
            <p>Select a conversation or search for a new user.</p>
          </div>
        ) : (
          <div className="chat-window">
            {/* Chat Header */}
            <div className="chat-window-header">
               <div className="avatar">{selectedUser.username?.charAt(0).toUpperCase()}</div>
               <h3>{selectedUser.username}</h3>
            </div>
            
            {/* Messages Area */}
            <div className="messages-container">
              {isLoadingHistory ? (
                <div className="loading-spinner">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="empty-chat">Say hi to {selectedUser.username}! 👋</div>
              ) : (
                messages.map((msg, index) => {
                  const isMine = msg.senderId === currentUser.uid;
                  return (
                    <div key={index} className={`message-wrapper ${isMine ? 'mine' : 'theirs'}`}>
                      <div className={`message-bubble ${isMine ? 'mine' : 'theirs'}`}>
                        <div className="msg-text">{msg.text}</div>
                        <div className="msg-time">{formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  );
                })
              )}
              {/* Dummy div to scroll to */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="message-input-area">
              <input
                type="text"
                placeholder={`Message ${selectedUser.username}...`}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="message-input"
                autoComplete="off"
              />
              <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}