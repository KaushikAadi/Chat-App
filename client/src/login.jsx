// src/Login.jsx
import { useState } from 'react';
import { auth } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import './Login.css';

// Base URL of your Python backend (set VITE_API_URL in .env for other environments)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Turn Firebase error codes into messages a person can act on
const ERROR_MESSAGES = {
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Can’t reach the server. Check your connection.',
};


const friendlyError = (error) =>
  ERROR_MESSAGES[error.code] || 'Something went wrong. Please try again.';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;



// Asks the Python backend whether a username is free.
// Expected: 200 = available, 409 = taken. Anything else is treated as a server problem.
async function checkUsernameAvailable(name) {
  const response = await fetch(`${API_URL}/check_username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name }),
  });

  if (!response.ok) throw new Error('username-check-failed');

  const data = await response.json();
  return !data.exists; 
}

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message }

  const isSignUp = mode === 'signup';

  const switchMode = () => {
    setMode(isSignUp ? 'signin' : 'signup');
    setStatus(null);
  };

  const showError = (message) => setStatus({ type: 'error', message });

  const handleSignUp = async () => {
    const name = username.trim();

    if (!USERNAME_PATTERN.test(name)) {
      showError('Username must be 3–20 characters: letters, numbers or underscores.');
      return;
    }

     try {
      const available = await checkUsernameAvailable(name);
      if (!available) {
        showError('That username is taken. Try another.');
        return;
      }
    } catch {
      showError('Couldnt check the username. Make sure the server is running and try again.');
      return;
    }
   

    // 2. Create the user in Firebase Auth
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    // 3. Attach the username to the new profile
    // ... existing handleSignUp code ...

    // 3. Attach the username to the new profile
    try {
      await updateProfile(user, { displayName: name });
    } catch {
      setStatus({
        type: 'error',
        message: 'Account created, but we couldn’t save your username. Please try again later.',
      });
      return;
    }

    // --- NEW: 4. Send user data to Python backend ---
    try {
      await fetch(`${API_URL}/register-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: name,
          email: user.email,
          uid: user.uid
        }),
      });
    } catch (err) {
      console.error('Failed to send user to backend:', err);
      // We don't need to show an error to the user here since Firebase auth succeeded
    }
    // ------------------------------------------------

    setStatus({ type: 'success', message: `Registered as ${user.displayName}` });
  };


  const handleSignIn = async () => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    // Fall back to email if the account has no username
    setStatus({ type: 'success', message: `Signed in as ${user.displayName || user.email}` });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await (isSignUp ? handleSignUp() : handleSignIn());
    } catch (error) {
      showError(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) {
      showError('Enter your email above first.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus({ type: 'success', message: `Reset link sent to ${email}` });
    } catch (error) {
      showError(friendlyError(error));
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <header className="auth-header">
          <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p>
            {isSignUp
              ? 'Pick a username and sign up with your email.'
              : 'Sign in to continue to the chat.'}
          </p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                placeholder="e.g. night_owl"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]{3,20}"
                title="3–20 characters: letters, numbers or underscores"
                required
              />
              <small className="field-hint">
                3–20 characters. Letters, numbers and underscores only.
              </small>
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {!isSignUp && (
            <button type="button" className="link-button align-end" onClick={handleReset}>
              Forgot password?
            </button>
          )}

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? 'Please wait' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {/* aria-live so screen readers announce results */}
        <div className="status-region" aria-live="polite">
          {status && (
            <p
              className={`status status-${status.type}`}
              role={status.type === 'error' ? 'alert' : undefined}
            >
              {status.message}
            </p>
          )}
        </div>

        <footer className="auth-footer">
          {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="link-button" onClick={switchMode}>
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </footer>
      </section>
    </main>
  );
}
