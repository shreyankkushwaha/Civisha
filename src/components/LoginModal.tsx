import React, { useState } from 'react';
import { auth, db, checkIsAdminUser } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { X, Mail, Lock, AlertCircle, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';

interface LoginModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function LoginModal({ onClose, onSuccess }: LoginModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [unauthorizedDomainError, setUnauthorizedDomainError] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyDomain = () => {
    if (currentHost) {
      navigator.clipboard.writeText(currentHost);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    }
  };

  const syncUserToFirestore = async (user: any) => {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const isAdminUser = checkIsAdminUser(user);

    if (!userSnap.exists()) {
      const baseName = (user.displayName || displayName || (user.email ? user.email.split('@')[0] : 'citizen'))
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      let candidateHandle = baseName.length >= 3 ? baseName.substring(0, 20) : `citizen_${Math.floor(1000 + Math.random() * 9000)}`;

      try {
        const testSnap = await getDoc(doc(db, 'usernames', candidateHandle));
        if (testSnap.exists() && testSnap.data().uid !== user.uid) {
          candidateHandle = `${candidateHandle.substring(0, 15)}_${Math.floor(100 + Math.random() * 900)}`;
        }
        await setDoc(doc(db, 'usernames', candidateHandle), {
          uid: user.uid,
          createdAt: serverTimestamp()
        });
      } catch (reserveErr) {
        console.warn('Could not reserve username in registry:', reserveErr);
      }

      await setDoc(userRef, {
        isAnonymous: false,
        isAdmin: isAdminUser,
        isSuspended: false,
        isBanned: false,
        createdAt: serverTimestamp(),
        displayName: user.displayName || displayName || (isAdminUser ? 'Admin' : 'User'),
        handle: candidateHandle,
        bio: '',
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        notificationSettings: {
          report_updates: true,
          verification_activity: true,
          comments_mentions: true,
          nearby_reports: false,
          community_events: true
        }
      });
    } else {
      const data = userSnap.data();
      if (data?.handle) {
        try {
          const cleanH = data.handle.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
          const uDoc = await getDoc(doc(db, 'usernames', cleanH));
          if (!uDoc.exists()) {
            await setDoc(doc(db, 'usernames', cleanH), { uid: user.uid, createdAt: serverTimestamp() });
          }
        } catch (e) {
          // non-fatal
        }
      }
      if (isAdminUser && !data?.isAdmin) {
        await updateDoc(userRef, { isAdmin: true });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnauthorizedDomainError(false);
    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await syncUserToFirestore(userCredential.user);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await syncUserToFirestore(userCredential.user);
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in Firebase console.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection or disable ad-blockers/VPNs.');
      } else {
        setError(err.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setUnauthorizedDomainError(false);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const userCredential = await signInWithPopup(auth, provider);
      await syncUserToFirestore(userCredential.user);
      onSuccess();
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        return;
      }
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        setUnauthorizedDomainError(true);
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google sign-in is not enabled in Firebase console.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection or disable ad-blockers/VPNs.');
      } else {
        setError(err.message || 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {unauthorizedDomainError && (
            <div className="mb-5 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-xs space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Domain Not Authorized in Firebase</span>
              </div>
              <p className="leading-relaxed">
                Google OAuth requires this preview domain to be added to Authorized Domains in your Firebase Console.
              </p>
              <div className="bg-amber-100/70 dark:bg-amber-900/50 p-2.5 rounded-lg flex items-center justify-between gap-2 border border-amber-200/60 dark:border-amber-700/60">
                <code className="font-mono text-[11px] truncate select-all">{currentHost}</code>
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="flex items-center gap-1 bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 px-2 py-1 rounded font-medium text-[11px] transition-colors flex-shrink-0"
                >
                  {copiedDomain ? <Check className="w-3.5 h-3.5 text-green-700 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedDomain ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="space-y-1 text-amber-800/90 dark:text-amber-300/90 pt-1">
                <div>1. Go to <strong>Firebase Console → Authentication → Settings → Authorized domains</strong></div>
                <div>2. Click <strong>Add domain</strong> and paste the copied domain.</div>
              </div>
              <div className="pt-1 flex items-center justify-between">
                <a
                  href="https://console.firebase.google.com/project/civishatest2/authentication/settings"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Open Firebase Settings <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-gray-500 dark:text-gray-400">or use Email below</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-sm rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                  placeholder="Your Name"
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              onClick={() => triggerHaptic()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center disabled:opacity-70 shadow-sm"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between">
            <span className="w-1/5 border-b border-gray-200 dark:border-gray-700"></span>
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">Or continue with</span>
            <span className="w-1/5 border-b border-gray-200 dark:border-gray-700"></span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              triggerHaptic();
              handleGoogleSignIn();
            }}
            disabled={loading}
            className="mt-6 w-full py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-colors flex items-center justify-center disabled:opacity-70"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </button>

          <div className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => { 
                triggerHaptic();
                setIsLogin(!isLogin); 
                setError(''); 
                setUnauthorizedDomainError(false); 
              }}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
