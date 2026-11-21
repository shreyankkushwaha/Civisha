import React, { useState, useEffect, useRef } from 'react';
import { usePost } from "../hooks/PostContext";
import { usePublicProfile } from "../hooks/ProfileContext";
import { 
  User, LogOut, LogIn, FileText, CheckCircle, 
  Moon, Bell, Shield, File, Zap, Trophy, Users, 
  HelpCircle, MessageSquare, ChevronRight, ArrowLeft, Camera, Loader2, Save, Info, ExternalLink
} from 'lucide-react';
import { NOTIFICATION_CATEGORIES, NotificationSettings, NotificationPrefKey, ReportPost } from '../types';
import { api } from '../api';
import { LoginModal } from './LoginModal';
import { TermsPage, PrivacyPage, AboutPage, HowItWorksPage, SupportPage } from './InfoPages';
import { auth, db, checkIsAdminUser } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface ListItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  rightElement?: React.ReactNode;
  disabled?: boolean;
}

const ListItem: React.FC<ListItemProps> = ({ 
  icon, title, subtitle, href, onClick, rightElement, disabled 
}) => {
  const content = (
    <>
      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 mr-3">
        {icon}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white">{title}</div>
        {subtitle && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{subtitle}</div>
        )}
      </div>
      <div className="flex-shrink-0 ml-4 flex items-center">
        {rightElement ? rightElement : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
      </div>
    </>
  );

  const className = `w-full flex items-center px-4 py-3.5 bg-white dark:bg-gray-800 transition-colors ${
    disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600'
  }`;

  if (href && !disabled) {
    return (
      <a
        href={href}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && onClick) {
            e.preventDefault();
            onClick();
          }
        }}
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {content}
    </button>
  );
};

const ListGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "mb-4" }) => (
  <div className={className}>
    <div className="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 sm:border-x sm:rounded-xl sm:overflow-hidden">
      {children}
    </div>
  </div>
);

const PillToggle = ({ isOn, onToggle, disabled }: { isOn: boolean; onToggle: () => void; disabled?: boolean }) => (
  <button 
    onClick={onToggle}
    disabled={disabled}
    className={`px-4 py-1.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider transition-colors ${
      disabled 
        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border-2 border-transparent'
        : isOn 
          ? 'bg-indigo-600 text-white border-2 border-indigo-600' 
          : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
    }`}
  >
    {isOn ? 'On' : 'Off'}
  </button>
);


const compressImage = (file: File, maxWidth: number = 512, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function ProfileTab({
  onOpenAdmin,
  onOpenSupport,
  onOpenInfoPage,
}: {
  onOpenAdmin?: () => void;
  onOpenSupport?: () => void;
  onOpenInfoPage?: (page: 'about' | 'how-it-works' | 'support' | 'privacy' | 'terms') => void;
}) {
  const { openPost } = usePost();
  const { openUserProfile } = usePublicProfile();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [reportCount, setReportCount] = useState<number>(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [activePage, setActivePage] = useState<'profile' | 'privacy' | 'terms' | 'about' | 'how-it-works' | 'support' | 'notifications' | 'edit-profile' | 'my-reports' | 'my-verifications'>('profile');

  // Edit Profile States
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lists states
  const [myReports, setMyReports] = useState<ReportPost[]>([]);
  const [myVerifications, setMyVerifications] = useState<ReportPost[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  // Notification states
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoggedIn(true);
        // Fetch user data from firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const isAdminUser = checkIsAdminUser(user, userDoc.exists() ? userDoc.data() : undefined);
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (isAdminUser) {
            data.isAdmin = true;
          }
          setCurrentUser(data);
          if (data.notificationSettings) {
            setSettings(data.notificationSettings);
          }
        } else {
          setCurrentUser({
            displayName: user.displayName || (isAdminUser ? 'Admin' : 'User'),
            email: user.email,
            photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
            isAdmin: isAdminUser
          });
        }
        
        // Fetch report count
        const count = await api.getUserReportCount(user.uid);
        setReportCount(count);
      } else {
        setIsLoggedIn(false);
        setCurrentUser(null);
        setReportCount(0);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activePage === 'notifications' && !settings && isLoggedIn) {
      api.getSettings().then(setSettings).catch(console.error);
    }
  }, [activePage, settings, isLoggedIn]);

  useEffect(() => {
    if (activePage === 'edit-profile' && currentUser) {
      setEditName(currentUser.displayName || '');
      setEditHandle(currentUser.handle || '');
      setEditBio(currentUser.bio || '');
      setEditAvatar(currentUser.photoURL || '');
      setEditError('');
    }
  }, [activePage, currentUser]);

  useEffect(() => {
    const loadLists = async () => {
      if (!auth.currentUser) return;
      setListsLoading(true);
      if (activePage === 'my-reports') {
        const reports = await api.getUserReports(auth.currentUser.uid, true);
        setMyReports(reports);
      } else if (activePage === 'my-verifications') {
        const verifications = await api.getUserVerifications(auth.currentUser.uid);
        setMyVerifications(verifications);
      }
      setListsLoading(false);
    };
    if (activePage === 'my-reports' || activePage === 'my-verifications') {
      loadLists();
    }
  }, [activePage]);

  const toggleSetting = (key: NotificationPrefKey) => {
    if (!settings) return;
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    if (isLoggedIn) {
      api.updateSettings(newSettings).catch(console.error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const toggleLogin = () => {
    if (isLoggedIn) {
      handleLogout();
    } else {
      setShowLoginModal(true);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEditError('');
      setIsSaving(true);
      try {
        const base64Data = await compressImage(file, 512, 0.7);
        const proxyUrl = await api.uploadImage(base64Data, file.name);
        setEditAvatar(proxyUrl);
        setIsSaving(false);
      } catch (err: any) {
        throw new Error(err.message || 'Compression or upload failed.');
      }
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || 'Failed to upload image.');
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!auth.currentUser) return;
    setIsSaving(true);
    setEditError('');
    try {
      const cleanHandle = editHandle.trim().replace(/^@/, '');
      if (cleanHandle && currentUser?.handle !== cleanHandle) {
        const isUnique = await api.checkUniqueHandle(cleanHandle, auth.currentUser.uid);
        if (!isUnique) {
          setEditError('Username handle is already taken.');
          setIsSaving(false);
          return;
        }
      }

      await api.updateUserProfile(auth.currentUser.uid, {
        displayName: editName.trim(),
        handle: cleanHandle,
        bio: editBio.trim(),
        photoURL: editAvatar
      });
      
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setCurrentUser(userDoc.data());
      }
      setActivePage('profile');
    } catch (err: any) {
      setEditError(err.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (activePage === 'edit-profile') {
    return (
      <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col z-50 absolute inset-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center">
            <button onClick={() => setActivePage('profile')} className="mr-4 text-gray-900 dark:text-white p-1 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Edit Profile</h2>
          </div>
          <button 
            onClick={handleSaveProfile} 
            disabled={isSaving}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 max-w-lg mx-auto w-full">
          {editError && (
            <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-lg text-sm">{editError}</div>
          )}
          <div className="flex flex-col items-center mb-8">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <img src={editAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.email}`} alt="Avatar" className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 shadow-sm object-cover" />
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-8 h-8 text-white" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Tap to change photo</p>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username Handle</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                <input type="text" value={editHandle} onChange={e => setEditHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white" />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Bio</label>
                <span className="text-xs text-gray-400 font-mono">{editBio.length}/500</span>
              </div>
              <textarea 
                value={editBio} 
                onChange={e => setEditBio(e.target.value.slice(0, 500))} 
                rows={3} 
                placeholder="Tell the community about your civic interests..." 
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white resize-none text-sm" 
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activePage === 'my-reports' || activePage === 'my-verifications') {
    const posts = activePage === 'my-reports' ? myReports : myVerifications;
    const title = activePage === 'my-reports' ? 'My Reports' : 'My Verifications';
    return (
      <div className="w-full h-full bg-gray-50 dark:bg-gray-900 flex flex-col z-50 absolute inset-0 overflow-hidden">
        <div className="flex items-center px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <button onClick={() => setActivePage('profile')} className="mr-3 p-1 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          </button>
          <h2 className="text-xl font-bold tracking-tight dark:text-white">{title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {listsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>No reports found.</p>
            </div>
          ) : (
            posts.map(post => (
              <div key={post.id} onClick={() => openPost(post.id)} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="w-20 h-20 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=600'; e.currentTarget.onerror = null; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate pr-2">{post.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide whitespace-nowrap ${
                      post.status === 'Solved' || post.status === 'Complete' ? 'bg-green-100 text-green-700' :
                      post.status === 'Pending' ? 'bg-red-100 text-red-700' :
                      post.status === 'In Progress' ? 'bg-amber-100 text-amber-700' :
                      post.status === 'Under Review' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{post.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{post.timeAgo}</p>
                  <div className="mt-2 flex gap-3 text-xs text-gray-600 dark:text-gray-300 font-medium">
                    <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {post.confirms}</span>
                    <span className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" /> {post.falses}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Same logic for notifications, privacy, terms...
  if (activePage === 'notifications') {
    return (
      <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col z-50 absolute inset-0 overflow-hidden">
        <div className="flex items-center px-4 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <button onClick={() => setActivePage('profile')} className="mr-4 text-gray-900 dark:text-white p-1 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Notification Prefs</h2>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50/30 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800">
            {settings ? (
              NOTIFICATION_CATEGORIES.map(category => (
                <div key={category.id} className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex-1 pr-4">
                    <span className="text-[17px] text-gray-900 dark:text-white font-medium tracking-tight block">{category.label}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 block mt-0.5">{category.description}</span>
                  </div>
                  <PillToggle 
                    isOn={settings[category.id]} 
                    onToggle={() => toggleSetting(category.id)} 
                    disabled={("disabled" in category ? category.disabled : false)} 
                  />
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading preferences...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activePage === 'about') {
    return <AboutPage onClose={() => setActivePage('profile')} />;
  }

  if (activePage === 'how-it-works') {
    return <HowItWorksPage onClose={() => setActivePage('profile')} />;
  }

  if (activePage === 'support') {
    return <SupportPage onClose={() => setActivePage('profile')} />;
  }

  if (activePage === 'terms') {
    return <TermsPage onClose={() => setActivePage('profile')} />;
  }

  if (activePage === 'privacy') {
    return <PrivacyPage onClose={() => setActivePage('profile')} />;
  }

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto pb-24">
      {showLoginModal && (
        <LoginModal 
          onClose={() => setShowLoginModal(false)} 
          onSuccess={() => setShowLoginModal(false)} 
        />
      )}
      {/* Top Section */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pt-8 pb-6 px-4 sm:px-6 mb-6">
        {isLoggedIn && currentUser ? (
          <div>
            <div className="flex items-center">
              <img 
                src={currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.email}`} 
                alt={currentUser.displayName} 
                className="w-16 h-16 rounded-full bg-indigo-100 border-2 border-white dark:border-gray-800 shadow-sm object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => auth.currentUser && openUserProfile(auth.currentUser.uid)}
              />
              <div className="ml-4 flex-1 min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white truncate">{currentUser.displayName}</h2>
                <div className="flex flex-col">
                   {currentUser.handle && <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">@{currentUser.handle}</span>}
                   <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{auth.currentUser?.email || currentUser.email}</span>
                </div>
              </div>
              <div className="text-center bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-2 border border-gray-100 dark:border-gray-600 ml-2">
                <div className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">{reportCount}</div>
                <div className="text-xs text-gray-500 dark:text-gray-300 font-medium">Reports</div>
              </div>
            </div>
            {currentUser.bio && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                {currentUser.bio}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <button 
                onClick={() => auth.currentUser && openUserProfile(auth.currentUser.uid)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                <span>Preview public profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-3">
              <User className="w-8 h-8 text-indigo-400 dark:text-indigo-500" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-1">Create an Account</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
              Sign in to track your reports, earn verified status, and join the community.
            </p>
            <button 
              onClick={toggleLogin}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-full transition-colors"
            >
              Login / Signup
            </button>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-0 sm:px-4 space-y-4">
        {/* Account / Activity if logged in */}
        {isLoggedIn && (
          <ListGroup>
            <ListItem 
              icon={<User className="w-4 h-4" />} 
              title="Edit Profile" 
              subtitle="Update your personal details"
              onClick={() => setActivePage('edit-profile')}
            />
            <ListItem 
              icon={<ExternalLink className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />} 
              title="Public Profile" 
              subtitle="See how your profile looks to other citizens"
              onClick={() => auth.currentUser && openUserProfile(auth.currentUser.uid)}
            />
            {(currentUser?.isAdmin || checkIsAdminUser(auth.currentUser, currentUser)) && (
              <ListItem 
                icon={<Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />} 
                title="Admin Panel" 
                subtitle="Manage reports, users & system analytics"
                onClick={onOpenAdmin}
              />
            )}
            <ListItem 
              icon={<FileText className="w-4 h-4" />} 
              title="My Reports" 
              subtitle="View reports you have submitted"
              onClick={() => setActivePage('my-reports')}
            />
            <ListItem 
              icon={<CheckCircle className="w-4 h-4" />} 
              title="My Verifications" 
              subtitle="Reports you have confirmed or rejected"
              onClick={() => setActivePage('my-verifications')}
            />
          </ListGroup>
        )}

        {/* Preferences */}
        <ListGroup>
          <ListItem 
            icon={<Moon className="w-4 h-4" />} 
            title="Dark Mode" 
            onClick={() => {
              const newMode = !darkMode;
              setDarkMode(newMode);
              if (newMode) {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
              } else {
                document.documentElement.classList.remove('dark');
                localStorage.theme = 'light';
              }
            }}
            rightElement={
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            }
          />
          <ListItem 
            icon={<Bell className="w-4 h-4" />} 
            title="Notifications" 
            onClick={isLoggedIn ? () => setActivePage('notifications') : toggleLogin}
          />
        </ListGroup>

        {/* Info & Legal Section in exact requested order */}
        <ListGroup>
          <ListItem 
            icon={<Info className="w-4 h-4" />} 
            title="About Civisha"
            subtitle="Civisha civic reporting platform, mission & public accountability data"
            href="/about"
            onClick={() => onOpenInfoPage ? onOpenInfoPage('about') : setActivePage('about')}
          />
          <ListItem 
            icon={<Zap className="w-4 h-4" />} 
            title="How Civisha Works"
            subtitle="How to report civic problems, 500m GPS verification & trust scores"
            href="/how-it-works"
            onClick={() => onOpenInfoPage ? onOpenInfoPage('how-it-works') : setActivePage('how-it-works')}
          />
          <ListItem 
            icon={<HelpCircle className="w-4 h-4" />} 
            title="Help & Support"
            subtitle="Citizen help center for civic issue reports, verification & data requests"
            href="/support"
            onClick={() => onOpenInfoPage ? onOpenInfoPage('support') : (onOpenSupport ? onOpenSupport() : setActivePage('support'))}
          />
          <ListItem 
            icon={<Shield className="w-4 h-4" />} 
            title="Privacy"
            subtitle="Ghost Mode anonymous reporting, location privacy & citizen data safety"
            href="/privacy"
            onClick={() => onOpenInfoPage ? onOpenInfoPage('privacy') : setActivePage('privacy')}
          />
          <ListItem 
            icon={<File className="w-4 h-4" />} 
            title="Terms"
            subtitle="Civic reporting standards, community verification rules & platform terms"
            href="/terms"
            onClick={() => onOpenInfoPage ? onOpenInfoPage('terms') : setActivePage('terms')}
          />
        </ListGroup>

        {/* Auth Action */}
        <ListGroup>
          {isLoggedIn ? (
            <ListItem 
              icon={<LogOut className="w-4 h-4 text-red-500" />} 
              title="Logout" 
              onClick={toggleLogin}
            />
          ) : (
            <ListItem 
              icon={<LogIn className="w-4 h-4 text-indigo-500" />} 
              title="Login / Signup" 
              onClick={toggleLogin}
            />
          )}
        </ListGroup>
        
        <div className="text-center py-6 pb-24 text-xs font-medium text-gray-400 dark:text-gray-500">
          App Version 1.1 (Admin Sync)
        </div>
      </div>
    </div>
  );
}
