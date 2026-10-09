import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from './firebase';
import { updateProfile } from 'firebase/auth'; // For updating your own DP
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

// Universal Avatar Component
const Avatar = ({ url, name, isSmall }) => {
  const className = `avatar ${isSmall ? 'small' : ''}`;
  if (url) {
    return <img src={url} alt="DP" className={className} style={{ objectFit: 'cover', padding: 0, border: 'none' }} />;
  }
  return <div className={className}>{name?.charAt(0).toUpperCase() || '?'}</div>;
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
  const [isTyping, setIsTyping] = useState(false);
  
  // Modal States
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatar, setProfileAvatar] = useState(currentUser.photoURL || '');

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState([]);
  const [isSearchingMsgs, setIsSearchingMsgs] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportedMsgId, setReportedMsgId] = useState(null);
  
  // Inline Edit State
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');

  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const newSocket = io(API_URL, { auth: { uid: currentUser.uid } });
    setSocket(newSocket);

    newSocket.on('receive_chat', (messageData) => {
      setMessages((prev) => {
        if (selectedUser && messageData.sender_uid === selectedUser.uid) {
          newSocket.emit('mark_message_read', { message_id: messageData.message_id, sender_uid: messageData.sender_uid });
          return [...prev, messageData];
        }
        return prev;
      });

      if (!selectedUser || messageData.sender_uid !== selectedUser.uid) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Message', { body: messageData.text });
        }
      }
      fetchInbox();
    });

    newSocket.on('user_typing', (data) => {
      if (selectedUser && data.sender_uid === selectedUser.uid) setIsTyping(data.is_typing);
    });
    newSocket.on('message_deleted', (data) => {
      setMessages((prev) => prev.filter(msg => msg.message_id !== data.message_id));
      fetchInbox();
    });
    newSocket.on('message_edited', (data) => {
      setMessages((prev) => prev.map(msg => msg.message_id === data.message_id ? { ...msg, text: data.new_text, is_edited: true } : msg));
    });
    newSocket.on('receive_reaction', (data) => {
      setMessages((prev) => prev.map(msg => msg.message_id === data.message_id ? { ...msg, reactions: [...(msg.reactions || []), data.reaction] } : msg));
    });
    newSocket.on('message_read', (data) => {
      setMessages((prev) => prev.map(msg => msg.message_id === data.message_id ? { ...msg, is_read: true } : msg));
    });

    return () => newSocket.disconnect();
  }, [currentUser, selectedUser]); 

  useEffect(() => { setIsTyping(false); }, [selectedUser]);

  const fetchInbox = async () => {
    try {
      const res = await fetch(`${API_URL}/inbox/${currentUser.uid}`);
      if (res.ok) setInboxChats(await res.json());
    } catch (err) {}
  };
  useEffect(() => { fetchInbox(); }, [currentUser.uid]);

  useEffect(() => {
    if (!selectedUser) return;
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const chatId = generateChatId(currentUser.uid, selectedUser.uid);
        const res = await fetch(`${API_URL}/chat-history/${chatId}`);
        if (res.ok) {
          const history = await res.json();
          setMessages(history);
          history.forEach(msg => {
            if (msg.sender_uid === selectedUser.uid && !msg.is_read && socket) {
              socket.emit('mark_message_read', { message_id: msg.message_id, sender_uid: msg.sender_uid });
            }
          });
        } else setMessages([]);
      } catch (err) {} finally { setIsLoadingHistory(false); }
    };
    fetchHistory();
  }, [selectedUser, currentUser.uid, socket]);

  useEffect(() => {
    if (!selectedUser) return;
    const checkOnlineStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/is-online/${selectedUser.uid}`);
        if (res.ok) setIsOnline((await res.json()).online);
      } catch (err) {}
    };
    
    // AI is always online
    if (selectedUser.uid === 'ai') {
      setIsOnline(true);
      return;
    }

    checkOnlineStatus(); 
    const intervalId = setInterval(checkOnlineStatus, 10000); 
    return () => clearInterval(intervalId); 
  }, [selectedUser]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]); 

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return setSearchResults([]);
    try {
      const res = await fetch(`${API_URL}/search-users?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.filter(u => u.uid !== currentUser.uid));
      }
    } catch (err) {}
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    if (!socket || !selectedUser) return;
    socket.emit('typing', { sender_uid: currentUser.uid, receiver_uid: selectedUser.uid, is_typing: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { sender_uid: currentUser.uid, receiver_uid: selectedUser.uid, is_typing: false });
    }, 2000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing', { sender_uid: currentUser.uid, receiver_uid: selectedUser.uid, is_typing: false });

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

  const handleDelete = (messageId) => {
    if (!messageId) return;
    setMessages((prev) => prev.filter(msg => msg.message_id !== messageId));
    socket.emit('delete_message', { message_id: messageId, chat_id: generateChatId(currentUser.uid, selectedUser.uid), receiver_uid: selectedUser.uid });
  };

  // Save Inline Edit
  const saveEdit = () => {
    if (!editingMessageId || !editMessageText.trim()) return;
    
    setMessages((prev) => prev.map(msg => 
      msg.message_id === editingMessageId ? { ...msg, text: editMessageText.trim(), is_edited: true } : msg
    ));
    
    socket.emit('edit_message', { 
      message_id: editingMessageId, 
      new_text: editMessageText.trim(), 
      receiver_uid: selectedUser.uid 
    });
    
    setEditingMessageId(null);
    setEditMessageText('');
  };

  const handleReaction = (messageId) => {
    if (!messageId) return;
    const emoji = "👍";
    setMessages((prev) => prev.map(msg => msg.message_id === messageId ? { ...msg, reactions: [...(msg.reactions || []), emoji] } : msg));
    socket.emit('send_reaction', { message_id: messageId, reaction: emoji, receiver_uid: selectedUser.uid });
  };

  // Profile Update (Now updates Firebase Auth too!)
  const submitProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.uid, bio: profileBio, avatar_url: profileAvatar })
      });
      if (res.ok) {
        if (profileAvatar) {
          await updateProfile(auth.currentUser, { photoURL: profileAvatar });
        }
        alert("Profile updated successfully!");
        setShowProfileModal(false);
      }
    } catch (err) { console.error(err); }
  };

  const submitMessageSearch = async (e) => {
    e.preventDefault();
    if (!msgSearchQuery.trim() || !selectedUser) return;
    setIsSearchingMsgs(true);
    try {
      const chatId = generateChatId(currentUser.uid, selectedUser.uid);
      const res = await fetch(`${API_URL}/search-messages/${chatId}?q=${encodeURIComponent(msgSearchQuery)}`);
      if (res.ok) setMsgSearchResults(await res.json());
    } catch (err) { console.error(err); } 
    finally { setIsSearchingMsgs(false); }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/report-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: reportedMsgId, reported_by_uid: currentUser.uid, reason: reportReason })
      });
      if (res.ok) {
        alert("Message reported successfully.");
        setShowReportModal(false);
        setReportReason('');
        setReportedMsgId(null);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="chat-layout">
      {/* BULLETPROOF STYLES: Ensured Modals & Actions always render correctly */}
      <style>{`
        .msg-actions { display: none; gap: 8px; position: absolute; top: -12px; right: 10px; background: var(--bg-panel); padding: 4px 8px; border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        .message-wrapper:hover .msg-actions { display: flex; }
        .action-btn { background: none; border: none; cursor: pointer; font-size: 0.9rem; opacity: 0.7; transition: 0.2s; }
        .action-btn:hover { opacity: 1; transform: scale(1.1); }
        .msg-reactions { display: flex; gap: 2px; font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 8px; width: fit-content; margin-top: 4px; }
        .msg-status { font-size: 0.7rem; margin-left: 5px; color: #60a5fa; }
        .icon-btn { background: transparent; border: none; font-size: 1.2rem; cursor: pointer; transition: 0.2s; opacity: 0.8; }
        .icon-btn:hover { opacity: 1; transform: scale(1.1); }
        
        /* Modal Overlays */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .modal-content { background: #0f172a; border: 1px solid rgba(148, 163, 184, 0.2); padding: 25px; border-radius: 15px; width: 90%; max-width: 400px; color: white; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .modal-input { width: 100%; padding: 12px; margin-bottom: 12px; background: #111a2b; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 10px; color: white; outline: none; }
        .modal-input:focus { border-color: #3b82f6; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; }
        .btn-primary, .btn-danger, .btn-cancel { padding: 10px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-cancel { background: transparent; color: #94a3b8; border: 1px solid #64748b; }
        .search-results-box { background: #070b14; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 10px; padding: 12px; max-height: 200px; overflow-y: auto; margin-bottom: 10px; }
        .msg-result { background: #0f172a; padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 0.9rem; border: 1px solid rgba(148, 163, 184, 0.1); }
      `}</style>

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="my-profile">
            <Avatar url={currentUser.photoURL} name={currentUser.displayName} />
            <h3>{currentUser.displayName || 'Me'}</h3>
          </div>
          <div style={{display: 'flex', gap: '8px'}}>
            <button onClick={() => setShowProfileModal(true)} className="icon-btn" title="Settings">⚙️</button>
            <button onClick={() => auth.signOut()} className="logout-btn" title="Sign Out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="search-form">
          <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
          <button type="submit" className="search-btn">🔍</button>
        </form>

        {/* --- AI BOT BUTTON --- */}
        <div 
          className={`user-item ${selectedUser?.uid === 'ai' ? 'active' : ''}`} 
          onClick={() => setSelectedUser({ 
            uid: 'ai', 
            username: 'Kamand AI Assistant', 
            avatar_url: '' 
          })}
          style={{ 
            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(49, 46, 129, 0.4))', 
            margin: '10px', 
            borderRadius: '10px',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            cursor: 'pointer'
          }}
        >
          <div className="avatar small" style={{ background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            🤖
          </div>
          <div className="user-info" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
             <span className="user-name" style={{ fontWeight: 'bold', color: '#60a5fa' }}>Kamand AI</span>
             <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Always online</span>
          </div>
        </div>
        {/* ----------------------- */}

        <div className="user-list">
          {searchResults.length > 0 ? (
            <div className="search-results-section">
              <div className="section-title">SEARCH RESULTS</div>
              {searchResults.map((user) => (
                <div key={user.uid} className={`user-item ${selectedUser?.uid === user.uid ? 'active' : ''}`} onClick={() => setSelectedUser(user)}>
                  <Avatar url={user.avatar_url} name={user.username} isSmall />
                  <div className="user-info"><span className="user-name">{user.username}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="inbox-section">
              <div className="section-title">RECENT CHATS</div>
              {inboxChats.length === 0 ? (
                 <p className="no-results">No recent chats. Search for a user above.</p>
              ) : (
                inboxChats.map((chat) => (
                  <div key={chat.chat_id} className={`user-item ${selectedUser?.uid === chat.other_uid ? 'active' : ''}`} onClick={() => setSelectedUser({ uid: chat.other_uid, username: chat.other_username, avatar_url: chat.avatar_url })}>
                    <Avatar url={chat.avatar_url} name={chat.other_username} isSmall />
                    <div className="user-info" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="user-name">{chat.other_username}</span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{formatTime(chat.timestamp)}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.last_message}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="chat-main">
        {!selectedUser ? (
          <div className="blank-state">
            <div className="logo-placeholder">KP</div>
            <h2>Kamand Prompt Chat</h2>
            <p>Select a conversation or search for a new user.</p>
          </div>
        ) : (
          <div className="chat-window">
            <div className="chat-window-header" style={{justifyContent: 'space-between'}}>
               <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                 {selectedUser.uid === 'ai' ? (
                   <div className="avatar" style={{ background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🤖</div>
                 ) : (
                   <Avatar url={selectedUser.avatar_url} name={selectedUser.username} />
                 )}
                 <div className="header-user-info">
                   <h3>{selectedUser.username}</h3>
                   <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>{isOnline ? '🟢 Online' : '⚪ Offline'}</span>
                 </div>
               </div>
               <button onClick={() => setShowSearchModal(true)} className="icon-btn" title="Search in Chat">🔍</button>
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
                        
                        <div className="msg-actions">
                          {isMine && msg.message_id && <button className="action-btn" onClick={() => {setEditingMessageId(msg.message_id); setEditMessageText(msg.text);}} title="Edit">✏️</button>}
                          {isMine && msg.message_id && <button className="action-btn" onClick={() => handleDelete(msg.message_id)} title="Delete">🗑️</button>}
                          {!isMine && msg.message_id && <button className="action-btn" onClick={() => handleReaction(msg.message_id)} title="React">👍</button>}
                          {!isMine && msg.message_id && selectedUser.uid !== 'ai' && <button className="action-btn" onClick={() => { setReportedMsgId(msg.message_id); setShowReportModal(true); }} title="Report">🚩</button>}
                        </div>

                        {editingMessageId === msg.message_id ? (
                          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px'}}>
                            <input 
                              type="text" 
                              value={editMessageText} 
                              onChange={(e) => setEditMessageText(e.target.value)}
                              style={{padding: '8px', borderRadius: '6px', border: 'none', color: 'black'}}
                              autoFocus
                            />
                            <div style={{display: 'flex', gap: '5px'}}>
                              <button onClick={saveEdit} className="btn-primary" style={{padding: '4px 8px', fontSize: '0.8rem'}}>Save</button>
                              <button onClick={() => setEditingMessageId(null)} className="btn-cancel" style={{padding: '4px 8px', fontSize: '0.8rem'}}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="msg-text">
                            {msg.text} {msg.is_edited && <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>(edited)</span>}
                          </div>
                        )}
                        
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="msg-reactions">{msg.reactions.join('')}</div>
                        )}

                        <div className="msg-time">
                          {formatTime(msg.timestamp)}
                          {isMine && msg.is_read && <span className="msg-status"> ✓✓</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {isTyping && (
                <div className="message-wrapper theirs"><div className="message-bubble theirs typing-bubble"><span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span></div></div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="message-input-area">
              <input type="text" placeholder={`Message ${selectedUser.username}...`} value={newMessage} onChange={handleInputChange} className="message-input" autoComplete="off" />
              <button type="submit" className="send-btn" disabled={!newMessage.trim()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
            </form>
          </div>
        )}
      </main>

      {/* --- MODALS --- */}
      {showProfileModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Update Profile</h3>
            <form onSubmit={submitProfileUpdate}>
              <input type="text" placeholder="Bio..." className="modal-input" value={profileBio} onChange={(e) => setProfileBio(e.target.value)} />
              <input type="text" placeholder="Avatar URL (Image link)..." className="modal-input" value={profileAvatar} onChange={(e) => setProfileAvatar(e.target.value)} />
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowProfileModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSearchModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <h3>Search in Chat</h3>
            <form onSubmit={submitMessageSearch} style={{display: 'flex', gap: '8px', marginBottom: '15px'}}>
              <input type="text" placeholder="Search phrase..." className="modal-input" style={{marginBottom: 0}} value={msgSearchQuery} onChange={(e) => setMsgSearchQuery(e.target.value)} />
              <button type="submit" className="btn-primary">Search</button>
            </form>
            <div className="search-results-box">
              {isSearchingMsgs ? <p style={{color: '#94a3b8'}}>Searching...</p> : msgSearchResults.length === 0 ? <p style={{color: '#94a3b8'}}>No results found.</p> : (
                msgSearchResults.map((res, i) => (
                  <div key={i} className="msg-result">
                    <span style={{fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px'}}>{formatTime(res.timestamp)}</span>
                    <p>{res.text}</p>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => { setShowSearchModal(false); setMsgSearchResults([]); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{color: '#ef4444'}}>Report Message</h3>
            <p style={{marginBottom: '15px', fontSize: '0.85rem', color: '#94a3b8'}}>This will send the message to moderation for review.</p>
            <form onSubmit={submitReport}>
              <input type="text" placeholder="Reason for reporting (optional)..." className="modal-input" value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowReportModal(false)}>Cancel</button>
                <button type="submit" className="btn-danger">Submit Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}