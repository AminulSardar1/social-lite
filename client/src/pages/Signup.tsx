import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    email: '',
    password: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const nextStep = () => {
    if (step === 1 && (!formData.firstName || !formData.lastName)) {
      setError('Please enter your name');
      return;
    }
    if (step === 4 && !formData.email) {
      setError('Please enter your email');
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const prevStep = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register(formData);
      navigate('/home');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      {step > 1 && (
        <button className="back-button" onClick={prevStep}>←</button>
      )}
      
      {error && <div className="error-message">{error}</div>}

      {step === 1 && (
        <div className="signup-step">
          <h1 className="step-title">What's your name?</h1>
          <p className="step-subtitle">Enter the name you use in real life.</p>
          
          <div className="input-row">
            <input
              type="text"
              name="firstName"
              placeholder="First name"
              className="input-field"
              value={formData.firstName}
              onChange={handleChange}
            />
            <input
              type="text"
              name="lastName"
              placeholder="Surname"
              className="input-field"
              value={formData.lastName}
              onChange={handleChange}
            />
          </div>
          
          <button className="btn-primary" onClick={nextStep}>Next</button>
          <button className="btn-secondary" onClick={() => navigate('/login')}>
            Find my account
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="signup-step">
          <h1 className="step-title">What's your date of birth?</h1>
          <p className="step-subtitle">Choose your date of birth. You can always make this private later.</p>
          
          <input
            type="date"
            name="dateOfBirth"
            className="input-field"
            value={formData.dateOfBirth}
            onChange={handleChange}
          />
          
          <button className="btn-primary" onClick={nextStep}>Next</button>
        </div>
      )}

      {step === 3 && (
        <div className="signup-step">
          <h1 className="step-title">What's your gender?</h1>
          <p className="step-subtitle">You can change who sees your gender on your profile later.</p>
          
          <div className="radio-group">
            <label className="radio-option">
              <span className="radio-label">Female</span>
              <input
                type="radio"
                name="gender"
                value="female"
                checked={formData.gender === 'female'}
                onChange={handleChange}
              />
            </label>
            <label className="radio-option">
              <span className="radio-label">Male</span>
              <input
                type="radio"
                name="gender"
                value="male"
                checked={formData.gender === 'male'}
                onChange={handleChange}
              />
            </label>
            <label className="radio-option">
              <div>
                <span className="radio-label">More options</span>
                <div className="radio-sublabel">Select "More options" to choose another gender or if you'd rather not say.</div>
              </div>
              <input
                type="radio"
                name="gender"
                value="other"
                checked={formData.gender === 'other'}
                onChange={handleChange}
              />
            </label>
          </div>
          
          <button className="btn-primary" onClick={nextStep}>Next</button>
        </div>
      )}

      {step === 4 && (
        <div className="signup-step">
          <h1 className="step-title">What's your email address?</h1>
          <p className="step-subtitle">Enter the email address at which you can be contacted. No one will see this on your profile.</p>
          
          <input
            type="email"
            name="email"
            placeholder="Email address"
            className="input-field"
            value={formData.email}
            onChange={handleChange}
          />
          
          <button className="btn-primary" onClick={nextStep}>Next</button>
        </div>
      )}

      {step === 5 && (
        <div className="signup-step">
          <h1 className="step-title">Create a password</h1>
          <p className="step-subtitle">Create a password with at least 6 characters. It should be something others couldn't guess.</p>
          
          <input
            type="password"
            name="password"
            placeholder="Password"
            className="input-field"
            value={formData.password}
            onChange={handleChange}
          />
          
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </div>
      )}
    </div>
  );
}
