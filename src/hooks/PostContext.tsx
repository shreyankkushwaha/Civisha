import React, { createContext, useContext, useState, ReactNode } from 'react';
import { resetDefaultSEO } from '../utils/seo';

type PostMode = 'view' | 'edit' | 'update_status' | 'withdraw';

interface PostContextType {
  openPost: (postId: string, mode?: PostMode) => void;
  closePost: () => void;
  selectedPostId: string | null;
  postMode: PostMode;
}

const PostContext = createContext<PostContextType | null>(null);

export const usePost = () => {
  const ctx = useContext(PostContext);
  if (!ctx) throw new Error("usePost must be used within PostProvider");
  return ctx;
};

export const PostProvider = ({ children }: { children: ReactNode }) => {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/report\/([^/]+)/);
      if (match) return match[1];
      const params = new URLSearchParams(window.location.search);
      const legacyId = params.get('report');
      if (legacyId) return legacyId;
    }
    return null;
  });
  
  const [postMode, setPostMode] = useState<PostMode>('view');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const legacyId = params.get('report');
      if (legacyId) {
        window.history.replaceState({ postId: legacyId, mode: 'view' }, '', `/report/${legacyId}`);
      }
    }
  }, []);

  React.useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const match = window.location.pathname.match(/^\/report\/([^/]+)/);
      if (match) {
        setSelectedPostId(match[1]);
        setPostMode(event.state?.mode || 'view');
      } else {
        setSelectedPostId(null);
        setPostMode('view');
        resetDefaultSEO();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openPost = (postId: string, mode: PostMode = 'view') => {
    setSelectedPostId(postId);
    setPostMode(mode);
    window.history.pushState({ postId, mode }, '', `/report/${postId}`);
  };

  const closePost = () => {
    setSelectedPostId(null);
    setPostMode('view');
    resetDefaultSEO();
    window.history.pushState({ postId: null }, '', '/');
  };

  return (
    <PostContext.Provider value={{ openPost, closePost, selectedPostId, postMode }}>
      {children}
    </PostContext.Provider>
  );
};
