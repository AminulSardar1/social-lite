import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface MutualFriend {
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
  mutual_friends: MutualFriend[];
  mutual_friends_count: number;
  created_at: string;
}

interface Suggestion {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  mutual_friends: MutualFriend[];
  mutual_friends_count: number;
}

export default function Friends() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'requests' | 'suggestions'>('requests');
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
    fetchSuggestions();
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/friends/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    const res = await fetch('/api/friends/suggestions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setSuggestions(await res.json());
  };

  const acceptRequest = async (requestId: string) => {
    await fetch(`/api/friends/accept/${requestId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    setRequests(requests.filter(r => r.request_id !== requestId));
  };

  const declineRequest = async (requestId: string) => {
    await fetch(`/api/friends/decline/${requestId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    setRequests(requests.filter(r => r.request_id !== requestId));
  };

  const sendRequest = async (userId: string) => {
    await fetch(`/api/friends/request/${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    setSuggestions(suggestions.filter(s => s.id !== userId));
  };

  const hideSuggestion = async (userId: string) => {
    await fetch(`/api/friends/suggestions/hide/${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    setSuggestions(suggestions.filter(s => s.id !== userId));
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears}y`;
    if (diffWeeks > 0) return `${diffWeeks}w`;
    if (diffDays > 0) return `${diffDays}d`;
    return 'Today';
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="friends-page">
      <header className="friends-header">
        <button className="back-btn" onClick={() => navigate('/home')}>
          <span>&#8249;</span>
        </button>
        <h1>Friends</h1>
        <button className="search-btn">
          <span>&#128269;</span>
        </button>
      </header>

      <div className="friends-tabs">
        <button 
          className={`friends-tab ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Suggestions
        </button>
        <button 
          className={`friends-tab ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Your friends
        </button>
      </div>

      <div className="friends-content">
        {activeTab === 'requests' && (
          <>
            <div className="friends-section-header">
              <h2>Friend requests ({requests.length})</h2>
              <button className="see-all-btn" onClick={() => navigate('/home')}>See all</button>
            </div>
            
            {requests.length === 0 ? (
              <div className="empty-state">
                <p>No friend requests</p>
              </div>
            ) : (
              requests.map(request => (
                <div key={request.request_id} className="friend-request-card">
                  <div 
                    className="friend-request-avatar"
                    onClick={() => navigate(`/profile/${request.id}`)}
                  >
                    {request.avatar_url ? (
                      <img src={request.avatar_url} alt="" />
                    ) : (
                      getInitials(request.first_name, request.last_name)
                    )}
                  </div>
                  <div className="friend-request-info">
                    <div className="friend-request-header">
                      <span 
                        className="friend-request-name"
                        onClick={() => navigate(`/profile/${request.id}`)}
                      >
                        {request.first_name} {request.last_name}
                      </span>
                      <span className="friend-request-time">{formatTime(request.created_at)}</span>
                    </div>
                    {request.mutual_friends_count > 0 && (
                      <div className="mutual-friends">
                        <div className="mutual-avatars">
                          {request.mutual_friends.slice(0, 2).map((mutual, idx) => (
                            <div key={mutual.id} className="mutual-avatar" style={{ left: idx * 12 }}>
                              {mutual.avatar_url ? (
                                <img src={mutual.avatar_url} alt="" />
                              ) : (
                                getInitials(mutual.first_name, mutual.last_name)
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="mutual-count">{request.mutual_friends_count} mutual friends</span>
                      </div>
                    )}
                    <div className="friend-request-actions">
                      <button className="confirm-btn" onClick={() => acceptRequest(request.request_id)}>
                        Confirm
                      </button>
                      <button className="delete-btn" onClick={() => declineRequest(request.request_id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            <div className="friends-section-header" style={{ marginTop: 24 }}>
              <h2>People you may know</h2>
            </div>
            
            {suggestions.map(suggestion => (
              <div key={suggestion.id} className="friend-request-card">
                <div 
                  className="friend-request-avatar"
                  onClick={() => navigate(`/profile/${suggestion.id}`)}
                >
                  {suggestion.avatar_url ? (
                    <img src={suggestion.avatar_url} alt="" />
                  ) : (
                    getInitials(suggestion.first_name, suggestion.last_name)
                  )}
                </div>
                <div className="friend-request-info">
                  <span 
                    className="friend-request-name"
                    onClick={() => navigate(`/profile/${suggestion.id}`)}
                  >
                    {suggestion.first_name} {suggestion.last_name}
                  </span>
                  {suggestion.mutual_friends_count > 0 && (
                    <div className="mutual-friends">
                      <div className="mutual-avatars">
                        {suggestion.mutual_friends.slice(0, 2).map((mutual, idx) => (
                          <div key={mutual.id} className="mutual-avatar" style={{ left: idx * 12 }}>
                            {mutual.avatar_url ? (
                              <img src={mutual.avatar_url} alt="" />
                            ) : (
                              getInitials(mutual.first_name, mutual.last_name)
                            )}
                          </div>
                        ))}
                      </div>
                      <span className="mutual-count">{suggestion.mutual_friends_count} mutual friend{suggestion.mutual_friends_count > 1 ? 's' : ''}</span>
                    </div>
                  )}
                  <div className="friend-request-actions">
                    <button className="confirm-btn" onClick={() => sendRequest(suggestion.id)}>
                      Add friend
                    </button>
                    <button className="delete-btn" onClick={() => hideSuggestion(suggestion.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
