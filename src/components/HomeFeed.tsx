import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePost } from "../hooks/PostContext";
import { createPortal } from 'react-dom';
import { Plus, MessageCircle, ArrowUp, RefreshCw, Share2, MapPin, CheckCircle2, ShieldAlert, Clock, MoreHorizontal, Users, CheckCircle, ThumbsUp, ThumbsDown, X, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import { triggerHaptic } from '../utils/haptics';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { api } from '../api';
import { ReportModal } from './ReportModal';
import { ShareModal } from './ShareModal';
import { useNetwork } from '../hooks/NetworkContext';
import { CATEGORIES, CATEGORY_LIST } from '../categories';
import { useGlobalFeed } from '../hooks/useGlobalFeed';
import { LazyImage } from './LazyImage';
import { CustomSelect } from './CustomSelect';
import { usePublicProfile } from '../hooks/ProfileContext';

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

const PostGallery = ({ post, isResolved }: { post: any, isResolved: boolean }) => {
  const images = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : post.imageUrl ? [post.imageUrl] : [];

  if (images.length === 0) return null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const width = scrollRef.current.offsetWidth;
    // We snap to w-[88%] roughly, plus gap
    const itemWidth = width * 0.88;
    const index = Math.round(scrollLeft / itemWidth);
    if (index !== currentIndex && index >= 0 && index < images.length) {
      setCurrentIndex(index);
    }
  };

  const TrustBadge = () => (
    <div className="bg-white px-2.5 py-1 rounded-full text-[10px] font-bold text-[#2a2a5a] flex items-center gap-1 shadow-sm border border-gray-100 tracking-widest pointer-events-none">
      <ShieldAlert size={12} className="stroke-[2.5]" />
      <span>TRUST: {((post.confirms || 0) + (post.falses || 0)) > 0 ? Math.round(((post.confirms || 0) / ((post.confirms || 0) + (post.falses || 0))) * 100) : 0}%</span>
    </div>
  );

  if (images.length === 1) {
    return (
      <div className="relative w-full bg-slate-100 dark:bg-slate-950 aspect-[4/3] sm:aspect-video sm:rounded-lg overflow-hidden">
        <LazyImage src={images[0]} alt={post.title} className="w-full h-full object-cover" />
        {isResolved && (
          <div className="absolute inset-0 bg-emerald-900/10 flex items-center justify-center pointer-events-none">
            <div className="bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transform rotate-[-5deg] border-2 border-white dark:border-emerald-900">
              <CheckCircle2 size={20} /> Resolved
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full pt-1 pb-1">
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-2 w-full px-4"
      >
        {images.map((url: string, idx: number) => (
          <div 
            key={idx} 
            className="relative shrink-0 w-[88%] sm:w-[75%] aspect-[4/3] sm:aspect-video snap-center overflow-hidden bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50"
          >
            <LazyImage src={url} alt={`${post.title} - ${idx + 1}`} className="w-full h-full object-cover" />
            
            {isResolved && (
              <div className="absolute inset-0 bg-emerald-900/10 flex items-center justify-center pointer-events-none">
                <div className="bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transform rotate-[-5deg] border-2 border-white dark:border-emerald-900">
                  <CheckCircle2 size={20} /> Resolved
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Sticky Overlays (Counter) */}
      <div className="absolute top-4 right-7 flex flex-col items-end gap-2 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-bold text-white tracking-widest shadow-sm">
          {currentIndex + 1}/{images.length}
        </div>
      </div>
    </div>
  );
}

export function HomeFeed() {
  const { openPost } = usePost();
  const { openUserProfile } = usePublicProfile();
  const { toast } = useToast();
  const { posts, loading } = useGlobalFeed();
  const [displayLimit, setDisplayLimit] = useState(15);
  
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [userLocationName, setUserLocationName] = useState('Locating...');

  const [userId, setUserId] = useState<string>('');

  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedMode, setFeedMode] = useState<'latest' | 'nearby' | 'trending'>('latest');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [error, setError] = useState<string | null>(null);
  const [optionsPostId, setOptionsPostId] = useState<string | null>(null);
  const [descriptionPostId, setDescriptionPostId] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState<any>(null);
  const { runWithNetwork } = useNetwork();
  
  const NEARBY_RADIUS_METERS = 10000; // 10km

  const fetchPosts = () => {
    if (isRefreshing) {
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 500);
    }
  };

  useEffect(() => {
    let localUid = localStorage.getItem('local_user_id');
    if (!localUid) {
      localUid = `u_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('local_user_id', localUid);
    }
    setUserId(localUid);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(localUid as string);
      }
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          try {
            const locationName = await api.getLocationName(pos.coords.latitude, pos.coords.longitude);
            setUserLocationName(locationName);
          } catch (e) {
            setUserLocationName('Your Location');
          }
        },
        (err) => {
          console.warn('Geolocation blocked or failed', err);
          setUserLocationName('Location Disabled');
        }
      );
    } else {
      setUserLocationName('Location Unavailable');
    }

    const handleOpenReportModal = () => setIsReportModalOpen(true);
    window.addEventListener('openReportModal', handleOpenReportModal);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('openReportModal', handleOpenReportModal);
    };
  }, []);

  const processedPosts = useMemo(() => {
    let result = [...posts];

    if (selectedCategory !== 'All') {
      result = result.filter(post => post.category === selectedCategory);
    }

    if (feedMode === 'nearby' && userLat !== null && userLng !== null) {
      result = result.filter(post => {
        if (!post.lat || !post.lng) return false;
        const dist = getDistance(userLat, userLng, post.lat, post.lng);
        return dist <= NEARBY_RADIUS_METERS;
      });
    }

    const getTimeMs = (t: any): number => {
      if (!t) return 0;
      if (typeof t.toMillis === 'function') return t.toMillis();
      if (typeof t.seconds === 'number') return t.seconds * 1000;
      const parsed = new Date(t).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    if (feedMode === 'latest') {
      result.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
    } else if (feedMode === 'trending') {
      const weight = 86400000;
      result.sort((a, b) => {
        const timeA = getTimeMs(a.createdAt) || Date.now();
        const timeB = getTimeMs(b.createdAt) || Date.now();
        const scoreA = ((a.confirms || 0) + (a.upvotes || 0)) * weight - (Date.now() - timeA);
        const scoreB = ((b.confirms || 0) + (b.upvotes || 0)) * weight - (Date.now() - timeB);
        return scoreB - scoreA;
      });
    }

    return result;
  }, [posts, feedMode, selectedCategory, userLat, userLng]);

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

  const handleAddReport = async (reportData: any) => {
    runWithNetwork(async () => {
      try {
        await api.createPost(reportData, userId);
        toast('Report submitted successfully!', 'success');
      } catch (e: any) {
        console.error('Failed to create report', e);
        toast(e.message || 'Failed to create report. Please try again.', 'error');
      }
    });
  };

  const handleShare = (id: string) => {
    const matched = posts.find(p => p.id === id);
    setSharePost(matched || { id });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollContainer = (e.currentTarget as HTMLElement).closest('main');
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : window.scrollY;

    if (scrollTop <= 0) {
      setPullStartY(e.touches[0].clientY);
    } else {
      setPullStartY(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY === 0 || isRefreshing) return;
    
    const y = e.touches[0].clientY;
    const distance = y - pullStartY;
    
    if (distance > 0) {
      const dampened = Math.min(distance * 0.4, 80);
      setPullDistance(dampened);
    }
  };

  const handleTouchEnd = () => {
    if (pullStartY === 0) return;
    
    if (pullDistance > 60) {
      setPullDistance(60); 
      fetchPosts();
    } else {
      setPullDistance(0);
    }
    setPullStartY(0);
  };

  const getStatusColor = (status: string) => {
    if (status === 'Solved' || status === 'Resolved' || status === 'Complete') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400';
    if (status === 'In Progress' || status === 'Under Review') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Solved' || status === 'Resolved' || status === 'Complete') return <CheckCircle2 size={12} className="mr-1" />;
    if (status === 'In Progress' || status === 'Under Review') return <Clock size={12} className="mr-1" />;
    return <ShieldAlert size={12} className="mr-1" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-24 md:pb-4 max-w-2xl mx-auto w-full relative z-10 pt-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border-b sm:border border-slate-200 dark:border-slate-800 sm:rounded-xl p-4 shadow-sm animate-pulse">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex flex-col gap-2">
                  <div className="w-32 h-3 bg-slate-200 dark:bg-slate-800 rounded-full" />
                  <div className="w-24 h-2 bg-slate-200 dark:bg-slate-800 rounded-full" />
                </div>
              </div>
            </div>
            <div className="w-3/4 h-5 bg-slate-200 dark:bg-slate-800 rounded-lg mb-4" />
            <div className="w-full h-48 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4" />
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex gap-3">
                <div className="w-20 h-8 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                <div className="w-20 h-8 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-12">
        <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Error Loading Feed</h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-medium hover:opacity-90">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-full bg-slate-50 dark:bg-slate-950 font-sans"
      style={{ 
        transform: `translateY(${pullDistance}px)`,
        transition: pullStartY > 0 || isRefreshing ? 'none' : 'transform 0.2s ease-out' 
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div 
        className="absolute left-0 right-0 flex justify-center items-center pointer-events-none"
        style={{ top: -60, height: 60 }}
      >
        <div 
          className="flex justify-center items-center h-10 w-10 bg-white dark:bg-slate-800 rounded-full shadow-md border border-slate-100 dark:border-slate-700 transition-shadow"
          style={{
            opacity: isRefreshing ? 1 : Math.max(0, (pullDistance - 10) / 50),
            transform: isRefreshing ? 'scale(1)' : `scale(${Math.min(Math.max(0, pullDistance - 10) / 50, 1)})`,
            boxShadow: pullDistance > 60 || isRefreshing ? '0 10px 15px -3px rgba(99, 102, 241, 0.2), 0 4px 6px -4px rgba(99, 102, 241, 0.2)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'
          }}
        >
          <RefreshCw 
            className={`h-5 w-5 ${pullDistance > 60 || isRefreshing ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'} ${isRefreshing ? 'animate-spin' : ''}`} 
            style={{ 
              transform: isRefreshing ? 'none' : `rotate(${pullDistance * 4}deg)` 
            }} 
          />
        </div>
      </div>

      {/* Header Section */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 py-2 px-3 sm:px-4 md:px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {/* Compact Category Filter */}
          <CustomSelect
            label="Filter by Category"
            compact
            align="left"
            icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={[
              { label: 'All Categories', shortLabel: 'All', value: 'All' },
              ...CATEGORY_LIST.map(cat => ({
                label: cat.fullName,
                shortLabel: cat.shortName === 'Street Issues' ? 'Streets' : cat.shortName === 'Infrastructure' ? 'Infra' : cat.shortName,
                value: cat.id
              }))
            ]}
            className="shrink-0 max-w-[110px]"
            triggerClassName={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              selectedCategory !== 'All'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/70'
            }`}
          />

          {/* Segmented Sort Control */}
          <div className="flex flex-1 min-w-0 items-center bg-slate-100 dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
            {[
              { id: 'latest', label: 'Latest', icon: Clock },
              { id: 'trending', label: 'Trending', icon: ArrowUp },
              { id: 'nearby', label: 'Nearby', icon: MapPin },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = feedMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFeedMode(tab.id as any)}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon size={13} className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-3 sm:space-y-4 p-2 sm:p-4 pb-24">
        {(() => {
          if (processedPosts.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center mt-4">
                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-5">
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">All clear here!</h3>
                <p className="text-base text-slate-500 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">We couldn't find any issues matching your current filter in this area.</p>
                <button 
                  onClick={() => setFeedMode('latest')}
                  className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  View Latest Reports
                </button>
              </div>
            );
          }

          return processedPosts.slice(0, displayLimit).map((post, index) => {
            const isResolved = post.status === 'Solved' || post.status === 'Resolved' || post.status === 'Complete';
            const locationParts = (post.address || '').split(',');
            const locationStr = locationParts.length > 2 
                ? `${locationParts[0].trim()}, ${locationParts[locationParts.length - 3].trim()}` 
                : locationParts.slice(0, 2).join(', ');
            
            const distToPost = (userLat !== null && userLng !== null && post.lat && post.lng) 
              ? getDistance(userLat, userLng, post.lat, post.lng) 
              : Infinity;
            const canVerify = distToPost <= 500;
            
            return (
              <motion.article 
                key={post.id} 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index, 10) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white dark:bg-slate-900 border-b sm:border border-slate-200 dark:border-slate-800 sm:rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col cursor-pointer" 
                onClick={() => openPost(post.id)}
              >
                {/* Post Header */}
                <div className="p-4 flex items-start gap-3">
                  {!post.isAnonymous ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (post.authorId) openUserProfile(post.authorId);
                      }}
                      className="shrink-0 group/author focus:outline-none"
                      title={`View ${post.author}'s profile`}
                    >
                      <img 
                        src={post.authorAvatar} 
                        alt={post.author} 
                        className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 object-cover border border-slate-200 dark:border-slate-700 transition-transform group-hover/author:scale-105" 
                        onError={(e) => { e.currentTarget.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + post.authorId; e.currentTarget.onerror = null; }} 
                      />
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                      <Users size={18} className="text-slate-400" />
                    </div>
                  )}
                  
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      {!post.isAnonymous && post.authorId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openUserProfile(post.authorId!);
                          }}
                          className="flex flex-col items-start min-w-0 text-left hover:underline focus:outline-none group/name"
                        >
                          <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-full leading-tight group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 transition-colors">
                            {post.author}
                          </span>
                          {post.authorHandle && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-full leading-tight">
                              @{post.authorHandle.replace(/^@/, '')}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          Anonymous Citizen
                        </span>
                      )}
                      {post.authorId === userId && post.status !== 'Solved' && post.status !== 'Complete' && (
                        <div className="relative">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOptionsPostId(optionsPostId === post.id ? null : post.id); }}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 p-1 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          
                          {optionsPostId === post.id && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                              <button
                                onClick={(e) => { e.stopPropagation(); setOptionsPostId(null); openPost(post.id, 'edit'); }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                Edit Report
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setOptionsPostId(null); openPost(post.id, 'update_status'); }}
                                className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                Update Status
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setOptionsPostId(null); openPost(post.id, 'withdraw'); }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                              >
                                Withdraw
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-medium truncate flex items-center gap-1">
                      <span className="shrink-0">{(post as any).formattedDate}</span>
                      <span className="opacity-50">•</span>
                      <span className="shrink-0">{(post as any).timeAgo}</span>
                    </div>
                  </div>
                </div>

                {/* Post Body */}
                <div className="px-4 pb-3 pt-1">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 leading-snug break-words">
                    <a 
                      href={`/report/${post.id}`} 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        openPost(post.id); 
                      }}
                      className="hover:underline focus:outline-none"
                    >
                      {post.title}
                    </a>
                  </h3>
                  <div className="flex items-center text-[13px] text-slate-700 dark:text-slate-300 mb-2 w-full min-w-0">
                    <span className="truncate flex-1 min-w-0">{post.content}</span>
                    {post.content.length > 50 && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDescriptionPostId(post.id); }}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition-colors shrink-0 ml-1.5"
                      >
                        View
                      </button>
                    )}
                  </div>
                  {post.address && (
                    <a 
                      href={post.lat && post.lng ? `https://www.google.com/maps/search/?api=1&query=${post.lat},${post.lng}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1 text-[11px] leading-tight text-blue-600 dark:text-blue-400 font-medium hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!post.lat || !post.lng) e.preventDefault();
                      }}
                      title="View on Map"
                    >
                      <MapPin size={12} className="shrink-0 mt-0.5" /> 
                      <span className="line-clamp-2">{post.address}</span>
                    </a>
                  )}
                </div>

                {/* Media */}
                <PostGallery post={post} isResolved={isResolved} />

                {/* Post Footer & Interactions */}
                <div className="px-4 pt-1.5 pb-2 flex flex-col gap-1.5">
                  {/* Status Indicator */}
                  <div className="flex items-center justify-between">
                    <div className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] uppercase tracking-wide font-bold border ${getStatusColor(post.status || 'Pending')}`}>
                      {getStatusIcon(post.status || 'Pending')}
                      {post.status || 'Pending'}
                    </div>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {CATEGORIES[post.category]?.shortName || post.category}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
                    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        disabled={!canVerify}
                        onClick={(e) => { e.stopPropagation(); triggerHaptic(); handleAction(post.id, 'confirm'); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors shrink-0 ${canVerify ? (post.confirmUsers?.includes(userId) ? 'text-white bg-emerald-600 dark:bg-emerald-500 shadow-sm' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40') : 'text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed'}`}
                        title={canVerify ? (post.confirmUsers?.includes(userId) ? 'Confirmed (click to remove)' : 'Confirm Issue') : 'You must be within 500m to verify'}
                      >
                        <ThumbsUp size={14} className={canVerify ? 'stroke-[2.5]' : ''} /> 
                        <span>{post.confirms || 0}</span>
                      </motion.button>
                      
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        disabled={!canVerify}
                        onClick={(e) => { e.stopPropagation(); triggerHaptic(); handleAction(post.id, 'false'); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors shrink-0 ${canVerify ? (post.falseUsers?.includes(userId) ? 'text-white bg-rose-600 dark:bg-rose-500 shadow-sm' : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40') : 'text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed'}`}
                        title={canVerify ? (post.falseUsers?.includes(userId) ? 'Marked False (click to remove)' : 'Mark as False') : 'You must be within 500m to verify'}
                      >
                        <ThumbsDown size={14} className={canVerify ? 'stroke-[2.5]' : ''} /> 
                        <span>{post.falses || 0}</span>
                      </motion.button>
                      
                      <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0"></div>

                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); triggerHaptic(); handleAction(post.id, 'upvote'); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors shrink-0 ${post.upvoteUsers?.includes(userId) ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        <ArrowUp size={14} className={post.upvoteUsers?.includes(userId) ? 'stroke-[2.5]' : ''} /> 
                        <span>{post.upvoteCount || post.upvotes || 0}</span>
                      </motion.button>
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors pointer-events-none">
                        <MessageCircle size={14} />
                        <span>{post.commentCount || post.comments?.length || 0}</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleShare(post.id); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Share2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

              </motion.article>
            );
          });
        })()}
      </div>
      
      {createPortal(
        <>
          <ReportModal 
            isOpen={isReportModalOpen} 
            onClose={() => setIsReportModalOpen(false)} 
            onSubmitReport={handleAddReport} 
            posts={posts}
            onAction={handleAction}
            userId={userId}
          />
          <AnimatePresence>
            {sharePost && (
              <ShareModal
                isOpen={!!sharePost}
                onClose={() => setSharePost(null)}
                postId={sharePost.id}
                post={sharePost}
              />
            )}
          </AnimatePresence>
        </>,
        document.body
      )}

      {/* Description Bottom Sheet */}
      <AnimatePresence>
        {descriptionPostId && (
          <div className="relative z-[150]">
            {(() => {
              const dPost = posts.find((p) => p.id === descriptionPostId);
              if (!dPost) return null;
              return (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={() => setDescriptionPostId(null)}
                  />
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] mx-auto max-w-2xl"
                  >
                    <div className="shrink-0 p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate pr-4">
                        {dPost.title}
                      </h3>
                      <button onClick={() => setDescriptionPostId(null)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 pb-8">
                      <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">
                        {(dPost as any).formattedDateTime || `${(dPost as any).formattedDate} • ${dPost.timeAgo}`}
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed text-[15px]">
                        {dPost.content}
                      </div>
                    </div>
                  </motion.div>
                </>
              );
            })()}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
