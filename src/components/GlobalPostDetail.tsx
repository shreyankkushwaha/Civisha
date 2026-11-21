
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PostDetailModal } from './PostDetailModal';
import { ShareModal } from './ShareModal';
import { usePost } from '../hooks/PostContext';
import { api } from '../api';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNetwork } from '../hooks/NetworkContext';
import { AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import { useGlobalFeed } from '../hooks/useGlobalFeed';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function GlobalPostDetail() {
  const { selectedPostId, closePost, postMode } = usePost();
  const { posts } = useGlobalFeed();
  const [userId, setUserId] = useState<string>(() => {
    if (auth.currentUser?.uid) return auth.currentUser.uid;
    let localUid = localStorage.getItem('local_user_id');
    if (!localUid) {
      localUid = `u_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('local_user_id', localUid);
    }
    return localUid;
  });
  const [sharePost, setSharePost] = useState<any>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const { runWithNetwork } = useNetwork();
  const [standalonePost, setStandalonePost] = useState<any>(null);

  useEffect(() => {
    return auth.onAuthStateChanged((u) => {
      if (u?.uid) {
        setUserId(u.uid);
      } else {
        let localUid = localStorage.getItem('local_user_id');
        if (!localUid) {
          localUid = `u_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          localStorage.setItem('local_user_id', localUid);
        }
        setUserId(localUid);
      }
    });
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        (err) => console.warn("Location not available"),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Ensure the selected post exists in our list. If not, fetch it standalone.
  useEffect(() => {
    if (!selectedPostId) {
      setStandalonePost(null);
      return;
    }
    const found = posts.find(p => p.id === selectedPostId);
    if (!found) {
      getDoc(doc(db, 'reports', selectedPostId)).then(docSnap => {
        if (docSnap.exists()) {
          setStandalonePost({ id: docSnap.id, ...docSnap.data() });
        }
      });
    } else {
      setStandalonePost(null);
    }
  }, [selectedPostId, posts]);

  const { toast } = useToast();

  const handleAction = async (id: string, action: 'confirm' | 'false' | 'upvote') => {
    runWithNetwork(async () => {
      try {
        await api.interactWithPost(id, action, userId);
      } catch (e: any) {
        console.error(`Failed to ${action} post`, e);
        toast(e.message || `Failed to ${action}`, 'error');
      }
    });
  };

  const handleAddComment = async (postId: string, text: string, parentId?: string) => {
    if (!text.trim()) return;
    const currentUser = auth.currentUser;
    let authorName = currentUser?.displayName;
    if (!authorName) {
      let guestId = sessionStorage.getItem('guest_id');
      if (!guestId) {
        guestId = `Guest#${Math.floor(1000 + Math.random() * 9000)}`;
        sessionStorage.setItem('guest_id', guestId);
      }
      authorName = guestId;
    }
    let authorAvatar = currentUser?.photoURL || '';
    let authorHandle = '';
    if (currentUser) {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          if (d.displayName) authorName = d.displayName;
          if (d.photoURL) authorAvatar = d.photoURL;
          if (d.handle) authorHandle = d.handle;
        }
      } catch (e) {
        // non-fatal
      }
    }
    const actualUserId = currentUser?.uid || 'guest';
    try {
      await api.addComment(postId, { 
        text: text.trim(), 
        author: authorName, 
        parentId, 
        authorAvatar, 
        authorHandle 
      }, actualUserId);
    } catch (e) {
      console.error('Failed to post comment', e);
    }
  };

  const handleShare = (id: string) => {
    const matched = posts.find(p => p.id === id) || standalonePost;
    setSharePost(matched || { id });
  };

  let distance = Infinity;
  const currentPost = selectedPostId ? (posts.find(p => p.id === selectedPostId) || standalonePost) : null;
  if (userLat !== null && userLng !== null && selectedPostId) {
    if (currentPost && currentPost.lat && currentPost.lng) {
      distance = getDistance(userLat, userLng, currentPost.lat, currentPost.lng);
    }
  }

  useEffect(() => {
    if (!currentPost) {
      document.title = 'Civisha – Civic Issue Reporting & Community Verification';
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          'Report, verify, and track local civic issues in real time with community-driven accountability, live radar maps, and civic impact analytics on Civisha.'
        );
      }
      
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.remove();
      
      const jsonLd = document.querySelector('script[id="structured-data"]');
      if (jsonLd) jsonLd.remove();
      
      return;
    }

    const title = `${currentPost.title} | Civisha`;
    document.title = title;
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', currentPost.content.substring(0, 150) + (currentPost.content.length > 150 ? '...' : ''));

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${window.location.origin}/report/${currentPost.id}`);

    let jsonLd = document.querySelector('script[id="structured-data"]');
    if (!jsonLd) {
      jsonLd = document.createElement('script');
      jsonLd.setAttribute('type', 'application/ld+json');
      jsonLd.setAttribute('id', 'structured-data');
      document.head.appendChild(jsonLd);
    }
    
    const schemaData = {
      "@context": "https://schema.org",
      "@type": "DiscussionForumPosting",
      "headline": currentPost.title,
      "text": currentPost.content,
      "datePublished": currentPost.createdAt instanceof Date ? currentPost.createdAt.toISOString() : (currentPost.createdAt?.toDate ? currentPost.createdAt.toDate().toISOString() : new Date().toISOString()),
      "author": {
        "@type": "Person",
        "name": currentPost.isAnonymous ? "Anonymous Citizen" : currentPost.author
      },
      "url": `${window.location.origin}/report/${currentPost.id}`,
      "image": currentPost.imageUrl ? [currentPost.imageUrl] : []
    };
    jsonLd.textContent = JSON.stringify(schemaData);
  }, [currentPost]);
  const canVerify = distance <= 500;
  
  const feedPosts = standalonePost ? [standalonePost, ...posts.filter(p => p.id !== standalonePost.id)] : posts;

  return createPortal(
    <>
      <AnimatePresence mode="wait">
        {selectedPostId && feedPosts.length > 0 && (
          <PostDetailModal 
            posts={feedPosts} 
            initialPostId={selectedPostId}
            initialMode={postMode}
            isOpen={!!selectedPostId} 
            onClose={closePost}
            onAction={handleAction}
            onAddComment={handleAddComment}
            userId={userId || ''}
            canVerify={canVerify}
            onShare={handleShare}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {sharePost && (
          <ShareModal isOpen={!!sharePost} onClose={() => setSharePost(null)} postId={sharePost.id} post={sharePost} />
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
