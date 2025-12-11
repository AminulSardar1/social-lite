import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

interface FriendRequest {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  request_id: string;
  mutual_friends_count?: number;
}

interface Conversation {
  id: string;
  is_group: boolean;
  name?: string;
  participants: User[];
  last_message?: {
    content: string;
    created_at: string;
  };
}

interface ReactionSummary {
  reaction: string;
  count: number;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string; avatar_url?: string };
}

interface Post {
  id: string;
  content?: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string; avatar_url?: string };
  reaction_count?: number;
  reaction_summary?: ReactionSummary[];
  my_reaction?: string;
  comment_count?: number;
}

const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like', color: '#1877f2' },
  { key: 'love', emoji: '❤️', label: 'Love', color: '#e91e63' },
  { key: 'care', emoji: '🥰', label: 'Care', color: '#f7b125' },
  { key: 'haha', emoji: '😆', label: 'Haha', color: '#f7b125' },
  { key: 'wow', emoji: '😮', label: 'Wow', color: '#f7b125' },
  { key: 'sad', emoji: '😢', label: 'Sad', color: '#f7b125' },
  { key: 'angry', emoji: '😠', label: 'Angry', color: '#e9710f' }
];

export default function Home() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { onlineUsers } = useSocket();
  const [activeTab, setActiveTab] = useState('feed');
  const [friends, setFriends] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<{[key: string]: Comment[]}>({});
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    if (token) {
      fetchFriends();
      fetchFriendRequests();
      fetchConversations();
      fetchFeed();
    }
  }, [token]);

  const fetchFriends = async () => {
    const res = await fetch('/api/friends', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setFriends(await res.json());
  };

  const fetchFriendRequests = async () => {
    const res = await fetch('/api/friends/requests', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setFriendRequests(await res.json());
  };

  const fetchConversations = async () => {
    const res = await fetch('/api/messages/conversations', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setConversations(await res.json());
  };

  const fetchFeed = async () => {
    const res = await fetch('/api/posts/feed', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setPosts(await res.json());
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setSearchResults(await res.json());
  };

  const sendFriendRequest = async (userId: string) => {
    await fetch(`/api/friends/request/${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    setSearchResults(searchResults.filter(u => u.id !== userId));
  };

  const acceptRequest = async (requestId: string) => {
    await fetch(`/api/friends/accept/${requestId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchFriendRequests();
    fetchFriends();
  };

  const declineRequest = async (requestId: string) => {
    await fetch(`/api/friends/decline/${requestId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchFriendRequests();
  };

  const startChat = async (userId: string) => {
    const res = await fetch(`/api/messages/conversation/start/${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const { conversationId } = await res.json();
      navigate(`/chat/${conversationId}`);
    }
  };

  const createPost = async () => {
    if (!postContent.trim()) return;
    setLoading(true);

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: postContent })
      });

      if (res.ok) {
        const newPost = await res.json();
        setPosts([newPost, ...posts]);
        setPostContent('');
        setShowCreatePost(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const reactToPost = async (postId: string, reaction: string) => {
    const post = posts.find(p => p.id === postId);
    const isSameReaction = post?.my_reaction === reaction;
    
    const res = await fetch(`/api/posts/${postId}/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reaction: isSameReaction ? null : reaction })
    });
    
    if (res.ok) {
      const data = await res.json();
      setPosts(posts.map(p => 
        p.id === postId 
          ? { 
              ...p, 
              my_reaction: data.reaction,
              reaction_summary: data.reaction_summary,
              reaction_count: data.reaction_count
            }
          : p
      ));
    }
    setShowReactions(null);
  };

  const fetchComments = async (postId: string) => {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setComments(prev => ({ ...prev, [postId]: data }));
    }
  };

  const toggleComments = async (postId: string) => {
    if (showComments === postId) {
      setShowComments(null);
    } else {
      setShowComments(postId);
      if (!comments[postId]) {
        await fetchComments(postId);
      }
    }
  };

  const addComment = async (postId: string) => {
    if (!commentText.trim()) return;
    
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ content: commentText })
    });
    
    if (res.ok) {
      const newComment = await res.json();
      setComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newComment]
      }));
      setPosts(posts.map(p => 
        p.id === postId 
          ? { ...p, comment_count: (p.comment_count || 0) + 1 }
          : p
      ));
      setCommentText('');
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getReactionEmoji = (key: string) => {
    return REACTIONS.find(r => r.key === key)?.emoji || '👍';
  };

  const getTopReactions = (summary: ReactionSummary[] | undefined) => {
    if (!summary) return [];
    return summary.sort((a, b) => b.count - a.count).slice(0, 3);
  };

  return (
    <div className="home-container">
      <header className="header">
        <h1 className="header-title">Social Lite</h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => navigate('/profile')}>👤</button>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          Feed
        </button>
        <button
          className={`nav-tab ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
        </button>
        <button
          className={`nav-tab ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          Friends
        </button>
        <button
          className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
      </nav>

      <div className="content">
        {activeTab === 'feed' && (
          <>
            <div className="create-post-prompt" onClick={() => setShowCreatePost(true)}>
              <div className="user-avatar small">
                {user && getInitials(user.first_name, user.last_name)}
              </div>
              <div className="post-input-placeholder">What's on your mind?</div>
            </div>

            {posts.length === 0 ? (
              <div className="empty-state">
                <p>No posts yet</p>
                <p>Create a post or add friends to see their posts!</p>
              </div>
            ) : (
              posts.map(post => (
                <div key={post.id} className="post-card">
                  <div className="post-header" onClick={() => navigate(`/profile/${post.author.id}`)}>
                    <div className="user-avatar small">
                      {getInitials(post.author.first_name, post.author.last_name)}
                    </div>
                    <div>
                      <div className="post-author">{post.author.first_name} {post.author.last_name}</div>
                      <div className="post-date">{formatDate(post.created_at)}</div>
                    </div>
                  </div>
                  {post.content && <p className="post-content">{post.content}</p>}
                  
                  {(post.reaction_count || 0) > 0 && (
                    <div className="reaction-summary">
                      <div className="reaction-icons">
                        {getTopReactions(post.reaction_summary).map(r => (
                          <span key={r.reaction} className="summary-emoji">{getReactionEmoji(r.reaction)}</span>
                        ))}
                      </div>
                      <span className="reaction-total">{post.reaction_count}</span>
                    </div>
                  )}
                  
                  <div className="post-actions">
                    <div className="post-action-wrapper">
                      <button 
                        className={`post-action-btn ${post.my_reaction ? 'reacted' : ''}`}
                        onClick={() => post.my_reaction ? reactToPost(post.id, post.my_reaction) : reactToPost(post.id, 'like')}
                        onMouseEnter={() => setShowReactions(post.id)}
                        onMouseLeave={() => setTimeout(() => setShowReactions(null), 300)}
                      >
                        {post.my_reaction ? getReactionEmoji(post.my_reaction) : '👍'} 
                        {post.my_reaction ? REACTIONS.find(r => r.key === post.my_reaction)?.label : 'Like'}
                      </button>
                      
                      {showReactions === post.id && (
                        <div 
                          className="reactions-popup"
                          onMouseEnter={() => setShowReactions(post.id)}
                          onMouseLeave={() => setShowReactions(null)}
                        >
                          {REACTIONS.map(r => (
                            <button 
                              key={r.key} 
                              className="reaction-option"
                              onClick={(e) => {
                                e.stopPropagation();
                                reactToPost(post.id, r.key);
                              }}
                              title={r.label}
                            >
                              {r.emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="post-action-btn" onClick={() => toggleComments(post.id)}>
                      💬 Comment {post.comment_count ? `(${post.comment_count})` : ''}
                    </button>
                  </div>

                  {showComments === post.id && (
                    <div className="comments-section">
                      <div className="comment-input-wrapper">
                        <div className="user-avatar tiny">
                          {user && getInitials(user.first_name, user.last_name)}
                        </div>
                        <input
                          type="text"
                          className="comment-input"
                          placeholder="Write a comment..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addComment(post.id)}
                        />
                        <button 
                          className="comment-send-btn"
                          onClick={() => addComment(post.id)}
                          disabled={!commentText.trim()}
                        >
                          ➤
                        </button>
                      </div>
                      
                      <div className="comments-list">
                        {(comments[post.id] || []).map(comment => (
                          <div key={comment.id} className="comment-item">
                            <div className="user-avatar tiny" onClick={() => navigate(`/profile/${comment.author.id}`)}>
                              {getInitials(comment.author.first_name, comment.author.last_name)}
                            </div>
                            <div className="comment-content">
                              <span className="comment-author">{comment.author.first_name} {comment.author.last_name}</span>
                              <span className="comment-text">{comment.content}</span>
                              <span className="comment-time">{formatDate(comment.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'messages' && (
          <>
            <h2 className="section-title">Chats</h2>
            {conversations.length === 0 ? (
              <div className="empty-state">
                <p>No conversations yet</p>
                <p>Find friends and start chatting!</p>
              </div>
            ) : (
              conversations.map(conv => {
                const participant = conv.participants?.[0];
                if (!participant && !conv.is_group) return null;
                return (
                  <div
                    key={conv.id}
                    className="conversation-item"
                    onClick={() => navigate(`/chat/${conv.id}`)}
                  >
                    <div className="user-avatar">
                      {conv.is_group ? (
                        conv.name?.[0] || 'G'
                      ) : (
                        getInitials(participant?.first_name || '', participant?.last_name || '')
                      )}
                    </div>
                    <div className="conversation-preview">
                      <div className="conversation-name">
                        {conv.is_group ? conv.name : `${participant?.first_name} ${participant?.last_name}`}
                      </div>
                      {conv.last_message && (
                        <div className="conversation-last-message">
                          {conv.last_message.content}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === 'friends' && (
          <>
            {friendRequests.length > 0 && (
              <>
                <div className="section-header-row">
                  <h2 className="section-title">Friend Requests</h2>
                  <button className="see-all-link" onClick={() => navigate('/friends')}>See all</button>
                </div>
                {friendRequests.slice(0, 3).map(request => (
                  <div key={request.request_id} className="user-card">
                    <div className="user-avatar" onClick={() => navigate(`/profile/${request.id}`)}>
                      {getInitials(request.first_name, request.last_name)}
                    </div>
                    <div className="user-info" onClick={() => navigate(`/profile/${request.id}`)}>
                      <div className="user-name">{request.first_name} {request.last_name}</div>
                      {request.mutual_friends_count && request.mutual_friends_count > 0 && (
                        <div className="user-status">{request.mutual_friends_count} mutual friends</div>
                      )}
                    </div>
                    <button className="btn-action" onClick={() => acceptRequest(request.request_id)}>
                      Confirm
                    </button>
                    <button className="btn-action secondary" onClick={() => declineRequest(request.request_id)}>
                      Delete
                    </button>
                  </div>
                ))}
              </>
            )}

            <h2 className="section-title">Friends ({friends.length})</h2>
            {friends.length === 0 ? (
              <div className="empty-state">
                <p>No friends yet</p>
                <p>Search for people to connect with!</p>
              </div>
            ) : (
              friends.map(friend => (
                <div key={friend.id} className="user-card">
                  <div className="user-avatar" onClick={() => navigate(`/profile/${friend.id}`)}>
                    {getInitials(friend.first_name, friend.last_name)}
                  </div>
                  <div className="user-info" onClick={() => navigate(`/profile/${friend.id}`)}>
                    <div className="user-name">{friend.first_name} {friend.last_name}</div>
                    <div className="user-status">
                      {onlineUsers.has(friend.id) ? '🟢 Online' : '⚪ Offline'}
                    </div>
                  </div>
                  <button className="btn-action" onClick={() => startChat(friend.id)}>Message</button>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'search' && (
          <>
            <h2 className="section-title">Find People</h2>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name or email..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            {searchResults.map(searchUser => (
              <div key={searchUser.id} className="user-card">
                <div className="user-avatar" onClick={() => navigate(`/profile/${searchUser.id}`)}>
                  {getInitials(searchUser.first_name, searchUser.last_name)}
                </div>
                <div className="user-info" onClick={() => navigate(`/profile/${searchUser.id}`)}>
                  <div className="user-name">{searchUser.first_name} {searchUser.last_name}</div>
                </div>
                <button className="btn-action" onClick={() => sendFriendRequest(searchUser.id)}>
                  Add Friend
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {showCreatePost && (
        <div className="modal-overlay" onClick={() => setShowCreatePost(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create post</h3>
              <button className="close-btn" onClick={() => setShowCreatePost(false)}>×</button>
            </div>
            <div className="modal-body">
              <textarea
                placeholder="What's on your mind?"
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
                className="post-textarea"
              />
            </div>
            <div className="modal-footer">
              <button 
                className="btn-primary" 
                onClick={createPost}
                disabled={loading || !postContent.trim()}
              >
                {loading ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
