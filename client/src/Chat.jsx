// src/Chat.jsx
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from './firebase';
import './Chat.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const formatTime = (timeData) => {
  if (!timeData) return '';
  const date = new Date(timeData);
  if (isNaN(date)) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const generateChatId = (uid1, uid2) => {
  const uids = [uid1, uid2].sort();
  return `${uids[0]}_${uids[1]}`;
};

export default function Chat({ currentUser }) {
  const [socket, setSocket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [inboxChats, setInboxChats] = useState([]); 
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isOnline, setIsOnline] = useState(false); 
  
  // NEW: Typing state and ref for the timer
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  
  const messagesEndRef = useRef(null);

  // 1. Initialize Socket Connection
  useEffect(() => {
    const newSocket = io(API_URL, {
      auth: { uid: currentUser.uid },
    });

    setSocket(newSocket);

    newSocket.on('receive_chat', (messageData) => {
      setMessages((prev) => {
        if (selectedUser && messageData.sender_uid === selectedUser.uid) {
          return [...prev, messageData];
        }
        return prev;
      });
      fetchInbox();
    });

    // NEW: Listen for typing indicators
    newSocket.on('user_typing', (data) => {
      if (selectedUser && data.sender_uid === selectedUser.uid) {
        setIsTyping(data.is_typing);
      }
    });

    return () => newSocket.disconnect();
  }, [currentUser, selectedUser]); 

  // Reset typing state if we switch to a different user
  useEffect(() => {
    setIsTyping(false);
  }, [selectedUser]);

  // 2. Fetch Inbox
  const fetchInbox = async () => {
    try {
      const res = await fetch(`${API_URL}/inbox/${currentUser.uid}`);
      if (res.ok) setInboxChats(await res.json());
    } catch (err) {
      console.error("Failed to fetch inbox", err);
    }
  };

  useEffect(() => { fetchInbox(); }, [currentUser.uid]);

  // 3. Fetch Chat History
  useEffect(() => {
    if (!selectedUser) return;
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const chatId = generateChatId(currentUser.uid, selectedUser.uid);
        const res = await fetch(`${API_URL}/chat-history/${chatId}`);
        if (res.ok) setMessages(await res.json());
        else setMessages([]);
      } catch (err) {
        console.error("Failed to fetch history", err);
        setMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [selectedUser, currentUser.uid]);

  // 4. Check Online Status (Poll every 10s)
  useEffect(() => {
    if (!selectedUser) return;
    const checkOnlineStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/is-online/${selectedUser.uid}`);
        if (res.ok) {
          const data = await res.json();
          setIsOnline(data.online);
        }
      } catch (err) {
        console.error("Failed to check online status", err);
      }
    };
    checkOnlineStatus(); 
    const intervalId = setInterval(checkOnlineStatus, 10000); 
    return () => clearInterval(intervalId); 
  }, [selectedUser]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]); // Added isTyping so it scrolls down when the bubble appears

  // 5. Search Users via Backend
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/search-users?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.filter(u => u.uid !== currentUser.uid));
      }
    } catch (err) {
      console.error("Search failed", err);
    }
  };

  // NEW: Handle Typing Logic
  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    
    if (!socket || !selectedUser) return;

    // Tell the backend we are typing
    socket.emit('typing', {
      sender_uid: currentUser.uid,
      receiver_uid: selectedUser.uid,
      is_typing: true
    });

    // Clear the previous timer
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a new timer to automatically stop typing after 2 seconds of no keystrokes
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', {
        sender_uid: currentUser.uid,
        receiver_uid: selectedUser.uid,
        is_typing: false
      });
    }, 2000);
  };

  // 6. Send a new message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    // Immediately cancel the typing indicator when a message is sent
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing', {
      sender_uid: currentUser.uid,
      receiver_uid: selectedUser.uid,
      is_typing: false
    });

    const messageData = {
      sender_uid: currentUser.uid,
      receiver_uid: selectedUser.uid,
      text: newMessage.trim(),
      timestamp: new Date().toISOString(), 
    };

    setMessages((prev) => [...prev, messageData]);
    socket.emit('send_chat', messageData);
    
    setNewMessage('');
    fetchInbox();
  };

  return (
    <div className="chat-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="my-profile">
            <div className="avatar">{currentUser.displayName?.charAt(0).toUpperCase()}</div>
            <h3>{currentUser.displayName || 'Me'}</h3>
          </div>
          <button onClick={() => auth.signOut()} className="logout-btn" title="Sign Out">
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
          {searchResults.length > 0 ? (
            <div className="search-results-section">
              <div className="section-title" style={{padding: '10px 15px', fontSize: '0.8rem', color: '#64748b'}}>SEARCH RESULTS</div>
              {searchResults.map((user) => (
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
              ))}
            </div>
          ) : (
            <div className="inbox-section">
              <div className="section-title" style={{padding: '10px 15px', fontSize: '0.8rem', color: '#64748b'}}>RECENT CHATS</div>
              {inboxChats.length === 0 ? (
                 <p className="no-results">No recent chats. Search for a user above.</p>
              ) : (
                inboxChats.map((chat) => (
                  <div 
                    key={chat.chat_id} 
                    className={`user-item ${selectedUser?.uid === chat.other_uid ? 'active' : ''}`}
                    onClick={() => setSelectedUser({ uid: chat.other_uid, username: chat.other_username })}
                  >
                    <div className="avatar small">{chat.other_username?.charAt(0).toUpperCase() || '?'}</div>
                    <div className="user-info" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="user-name">{chat.other_username}</span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{formatTime(chat.timestamp)}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {chat.last_message}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="chat-main">
        {!selectedUser ? (
          <div className="blank-state">
            <div className="logo-placeholder">KP</div>
            <h2>Kamand Prompt Chat</h2>
            <p>Select a conversation or search for a new user.</p>
          </div>
        ) : (
          <div className="chat-window">
            <div className="chat-window-header">
               <div className="avatar">{selectedUser.username?.charAt(0).toUpperCase()}</div>
               <div className="header-user-info">
                 <h3>{selectedUser.username}</h3>
                 <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
                   {isOnline ? '🟢 Online' : '⚪ Offline'}
                 </span>
               </div>
            </div>
            
            <div className="messages-container">
              {isLoadingHistory ? (
                <div className="loading-spinner">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="empty-chat">Say hi to {selectedUser.username}! 👋</div>
              ) : (
                messages.map((msg, index) => {
                  const isMine = msg.sender_uid === currentUser.uid;
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
              
              {/* NEW: Typing Indicator UI */}
              {isTyping && (
                <div className="message-wrapper theirs">
                  <div className="message-bubble theirs typing-bubble">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="message-input-area">
              <input
                type="text"
                placeholder={`Message ${selectedUser.username}...`}
                value={newMessage}
                onChange={handleInputChange} /* UPDATED to trigger socket event */
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