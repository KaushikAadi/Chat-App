import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from './firebase';
import './Chat.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Chat({ currentUser }) {
  const [socket, setSocket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]); 
  
  // NEW STATE FOR CHAT
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null); // Used to auto-scroll to bottom

  useEffect(() => {
    const newSocket = io(API_URL, {
      auth: { uid: currentUser.uid },
    });

    setSocket(newSocket);

    newSocket.on('connect', () => console.log('Connected:', newSocket.id));

    // NEW: Listen for incoming messages from Python backend
    newSocket.on('receive_message', (messageData) => {
      setMessages((prevMessages) => [...prevMessages, messageData]);
    });

    return () => newSocket.disconnect();
  }, [currentUser]);

  // Auto-scroll to the newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSearch = async (e) => {
    e.preventDefault();
    // DUMMY DATA: So you can test the UI without the backend API
    setSearchResults([{ uid: 'dummy_123', displayName: 'TestUser' }]);
  };

  // NEW: Handle sending a message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    const messageData = {
      senderId: currentUser.uid,
      receiverId: selectedUser.uid, // Who it's going to
      text: newMessage,
      timestamp: new Date().toISOString(),
    };

    // 1. Instantly show it on our screen (Optimistic UI)
    setMessages((prev) => [...prev, messageData]);

    // 2. Send it to your teammate's Python backend
    socket.emit('send_message', messageData);
    
    // 3. Clear the input box
    setNewMessage('');
  };

  const handleSignOut = () => auth.signOut();
  
  // ... (Return block is in the next step)
  return (
    <div className="chat-layout">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>{currentUser.displayName || 'My Profile'}</h3>
          <button onClick={handleSignOut} className="logout-btn">Logout</button>
        </div>

        <form onSubmit={handleSearch} className="search-form">
          <input 
            type="text" 
            placeholder="Search usernames..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="search-btn">Find</button>
        </form>

        <div className="user-list">
          {searchResults.map((user) => (
            <div 
              key={user.uid} 
              className={`user-item ${selectedUser?.uid === user.uid ? 'active' : ''}`}
              onClick={() => setSelectedUser(user)}
            >
              {user.displayName}
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="chat-main">
        {!selectedUser ? (
          <div className="blank-state">
            <h2>Welcome to Kamand Prompt Chat</h2>
            <p>Select a user from the sidebar to start messaging.</p>
          </div>
        ) : (
          <div className="chat-window">
            <div className="chat-window-header">
              <h3>Chatting with {selectedUser.displayName}</h3>
            </div>
            
            <div className="messages-container">
              {messages.map((msg, index) => {
                const isMine = msg.senderId === currentUser.uid;
                return (
                  <div key={index} className={`message-wrapper ${isMine ? 'mine' : 'theirs'}`}>
                    <div className={`message-bubble ${isMine ? 'mine' : 'theirs'}`}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="message-input-area">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="message-input"
              />
              <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
                Send
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}