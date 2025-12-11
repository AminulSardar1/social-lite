import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

interface MessageReaction {
  user_id: string;
  reaction: string;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
  reactions?: MessageReaction[];
  deleted_for_everyone?: boolean;
}

interface ConversationInfo {
  id: string;
  is_group: boolean;
  name?: string;
  photo_url?: string;
  members?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
    nickname?: string;
    is_admin: boolean;
  }[];
  is_muted: boolean;
  is_admin: boolean;
}

const REACTIONS = ['❤️', '😆', '😮', '😢', '😡', '👍'];
const REACTION_MAP: { [key: string]: string } = {
  'heart': '❤️',
  'laugh': '😆',
  'wow': '😮',
  'sad': '😢',
  'angry': '😡',
  'like': '👍'
};

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    fetchConversationInfo();
  }, [conversationId]);

  useEffect(() => {
    if (socket && conversationId) {
      socket.emit('join_conversation', conversationId);
      
      socket.on('new_message', (message: Message) => {
        setMessages(prev => [...prev, message]);
      });

      socket.on('message_reaction_updated', (data: { messageId: string; reactions: MessageReaction[] }) => {
        setMessages(prev => prev.map(m => 
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        ));
      });

      socket.on('message_deleted', (data: { messageId: string; deletedForEveryone: boolean }) => {
        if (data.deletedForEveryone) {
          setMessages(prev => prev.map(m => 
            m.id === data.messageId ? { ...m, deleted_for_everyone: true, content: 'This message was deleted' } : m
          ));
        } else {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }
      });

      return () => {
        socket.off('new_message');
        socket.off('message_reaction_updated');
        socket.off('message_deleted');
      };
    }
  }, [socket, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    const res = await fetch(`/api/messages/conversation/${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setMessages(await res.json());
    }
  };

  const fetchConversationInfo = async () => {
    const res = await fetch(`/api/messages/conversation/${conversationId}/info`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setConversationInfo(await res.json());
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !socket) return;
    
    socket.emit('send_message', {
      conversationId: conversationId!,
      content: newMessage
    });
    setNewMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reactToMessage = (messageId: string, reaction: string) => {
    if (!socket) return;
    const reactionKey = Object.keys(REACTION_MAP).find(k => REACTION_MAP[k] === reaction);
    socket.emit('react_message', {
      messageId,
      conversationId: conversationId!,
      reaction: reactionKey
    });
    setShowReactions(null);
  };

  const deleteMessage = (messageId: string, forEveryone: boolean) => {
    if (!socket) return;
    socket.emit('delete_message', {
      messageId,
      conversationId: conversationId!,
      forEveryone
    });
    setShowMessageMenu(null);
  };

  const toggleMute = async () => {
    await fetch(`/api/messages/conversation/${conversationId}/mute`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ muted: !conversationInfo?.is_muted })
    });
    fetchConversationInfo();
  };

  const leaveGroup = async () => {
    await fetch(`/api/messages/conversation/${conversationId}/leave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    navigate('/home');
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const getDisplayName = () => {
    if (conversationInfo?.is_group) {
      return conversationInfo.name || 'Group Chat';
    }
    const other = conversationInfo?.members?.find(m => m.id !== user?.id);
    return other ? `${other.first_name} ${other.last_name}` : '';
  };

  const getReactionEmoji = (reaction: string) => {
    return REACTION_MAP[reaction] || reaction;
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <button className="back-button" onClick={() => navigate('/home')} style={{ color: 'white', marginBottom: 0 }}>
          &#8249;
        </button>
        <div className="chat-header-info" onClick={() => setShowSettings(true)}>
          <div className="user-avatar" style={{ width: 40, height: 40, fontSize: 14, marginRight: 0 }}>
            {conversationInfo?.is_group && conversationInfo.photo_url ? (
              <img src={conversationInfo.photo_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
            ) : (
              getInitials(
                conversationInfo?.members?.find(m => m.id !== user?.id)?.first_name || '',
                conversationInfo?.members?.find(m => m.id !== user?.id)?.last_name || ''
              )
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{getDisplayName()}</div>
            {conversationInfo?.is_group && (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{conversationInfo.members?.length} members</div>
            )}
          </div>
        </div>
        <div className="chat-header-actions">
          <button className="header-action-btn" onClick={() => {}}>📞</button>
          <button className="header-action-btn" onClick={() => {}}>📹</button>
          <button className="header-action-btn" onClick={() => setShowSettings(true)}>⚙️</button>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map(message => (
          <div
            key={message.id}
            className={`message ${message.sender_id === user?.id ? 'sent' : ''} ${message.deleted_for_everyone ? 'deleted' : ''}`}
          >
            <div 
              className="message-bubble"
              onContextMenu={(e) => {
                e.preventDefault();
                setShowMessageMenu(message.id);
              }}
              onClick={() => setShowReactions(showReactions === message.id ? null : message.id)}
            >
              {message.deleted_for_everyone ? (
                <span className="deleted-message-text">This message was deleted</span>
              ) : (
                message.content
              )}
              <div className="message-time" style={{ color: message.sender_id === user?.id ? 'rgba(255,255,255,0.7)' : '#65676b' }}>
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              
              {message.reactions && message.reactions.length > 0 && (
                <div className="message-reactions-display">
                  {message.reactions.map((r, idx) => (
                    <span key={idx} className="reaction-badge">{getReactionEmoji(r.reaction)}</span>
                  ))}
                </div>
              )}
            </div>

            {showReactions === message.id && !message.deleted_for_everyone && (
              <div className="reactions-picker">
                {REACTIONS.map(r => (
                  <button key={r} className="reaction-btn" onClick={() => reactToMessage(message.id, r)}>
                    {r}
                  </button>
                ))}
                <button className="reaction-btn more" onClick={() => setShowMessageMenu(message.id)}>+</button>
              </div>
            )}

            {showMessageMenu === message.id && (
              <div className="message-menu-overlay" onClick={() => setShowMessageMenu(null)}>
                <div className="message-menu" onClick={e => e.stopPropagation()}>
                  <div className="message-menu-reactions">
                    {REACTIONS.map(r => (
                      <button key={r} className="menu-reaction-btn" onClick={() => reactToMessage(message.id, r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <button className="menu-item" onClick={() => navigator.clipboard.writeText(message.content)}>
                    <span className="menu-icon">📋</span> Copy
                  </button>
                  <button className="menu-item" onClick={() => {}}>
                    <span className="menu-icon">↪️</span> Forward
                  </button>
                  <button className="menu-item" onClick={() => {}}>
                    <span className="menu-icon">↩️</span> Reply
                  </button>
                  <button className="menu-item delete" onClick={() => setShowMessageMenu(`delete-${message.id}`)}>
                    <span className="menu-icon">🗑️</span> Delete
                  </button>
                </div>
              </div>
            )}

            {showMessageMenu === `delete-${message.id}` && (
              <div className="message-menu-overlay" onClick={() => setShowMessageMenu(null)}>
                <div className="delete-options" onClick={e => e.stopPropagation()}>
                  <button className="delete-option" onClick={() => deleteMessage(message.id, false)}>
                    <span className="delete-icon">🗑️</span>
                    Delete for me
                  </button>
                  {message.sender_id === user?.id && (
                    <button className="delete-option" onClick={() => deleteMessage(message.id, true)}>
                      <span className="delete-icon">🗑️</span>
                      Delete for everyone
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <input
          type="text"
          placeholder="Type a message..."
          className="chat-input"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button className="send-btn" onClick={sendMessage}>
          ➤
        </button>
      </div>

      {showSettings && conversationInfo && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="chat-settings-modal" onClick={e => e.stopPropagation()}>
            <button className="settings-back" onClick={() => setShowSettings(false)}>&#8249;</button>
            
            <div className="settings-header">
              <div className="settings-avatar">
                {conversationInfo.is_group && conversationInfo.photo_url ? (
                  <img src={conversationInfo.photo_url} alt="" />
                ) : (
                  getInitials(
                    conversationInfo.members?.find(m => m.id !== user?.id)?.first_name || '',
                    conversationInfo.members?.find(m => m.id !== user?.id)?.last_name || ''
                  )
                )}
              </div>
              <div className="settings-name">{getDisplayName()}</div>
              {!conversationInfo.is_group && (
                <div className="settings-encryption">🔒 End-to-end encrypted</div>
              )}
            </div>

            <div className="settings-actions-row">
              <button className="settings-action">
                <span className="action-icon">📞</span>
                <span>Call</span>
              </button>
              <button className="settings-action">
                <span className="action-icon">📹</span>
                <span>Video Chat</span>
              </button>
              <button className="settings-action" onClick={() => navigate(`/profile/${conversationInfo.members?.find(m => m.id !== user?.id)?.id}`)}>
                <span className="action-icon">👤</span>
                <span>Profile</span>
              </button>
              <button className="settings-action" onClick={toggleMute}>
                <span className="action-icon">{conversationInfo.is_muted ? '🔔' : '🔕'}</span>
                <span>{conversationInfo.is_muted ? 'Unmute' : 'Mute'}</span>
              </button>
            </div>

            <div className="settings-section">
              <h4>Actions</h4>
              <button className="settings-item">
                <span>✉️</span> Mark as unread
              </button>
              {conversationInfo.is_group && (
                <button className="settings-item" onClick={() => setShowMembers(true)}>
                  <span>👥</span> See members
                </button>
              )}
            </div>

            <div className="settings-section">
              <h4>Customization</h4>
              {conversationInfo.is_group && (
                <>
                  <button className="settings-item">
                    <span>✏️</span> Change group name
                  </button>
                  <button className="settings-item">
                    <span>🖼️</span> Change group photo
                  </button>
                </>
              )}
              <button className="settings-item">
                <span>👍</span> Quick reaction
              </button>
              <button className="settings-item">
                <span>Aa</span> Nicknames
              </button>
            </div>

            <div className="settings-section">
              <h4>Privacy & support</h4>
              {!conversationInfo.is_group && (
                <button className="settings-item">
                  <span>🔒</span> Verify end-to-end encryption
                </button>
              )}
              <button className="settings-item">
                <span>🔐</span> Message permissions
              </button>
              <button className="settings-item">
                <span>⏱️</span> Disappearing messages
              </button>
              <button className="settings-item toggle">
                <span>👁️</span> Read receipts
                <span className="toggle-status">On</span>
              </button>
              {conversationInfo.is_group ? (
                <button className="settings-item danger" onClick={leaveGroup}>
                  <span>🚪</span> Leave Group
                </button>
              ) : (
                <button className="settings-item danger">
                  <span>🚫</span> Block {getDisplayName()}
                </button>
              )}
              <button className="settings-item">
                <span>⚠️</span> Report
              </button>
            </div>
          </div>
        </div>
      )}

      {showMembers && conversationInfo?.is_group && (
        <div className="modal-overlay" onClick={() => setShowMembers(false)}>
          <div className="members-modal" onClick={e => e.stopPropagation()}>
            <header className="members-header">
              <button className="back-btn" onClick={() => setShowMembers(false)}>&#8249;</button>
              <h2>See members</h2>
              <button className="add-btn">+</button>
            </header>
            <div className="members-count">{conversationInfo.members?.length} members</div>
            <div className="members-list">
              {conversationInfo.members?.map(member => (
                <div key={member.id} className="member-item" onClick={() => navigate(`/profile/${member.id}`)}>
                  <div className="member-avatar">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" />
                    ) : (
                      getInitials(member.first_name, member.last_name)
                    )}
                  </div>
                  <div className="member-info">
                    <div className="member-name">
                      {member.first_name} {member.last_name}
                      {member.is_admin && <span className="admin-badge">Admin</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
