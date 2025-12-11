import { useNavigate } from 'react-router-dom';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="signup-container">
      <div className="signup-header">
        <div className="signup-illustration">
          <div className="illustration-content">
            <div className="heart-icon">❤</div>
            <div className="photo-frame">👨‍👩‍👧</div>
            <div className="like-icon">👍</div>
          </div>
        </div>
        <p className="signup-title">
          Create an account to connect with friends, family and communities of people who share your interests.
        </p>
      </div>
      
      <button className="btn-primary" onClick={() => navigate('/signup')}>
        Create new account
      </button>
      
      <button className="btn-secondary" onClick={() => navigate('/login')}>
        Already have an account? <span className="link-text">Log in</span>
      </button>
    </div>
  );
}
