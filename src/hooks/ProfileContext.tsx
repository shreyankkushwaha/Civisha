import React, { createContext, useContext, useState, useEffect } from 'react';
import { resetDefaultSEO } from '../utils/seo';

interface ProfileContextType {
  selectedUserId: string | null;
  openUserProfile: (userId: string) => void;
  closeUserProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  selectedUserId: null,
  openUserProfile: () => {},
  closeUserProfile: () => {},
});

function extractUserFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/u\/([^/]+)/);
  if (pathMatch && pathMatch[1]) {
    const decoded = decodeURIComponent(pathMatch[1]).trim().replace(/^@/, '');
    if (decoded && decoded !== 'guest' && !decoded.startsWith('Guest_') && !decoded.startsWith('u_')) {
      return decoded;
    }
  }
  const params = new URLSearchParams(window.location.search);
  const userParam = params.get('user')?.trim().replace(/^@/, '');
  if (userParam && userParam !== 'guest' && !userParam.startsWith('Guest_') && !userParam.startsWith('u_')) {
    return userParam;
  }
  return null;
}

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() => extractUserFromLocation());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const legacyUser = params.get('user')?.trim().replace(/^@/, '');
      if (legacyUser && legacyUser !== 'guest' && !legacyUser.startsWith('Guest_') && !legacyUser.startsWith('u_')) {
        window.history.replaceState({ userId: legacyUser }, '', `/u/${encodeURIComponent(legacyUser)}`);
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const found = extractUserFromLocation();
      setSelectedUserId(found);
      if (!found) {
        resetDefaultSEO();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openUserProfile = (userId: string) => {
    const clean = userId?.trim().replace(/^@/, '');
    if (!clean || clean === 'guest' || clean.startsWith('Guest_') || clean.startsWith('u_')) {
      return;
    }
    setSelectedUserId(clean);
    if (typeof window !== 'undefined') {
      window.history.pushState({ userId: clean }, '', `/u/${encodeURIComponent(clean)}`);
    }
  };

  const closeUserProfile = () => {
    setSelectedUserId(null);
    resetDefaultSEO();
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/u/') || window.location.search.includes('user=')) {
        window.history.pushState({}, '', '/');
      }
    }
  };

  return (
    <ProfileContext.Provider value={{ selectedUserId, openUserProfile, closeUserProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const usePublicProfile = () => useContext(ProfileContext);
