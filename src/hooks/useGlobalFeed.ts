import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { ReportPost } from '../types';
import { api } from '../api';

let cachedPosts: ReportPost[] = [];
let isSubscribed = false;
let subscribers: ((posts: ReportPost[]) => void)[] = [];

function getRelativeTime(date: Date) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const daysDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDifference === 0) {
    const hoursDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60 * 60));
    if (hoursDifference === 0) {
      const minutesDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60));
      return rtf.format(minutesDifference, 'minute');
    }
    return rtf.format(hoursDifference, 'hour');
  }
  return rtf.format(daysDifference, 'day');
}

let globalUnsubscribe: (() => void) | null = null;

export function useGlobalFeed() {
  const [posts, setPosts] = useState<ReportPost[]>(cachedPosts);
  const [loading, setLoading] = useState(cachedPosts.length === 0);

  useEffect(() => {
    subscribers.push(setPosts);
    
    if (!isSubscribed) {
      isSubscribed = true;
      const reportsRef = collection(db, 'reports');
      // Fetch up to 300 recent reports to keep it scalable, yet large enough for client-side sorting & personalization
      const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(300));
      
      globalUnsubscribe = onSnapshot(q, async (snapshot) => {
        const newPosts: ReportPost[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          // Exclude Withdrawn and Rejected reports from public feeds and radar
          if (data.status === 'Withdrawn' || data.status === 'Rejected') return;

          const dateObj = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
          const validDate = dateObj && !isNaN(dateObj.getTime()) ? dateObj : null;
          newPosts.push({
            id: doc.id,
            ...data,
            timeAgo: validDate ? getRelativeTime(validDate) : 'Recently',
            formattedDate: validDate ? validDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
            formattedDateTime: validDate ? `${validDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • ${validDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : '',
            comments: [] 
          } as unknown as ReportPost);
        });
        
        cachedPosts = newPosts;
        subscribers.forEach(sub => sub(cachedPosts));
        setLoading(false);

        // Asynchronously resolve latest public author profiles for non-anonymous posts
        try {
          const authorIds = newPosts.filter(p => !p.isAnonymous && p.authorId).map(p => p.authorId!);
          if (authorIds.length > 0) {
            const profileMap = await api.resolveAuthorProfiles(authorIds);
            const enrichedPosts = newPosts.map(p => {
              if (!p.isAnonymous && p.authorId && profileMap.has(p.authorId)) {
                const prof = profileMap.get(p.authorId)!;
                return {
                  ...p,
                  author: prof.displayName || p.author,
                  authorAvatar: prof.photoURL || p.authorAvatar,
                  authorHandle: prof.handle || p.authorHandle
                };
              }
              return p;
            });
            cachedPosts = enrichedPosts;
            subscribers.forEach(sub => sub(cachedPosts));
          }
        } catch (_) {
          // non-fatal
        }
      }, (err) => {
         console.error('Error fetching global feed:', err);
         setLoading(false);
      });
    } else {
      setLoading(cachedPosts.length === 0);
    }

    return () => {
      subscribers = subscribers.filter(sub => sub !== setPosts);
      if (subscribers.length === 0 && globalUnsubscribe) {
        globalUnsubscribe();
        globalUnsubscribe = null;
        isSubscribed = false;
        cachedPosts = [];
      }
    };
  }, []);

  return { posts, loading };
}
