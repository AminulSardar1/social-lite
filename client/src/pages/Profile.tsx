import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProfileData {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  bio?: string;
  work?: string;
  location?: string;
  cover_photo_url?: string;
  friend_count: number;
  friends: Array<{ id: string; first_name: string; last_name: string; avatar_url?: string }>;
  friendship_status?: string;
  is_own_profile: boolean;
}

interface Post {
  id: string;
  content?: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string; avatar_url?: string };
  reaction_count?: number;
  my_reaction?: string;
  comment_count?: number;
}

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editWork, setEditWork] = useState('');

  const profileId = userId || user?.id;

  useEffect(() => {
    if (profileId) {
      fetchProfile();
      fetchPosts();
    }
  }, [profileId]);

  const fetchProfile = async () => {
    const res = await fetch(`/api/profile/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
      setEditBio(data.bio || '');
      setEditWork(data.work || '');
    }
  };

  const fetchPosts = async () => {
    const res = await fetch(`/api/posts/user/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setPosts(await res.json());
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

  const sendFriendRequest = async () => {
    await fetch(`/api/friends/request/${profileId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchProfile();
  };

  const updateProfile = async () => {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ bio: editBio, work: editWork })
    });
    fetchProfile();
    setShowEditProfile(false);
  };

  const startChat = async () => {
    const res = await fetch(`/api/messages/conversation/start/${profileId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const { conversationId } = await res.json();
      navigate(`/chat/${conversationId}`);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!profile) return <div className="loading">Loading...</div>;

  return (
    <div className="profile-container">
      <header className="profile-header">
        <button className="back-button" onClick={() => navigate('/home')}>←</button>
        <span className="profile-header-name">{profile.first_name} {profile.last_name}</span>
      </header>

      <div className="cover-photo" style={{ 
        backgroundImage: profile.cover_photo_url ? `url(${profile.cover_photo_url})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div className="profile-avatar-container">
          <div className="profile-avatar-large">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              getInitials(profile.first_name, profile.last_name)
            )}
          </div>
        </div>
      </div>

      <div className="profile-info">
        <h1 className="profile-name">{profile.first_name} {profile.last_name}</h1>
        <p className="profile-friends">{profile.friend_count} friends</p>
        
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        {profile.work && <p className="profile-work">Works at {profile.work}</p>}

        <div className="profile-actions">
          {profile.is_own_profile ? (
            <>
              <button className="btn-profile" onClick={() => setShowEditProfile(true)}>
                Edit profile
              </button>
            </>
          ) : (
            <>
              {profile.friendship_status === 'friends' ? (
                <button className="btn-profile" onClick={startChat}>Message</button>
              ) : profile.friendship_status === 'pending_sent' ? (
                <button className="btn-profile secondary">Request sent</button>
              ) : (
                <button className="btn-profile" onClick={sendFriendRequest}>Add Friend</button>
              )}
            </>
          )}
        </div>
      </div>

      {profile.friends.length > 0 && (
        <div className="profile-section">
          <div className="section-header">
            <h3>Friends</h3>
            <span className="friend-count-small">{profile.friend_count} friends</span>
          </div>
          <div className="friends-grid">
            {profile.friends.map(friend => (
              <div 
                key={friend.id} 
                className="friend-card"
                onClick={() => navigate(`/profile/${friend.id}`)}
              >
                <div className="friend-avatar">
                  {friend.avatar_url ? (
                    <img src={friend.avatar_url} alt="" />
                  ) : (
                    getInitials(friend.first_name, friend.last_name)
                  )}
                </div>
                <span className="friend-name">{friend.first_name} {friend.last_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="profile-tabs">
        <button 
          className={`profile-tab ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          Posts
        </button>
        <button 
          className={`profile-tab ${activeTab === 'photos' ? 'active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          Photos
        </button>
      </div>

      <div className="posts-section">
        {profile.is_own_profile && (
          <div className="create-post-prompt" onClick={() => setShowCreatePost(true)}>
            <div className="user-avatar small">
              {getInitials(profile.first_name, profile.last_name)}
            </div>
            <div className="post-input-placeholder">What's on your mind?</div>
          </div>
        )}

        {posts.length === 0 ? (
          <div className="empty-state">No posts yet</div>
        ) : (
          posts.map(post => (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <div className="user-avatar small">
                  {getInitials(post.author.first_name, post.author.last_name)}
                </div>
                <div>
                  <div className="post-author">{post.author.first_name} {post.author.last_name}</div>
                  <div className="post-date">{formatDate(post.created_at)}</div>
                </div>
              </div>
              {post.content && <p className="post-content">{post.content}</p>}
              <div className="post-actions">
                <button className="post-action-btn">
                  👍 {post.reaction_count || 0}
                </button>
                <button className="post-action-btn">
                  💬 {post.comment_count || 0}
                </button>
              </div>
            </div>
          ))
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

      {showEditProfile && (
        <div className="modal-overlay" onClick={() => setShowEditProfile(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit profile</h3>
              <button className="close-btn" onClick={() => setShowEditProfile(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Bio</label>
                <textarea
                  placeholder="Tell people about yourself"
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  className="edit-textarea"
                />
              </div>
              <div className="input-group">
                <label>Work</label>
                <input
                  type="text"
                  placeholder="Where do you work?"
                  value={editWork}
                  onChange={e => setEditWork(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={updateProfile}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
