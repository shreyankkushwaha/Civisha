import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth, checkIsAdminUser } from '../firebase';
import { X, MapPin, ArrowUp, Share2, ShieldAlert, Edit2, Trash2, MoreVertical, Activity, Camera, CheckCircle2, ChevronRight, Loader2, MessageSquare, MessageCircle, ImagePlus, ArrowLeft, AlertTriangle, RotateCcw } from 'lucide-react';
import { api, resolveFirestoreMediaUrl } from '../api';
import { useNetwork } from '../hooks/NetworkContext';
import { ReportPost, Comment, ResolutionAIVerification } from '../types';
import { CommentSection } from './CommentSection';
import { CATEGORIES, CATEGORY_LIST } from '../categories';
import { motion, AnimatePresence } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';
import { useToast } from './Toast';
import { usePublicProfile } from '../hooks/ProfileContext';
import { updatePageSEO } from '../utils/seo';

interface PostDetailModalProps {
  posts: ReportPost[];
  initialPostId: string;
  initialMode?: 'view' | 'edit' | 'update_status' | 'withdraw';
  isOpen: boolean;
  onClose: () => void;
  onAction: (id: string, action: 'confirm' | 'false' | 'upvote') => void;
  onAddComment: (postId: string, text: string, parentId?: string) => void;
  userId: string;
  canVerify: boolean;
  onShare: (id: string) => void;
}

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

const compressImage = (file: File, maxWidth: number = 1024, quality: number = 0.7): Promise<string> => {
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

const uploadImage = async (base64Data: string) => {
  if (!base64Data.startsWith('data:')) return base64Data;
  return await api.uploadImage(base64Data, `proof_${Date.now()}.jpg`);
};

const PostDetailItem: React.FC<{ post: ReportPost, isActive: boolean, onClose: () => void, onAction: any, onAddComment: any, userId: string, canVerify: boolean, onShare: any, initialMode?: 'view' | 'edit' | 'update_status' | 'withdraw' }> = ({ post, isActive, onClose, onAction, onAddComment, userId, canVerify, onShare, initialMode = 'view' }) => {
  const { toast } = useToast();
  const { openUserProfile } = usePublicProfile();
  const [liveComments, setLiveComments] = useState<Comment[]>([]);
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [editTitle, setEditTitle] = useState(post.title);
  const [editDescription, setEditDescription] = useState(post.content);
  const [editCategory, setEditCategory] = useState<any>(post.category);
  const [showOptions, setShowOptions] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(initialMode === 'withdraw');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  
  const [updatingStatus, setUpdatingStatus] = useState(initialMode === 'update_status');
  const [newStatus, setNewStatus] = useState<'In Progress' | 'Complete' | null>(null);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isVerifyingProof, setIsVerifyingProof] = useState(false);
  const [proofVerification, setProofVerification] = useState<ResolutionAIVerification | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resolvedBeforePhoto, setResolvedBeforePhoto] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showCommentsSheet, setShowCommentsSheet] = useState(false);
  const [showDescriptionSheet, setShowDescriptionSheet] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  
  const [allowDeviceUploads, setAllowDeviceUploads] = useState(false);

  const originalBeforeUrl = post.imageUrls?.[0] || post.imageUrl || '';

  useEffect(() => {
    let cancelled = false;
    if (!updatingStatus || !originalBeforeUrl) return;
    if (originalBeforeUrl.startsWith('/api/media/firestore/')) {
      resolveFirestoreMediaUrl(originalBeforeUrl).then((dataUrl) => {
        if (!cancelled) setResolvedBeforePhoto(dataUrl || originalBeforeUrl);
      });
    } else {
      setResolvedBeforePhoto(originalBeforeUrl);
    }
    return () => {
      cancelled = true;
    };
  }, [updatingStatus, originalBeforeUrl]);

  const runBeforeAfterCheck = async (afterBase64: string, targetStatus: 'In Progress' | 'Complete') => {
    if (!originalBeforeUrl) return;
    setIsVerifyingProof(true);
    setVerifyError(null);
    try {
      const result = await api.verifyResolutionWithAI({
        beforeImageUrl: originalBeforeUrl,
        beforeImageBase64: resolvedBeforePhoto?.startsWith('data:') ? resolvedBeforePhoto : undefined,
        afterImageBase64: afterBase64,
        title: post.title,
        category: post.category,
        description: post.content,
        address: post.address,
        proposedStatus: targetStatus,
      });
      setProofVerification(result);
    } catch (err: any) {
      setProofVerification(null);
      setVerifyError(err?.message || 'AI comparison could not complete. You can retry or submit for admin review.');
    } finally {
      setIsVerifyingProof(false);
    }
  };

  useEffect(() => {
    if (updatingStatus && proofPhoto && newStatus && originalBeforeUrl) {
      runBeforeAfterCheck(proofPhoto, newStatus);
    } else {
      setProofVerification(null);
      setVerifyError(null);
    }
  }, [updatingStatus, proofPhoto, newStatus]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'app_settings', 'global'));
        if (docSnap.exists()) {
          setAllowDeviceUploads(docSnap.data().allowDeviceUploads || false);
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    if (isActive) {
      fetchSettings();
      const locLabel = post.address || 'Local Area';
      const categoryLabel = CATEGORIES[post.category as keyof typeof CATEGORIES]?.fullName || post.category || 'Civic Issue';
      const statusLabel = post.status || 'Pending';
      const seoTitle = `${post.title} – ${categoryLabel} in ${locLabel} (${statusLabel}) | Civisha`;
      const seoDesc = `${statusLabel} ${categoryLabel} report at ${locLabel}: ${post.content || post.title} (${post.confirmations || 0} citizen verifications on Civisha).`;
      updatePageSEO({
        title: seoTitle,
        description: seoDesc,
        canonicalPath: `/report/${post.id}`,
        imageUrl: post.imageUrl || '/og-fallback.png',
        type: 'article',
        keywords: [
          post.title,
          categoryLabel,
          locLabel,
          `${locLabel} civic issue`,
          `${categoryLabel} complaint`,
          statusLabel,
          'Civisha',
        ],
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: seoDesc,
          articleSection: categoryLabel,
          image: post.imageUrl ? [post.imageUrl] : [`${window.location.origin}/og-fallback.png`],
          author: {
            '@type': 'Person',
            name: post.isAnonymous ? 'Anonymous Citizen' : (post.author || 'Citizen Reporter'),
          },
          contentLocation: {
            '@type': 'Place',
            name: locLabel,
            address: locLabel,
            ...(post.lat && post.lng
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: post.lat,
                    longitude: post.lng,
                  },
                }
              : {}),
          },
          interactionStatistic: [
            {
              '@type': 'InteractionCounter',
              interactionType: 'https://schema.org/AgreeAction',
              userInteractionCount: post.confirmations || 0,
            },
            {
              '@type': 'InteractionCounter',
              interactionType: 'https://schema.org/LikeAction',
              userInteractionCount: post.upvotes || 0,
            },
          ],
        },
      });
    }
  }, [isActive, post]);

  const { runWithNetwork } = useNetwork();
  
  useEffect(() => {
    // Only subscribe to comments if we are near active to save network
    if (!isActive) return;
    
    const commentsRef = collection(db, `reports/${post.id}/comments`);
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetched: Comment[] = [];
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        const daysDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        let timeAgo = rtf.format(daysDifference, 'day');
        if (daysDifference === 0) {
          const hoursDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60 * 60));
          if (hoursDifference === 0) {
            const minutesDifference = Math.round((date.getTime() - new Date().getTime()) / (1000 * 60));
            timeAgo = rtf.format(minutesDifference, 'minute');
          } else {
            timeAgo = rtf.format(hoursDifference, 'hour');
          }
        }
        
        fetched.push({
          id: doc.id,
          authorId: data.authorId || '',
          author: data.author || 'Anonymous',
          authorAvatar: data.authorAvatar || '',
          authorHandle: data.authorHandle || '',
          text: data.text,
          timeAgo,
          parentId: data.parentId || null,
          replies: []
        } as unknown as Comment);
      });

      try {
        const authorIds = fetched.filter(c => c.authorId).map(c => c.authorId!);
        if (authorIds.length > 0) {
          const profileMap = await api.resolveAuthorProfiles(authorIds);
          fetched.forEach(c => {
            if (c.authorId && profileMap.has(c.authorId)) {
              const prof = profileMap.get(c.authorId)!;
              c.author = prof.displayName || c.author;
              c.authorAvatar = prof.photoURL || c.authorAvatar;
              c.authorHandle = prof.handle || c.authorHandle;
            }
          });
        }
      } catch (_) {
        // non-fatal
      }
      
      const commentMap = new Map<string, Comment>();
      const roots: Comment[] = [];
      
      fetched.forEach(c => commentMap.set(c.id, { ...c, replies: [] }));
      
      fetched.forEach(c => {
        if (c.parentId && commentMap.has(c.parentId)) {
          const parent = commentMap.get(c.parentId)!;
          if (!parent.replies) parent.replies = [];
          parent.replies.push(commentMap.get(c.id)!);
        } else {
          roots.push(commentMap.get(c.id)!);
        }
      });
      
      setLiveComments(roots);
    });
    
    return () => unsubscribe();
  }, [isActive, post.id]);

  const localUid = localStorage.getItem('local_user_id');
  const isOwner = Boolean(post.authorId === userId || post.authorId === `Guest_${localUid}` || checkIsAdminUser(auth.currentUser));
  const canEdit = isOwner && post.status !== 'Solved' && post.status !== 'Complete';

  const handleConfirmWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await api.deletePost(post.id, post.imageUrl, post.imageUrls);
      setShowWithdrawConfirm(false);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast(e.message || 'Failed to withdraw report.', 'error');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusError('');
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBase64 = await compressImage(file, 1024, 0.7);
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const dist = getDistance(position.coords.latitude, position.coords.longitude, post.lat, post.lng);
              if (dist <= 50) {
                setProofPhoto(compressedBase64);
              } else {
                setStatusError(`You must be within 50 meters of the report location to update status. You are currently ${Math.round(dist)}m away.`);
              }
            },
            (error) => {
              setStatusError('Failed to get your location. Please enable location services to upload proof.');
            },
            { enableHighAccuracy: true }
          );
        } else {
          setStatusError('Geolocation is not supported by your browser.');
        }
      } catch (err) {
        setStatusError("Failed to process photo.");
      }
    }
  };

  const handleSaveStatus = async () => {
    if (!newStatus || !proofPhoto) {
      setStatusError('Please select a status and upload a proof photo.');
      return;
    }
    if (isVerifyingProof) return;
    setIsUpdating(true);
    setStatusError('');
    try {
      const uploadedUrl = await uploadImage(proofPhoto);
      const isFlagged = Boolean(proofVerification?.shouldFlagForAdmin);
      const finalStatus: ReportPost['status'] =
        isFlagged && newStatus === 'Complete' ? 'Under Review' : newStatus;

      const statusEntry: any = {
        status: finalStatus,
        imageUrl: uploadedUrl,
        timestamp: new Date().toISOString(),
      };
      if (proofVerification) {
        statusEntry.aiVerification = proofVerification;
      }

      const updateData: Partial<ReportPost> = {
        status: finalStatus,
        statusUpdates: [...(post.statusUpdates || []), statusEntry],
        needsAdminReview: isFlagged,
        aiReviewNote: isFlagged ? (proofVerification?.adminReason || 'Flagged by AI before-vs-after check.').slice(0, 500) : '',
      };
      await api.updatePost(post.id, updateData);
      toast(
        isFlagged
          ? 'Proof submitted and flagged for Admin Review.'
          : `Report status updated to ${finalStatus}.`,
        isFlagged ? 'info' : 'success'
      );
      setUpdatingStatus(false);
      setNewStatus(null);
      setProofPhoto(null);
      setProofVerification(null);
      setVerifyError(null);
      setCurrentPhotoIndex((post.statusUpdates?.length || 0) + 1);
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEdit = async () => {
    runWithNetwork(async () => {
      setIsSavingEdit(true);
      try {
        await api.updatePost(post.id, {
          title: editTitle,
          content: editDescription,
          category: editCategory
        });
        setIsEditing(false);
      } catch (e: any) {
        toast(e.message || 'Failed to update report.', 'error');
      } finally {
        setIsSavingEdit(false);
      }
    });
  };

  return (
    <div className={`w-full h-full flex flex-col snap-start shrink-0 relative overflow-hidden ${isEditing || updatingStatus ? 'bg-white dark:bg-gray-900' : 'bg-black text-white'}`}>
      
      {/* Header for Edit Modes */}
      {(isEditing || updatingStatus) && (
        <div className="absolute top-0 left-0 right-0 z-[50] flex h-14 shrink-0 items-center justify-between px-2 sm:px-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <button onClick={() => { setIsEditing(false); setUpdatingStatus(false); }} className="p-2 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1">
            <ArrowLeft size={24} />
          </button>
          <span className="text-sm font-bold text-gray-900 dark:text-white px-2">
            {isEditing ? 'Edit Report' : 'Update Status'}
          </span>
        </div>
      )}

      {/* Main Content Scroll */}
      <div className={`flex-1 overflow-y-auto w-full ${isEditing || updatingStatus ? 'pb-24 pt-14' : 'h-full'}`}>
        {isEditing ? (
          <div className="p-4 space-y-4 pt-16">
            <div>
              <label className="block text-sm font-bold mb-2 dark:text-white">Category</label>
              <div className="flex flex-col gap-2">
                {CATEGORY_LIST.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setEditCategory(cat.id)}
                    className={`text-left px-4 py-2 rounded-xl border transition-all ${editCategory === cat.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 dark:border-indigo-500 ring-1 ring-indigo-600 dark:ring-indigo-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <div className={`font-bold ${editCategory === cat.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-900 dark:text-gray-100'}`}>{cat.fullName}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2 dark:text-white">Issue Title</label>
              <input value={editTitle} maxLength={100} onChange={e => setEditTitle(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 focus:outline-none focus:border-indigo-500 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2 dark:text-white">Description</label>
              <textarea value={editDescription} maxLength={2000} onChange={e => setEditDescription(e.target.value)} rows={4} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 focus:outline-none focus:border-indigo-500 dark:text-white" />
            </div>
            <div className="flex gap-3 pt-4">
              <button disabled={isSavingEdit} onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                Cancel
              </button>
              <button disabled={isSavingEdit || !editTitle || !editCategory} onClick={handleSaveEdit} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center">
                {isSavingEdit ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : updatingStatus ? (
          <div className="p-4 space-y-4 pt-16">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Update Report Status</h3>
            
            <div>
              <label className="block text-sm font-bold mb-2 dark:text-white">New Status</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewStatus('In Progress')}
                  className={`flex-1 py-2 px-3 rounded-lg border font-medium transition-colors ${newStatus === 'In Progress' ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' : 'bg-white text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => setNewStatus('Complete')}
                  className={`flex-1 py-2 px-3 rounded-lg border font-medium transition-colors ${newStatus === 'Complete' ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700' : 'bg-white text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}
                >
                  Complete
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2 dark:text-white">Proof Photo (Required)</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">You must be within 50m of the report location to upload proof.</p>
              
              {!proofPhoto ? (
                <div className="flex gap-4 w-full aspect-video">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <Camera className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Open Camera</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                  </label>

                  {allowDeviceUploads && (
                    <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex flex-col items-center justify-center p-4 text-center">
                        <ImagePlus className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">From Gallery</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoCapture} />
                    </label>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Before vs After visual comparison thumbnails */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <div className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                        Before · Original
                      </div>
                      <div className="aspect-video bg-black/10">
                        {resolvedBeforePhoto ? (
                          <img src={resolvedBeforePhoto} alt="Before original issue" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No photo</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 relative">
                      <div className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <span>After · Proof</span>
                        <button
                          type="button"
                          onClick={() => { setProofPhoto(null); setProofVerification(null); setVerifyError(null); }}
                          aria-label="Remove proof photo"
                          className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="aspect-video bg-black/10 relative">
                        <img src={proofPhoto} alt="After resolution proof" className="w-full h-full object-cover" />
                        <div className="absolute bottom-1.5 left-1.5 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 size={11} /> 50m GPS
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Before-vs-After AI Verification Feedback */}
                  {!newStatus && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3 text-xs text-gray-600 dark:text-gray-300">
                      Select <strong>In Progress</strong> or <strong>Complete</strong> above to verify your Before vs. After photos with AI.
                    </div>
                  )}

                  {isVerifyingProof && (
                    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/70 dark:bg-indigo-900/20 p-3.5 flex items-center gap-3 text-sm text-indigo-800 dark:text-indigo-200">
                      <Loader2 size={18} className="animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div>
                        <p className="font-semibold text-xs">Comparing Before &amp; After photos...</p>
                        <p className="text-xs opacity-80">AI is checking whether the reported issue appears resolved.</p>
                      </div>
                    </div>
                  )}

                  {!isVerifyingProof && verifyError && (
                    <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 p-3.5 space-y-2">
                      <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 font-medium">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <span>{verifyError}</span>
                      </div>
                      {newStatus && (
                        <button
                          type="button"
                          onClick={() => runBeforeAfterCheck(proofPhoto, newStatus)}
                          className="min-h-[36px] px-3 py-1.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                        >
                          <RotateCcw size={13} /> Retry AI Check
                        </button>
                      )}
                    </div>
                  )}

                  {!isVerifyingProof && proofVerification && !proofVerification.shouldFlagForAdmin && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 p-3.5 space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span>AI Verified Before vs. After</span>
                      </div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-200 leading-relaxed">
                        {proofVerification.userMessage}
                      </p>
                    </div>
                  )}

                  {!isVerifyingProof && proofVerification && proofVerification.shouldFlagForAdmin && (
                    <div className="rounded-xl border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-900/20 p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                            Issue Detected · Will Be Flagged for Admin Review
                          </p>
                          <p className="text-xs text-amber-800 dark:text-amber-200/90 leading-relaxed">
                            {proofVerification.userMessage}
                          </p>
                          <p className="text-[11px] text-amber-700 dark:text-amber-300/80">
                            You can retake a clearer photo showing the resolved spot, or submit now for an Admin to review manually.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setProofPhoto(null); setProofVerification(null); setVerifyError(null); }}
                        className="min-h-[40px] px-3.5 py-2 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold rounded-lg inline-flex items-center gap-1.5 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 transition-colors"
                      >
                        <Camera size={14} /> Retake Proof Photo
                      </button>
                    </div>
                  )}
                </div>
              )}
              {statusError && <p className="text-red-500 text-sm mt-2 font-medium">{statusError}</p>}
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={() => { setUpdatingStatus(false); setStatusError(''); setProofPhoto(null); setProofVerification(null); setVerifyError(null); }} className="flex-1 min-h-[44px] py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl active:scale-95 transition-transform" disabled={isUpdating}>
                Cancel
              </button>
              <button onClick={handleSaveStatus} disabled={isUpdating || isVerifyingProof || !newStatus || !proofPhoto} className={`flex-1 min-h-[44px] py-3 text-white font-bold rounded-xl shadow active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${proofVerification?.shouldFlagForAdmin ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {isUpdating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : proofVerification?.shouldFlagForAdmin ? (
                  'Submit for Admin Review'
                ) : (
                  'Update Status'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative">
            {/* Header Back Button */}
            <div className={`absolute top-0 left-0 right-0 z-[50] flex h-16 shrink-0 items-center px-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0'}`}>
              <button onClick={onClose} className={`p-2 -ml-2 text-white rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm drop-shadow-md ${uiVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                <ArrowLeft size={28} />
              </button>
            </div>

            {/* Media Carousel - Full Height */}
            {(() => {
              const basePhotos = post.imageUrls && post.imageUrls.length > 0 
                ? post.imageUrls.map((url, i) => ({ url, label: post.imageUrls && post.imageUrls.length > 1 ? `Original Report ${i + 1}` : 'Original Report' }))
                : [{ url: post.imageUrl, label: 'Original Report' }];
                
              const allPhotos = [
                ...basePhotos,
                ...(post.statusUpdates || []).map(su => {
                  const aiTag = su.aiVerification
                    ? (su.aiVerification.shouldFlagForAdmin ? ' · Pending Admin Review' : ' · AI Verified')
                    : '';
                  return { url: su.imageUrl, label: `${su.status} Proof${aiTag}`, date: su.timestamp };
                })
              ].filter(p => p.url);
              
              if (allPhotos.length === 0) return null;

              return (
                <div className="absolute inset-0 z-0">
                  <div 
                    className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide [&::-webkit-scrollbar]:hidden"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const index = Math.round(el.scrollLeft / el.clientWidth);
                      if (index !== currentPhotoIndex && index >= 0 && index < allPhotos.length) {
                        setCurrentPhotoIndex(index);
                      }
                    }}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {allPhotos.map((photo, index) => (
                      <div key={index} className="w-full h-full shrink-0 snap-center relative flex justify-center items-center bg-black" onClick={() => setUiVisible(!uiVisible)}>
                        <img 
                          src={photo.url} 
                          className="w-full h-full object-contain"
                          alt={`Media ${index + 1}`}
                          onError={async (e: any) => {
                            const imgEl = e.currentTarget;
                            if (photo.url && photo.url.startsWith('/api/media/firestore/') && !imgEl.dataset.retriedFirestore) {
                              imgEl.dataset.retriedFirestore = 'true';
                              const { resolveFirestoreMediaUrl } = await import('../api');
                              const dataUrl = await resolveFirestoreMediaUrl(photo.url);
                              if (dataUrl) {
                                imgEl.src = dataUrl;
                                return;
                              }
                            }
                            imgEl.src = 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=600';
                            imgEl.onerror = null;
                          }} 
                        />
                        <div className={`absolute top-20 left-4 z-10 pointer-events-none transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0'}`}>
                          <span className={`text-[10px] font-bold font-mono uppercase tracking-wider text-white shadow-sm px-2.5 py-1 rounded-full backdrop-blur-md ${photo.label?.toLowerCase().includes('in progress proof') ? 'text-amber-400 bg-black/70 border border-amber-500/50' : photo.label?.toLowerCase().includes('solved proof') || photo.label?.toLowerCase().includes('complete proof') ? 'text-green-400 bg-black/70 border border-green-500/50' : 'bg-black/50 border border-white/20'}`}>
                            {photo.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {allPhotos.length > 1 && (
                    <div className={`absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0'}`}>
                      {allPhotos.map((_, index) => (
                        <div key={index} className={`w-1.5 h-1.5 rounded-full transition-colors ${index === currentPhotoIndex ? 'bg-white shadow-sm' : 'bg-white/40'}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Bottom Gradient for Text Readability */}
            <div className={`absolute bottom-0 left-0 right-0 h-[60%] bg-gradient-to-t from-black via-black/50 to-transparent z-10 pointer-events-none transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0'}`} />

            {/* Content Overlays */}
            <div className={`absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between p-3 sm:p-4 pb-6 pointer-events-none transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0'}`}>
              
              {/* Left Side: Profile & Content */}
              <div className={`flex-1 min-w-0 pr-4 flex flex-col gap-3 ${uiVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                {/* Profile Row */}
                <div className="flex items-center gap-3">
                  {!post.isAnonymous ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (post.authorId) openUserProfile(post.authorId);
                      }}
                      className="flex items-center gap-2.5 hover:opacity-90 focus:outline-none text-left"
                      title={`View ${post.author}'s profile`}
                    >
                      <img 
                        src={post.authorAvatar} 
                        alt={post.author} 
                        className="w-10 h-10 rounded-full border border-white/20 object-cover bg-gray-800 shadow-md" 
                        onError={(e) => { e.currentTarget.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + post.authorId; e.currentTarget.onerror = null; }} 
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[15px] font-bold text-white drop-shadow-md truncate hover:underline">{post.author}</span>
                        {post.authorHandle && (
                          <span className="text-xs text-white/80 drop-shadow truncate">@{post.authorHandle.replace(/^@/, '')}</span>
                        )}
                      </div>
                    </button>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20 shrink-0">
                        <span className="text-white font-bold text-lg drop-shadow-md">A</span>
                      </div>
                      <span className="text-[15px] font-bold text-white drop-shadow-md truncate">Anonymous Citizen</span>
                    </>
                  )}
                </div>

                {/* Location */}
                <a 
                  href={post.lat && post.lng ? `https://www.google.com/maps/search/?api=1&query=${post.lat},${post.lng}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-white/90 drop-shadow-md cursor-pointer hover:text-white mt-1 w-fit max-w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!post.lat || !post.lng) e.preventDefault();
                  }}
                >
                  <MapPin size={14} className="shrink-0" />
                  <span className="truncate font-medium">{post.address}</span>
                </a>

                {/* Title & Description */}
                <div className="mt-1 flex items-start gap-2 min-w-0 w-full">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base font-bold text-white drop-shadow-md leading-tight mb-1 break-words">{post.title}</h1>
                    <div className="flex items-center text-[13px] text-white/90 drop-shadow-md pointer-events-auto w-full min-w-0">
                      <span className="truncate flex-1 min-w-0">{post.content}</span>
                      {post.content.length > 50 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowDescriptionSheet(true); }}
                          className="text-xs font-bold text-white drop-shadow-md hover:text-white/80 transition-colors shrink-0 ml-1.5"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Vertical Actions */}
              <div className={`flex flex-col items-center gap-3 pb-1 shrink-0 ${uiVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); onAction(post.id, 'upvote'); }} className="flex flex-col items-center gap-0.5 p-1 group active:scale-95 transition-transform">
                  <ArrowUp
                    size={26}
                    strokeWidth={2.5}
                    className={`drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] transition-colors ${post.upvoteUsers?.includes(userId) ? 'text-indigo-400' : 'text-white group-hover:text-indigo-300'}`}
                  />
                  <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">{post.upvotes > 0 ? post.upvotes : 'Upvote'}</span>
                </button>

                <button onClick={(e) => { e.stopPropagation(); triggerHaptic(); setShowCommentsSheet(true); }} className="flex flex-col items-center gap-0.5 p-1 group active:scale-95 transition-transform">
                  <MessageSquare
                    size={24}
                    strokeWidth={2.3}
                    className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] group-hover:text-white/80 transition-colors"
                  />
                  <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                    {liveComments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0) || 'Comment'}
                  </span>
                </button>

                <button disabled={!canVerify} onClick={(e) => { e.stopPropagation(); triggerHaptic(); onAction(post.id, 'confirm'); }} className="flex flex-col items-center gap-0.5 p-1 group active:scale-95 transition-transform">
                  <CheckCircle2
                    size={24}
                    strokeWidth={2.3}
                    className={`drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] transition-colors ${!canVerify ? 'opacity-45 text-white' : post.confirmUsers?.includes(userId) ? 'text-emerald-400' : 'text-white group-hover:text-emerald-400'}`}
                  />
                  <span className={`text-[11px] font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] ${!canVerify ? 'text-white/60' : 'text-white'}`}>{post.confirms > 0 ? post.confirms : 'Confirm'}</span>
                </button>

                <button disabled={!canVerify} onClick={(e) => { e.stopPropagation(); triggerHaptic(); onAction(post.id, 'false'); }} className="flex flex-col items-center gap-0.5 p-1 group active:scale-95 transition-transform">
                  <ShieldAlert
                    size={24}
                    strokeWidth={2.3}
                    className={`drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] transition-colors ${!canVerify ? 'opacity-45 text-white' : post.falseUsers?.includes(userId) ? 'text-rose-400' : 'text-white group-hover:text-rose-400'}`}
                  />
                  <span className={`text-[11px] font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] ${!canVerify ? 'text-white/60' : 'text-white'}`}>{post.falses > 0 ? post.falses : 'False'}</span>
                </button>

                <button onClick={(e) => { e.stopPropagation(); onShare(post.id); }} className="flex flex-col items-center gap-0.5 p-1 group active:scale-95 transition-transform">
                  <Share2
                    size={24}
                    strokeWidth={2.3}
                    className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] group-hover:text-white/80 transition-colors"
                  />
                  <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">Share</span>
                </button>

                {canEdit && (
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }} className="flex flex-col items-center p-1 group active:scale-95 transition-transform">
                      <MoreVertical size={24} strokeWidth={2.3} className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] group-hover:text-white/80 transition-colors" />
                    </button>
                    {showOptions && (
                      <div className="absolute bottom-12 right-0 mb-2 bg-white dark:bg-gray-800 shadow-xl rounded-xl border border-gray-100 dark:border-gray-700 py-1 w-48 z-[60]">
                        <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); setUpdatingStatus(false); setShowOptions(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                          <Edit2 size={16} /> Edit Report
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setUpdatingStatus(true); setIsEditing(false); setShowOptions(false); setStatusError(''); setProofPhoto(null); setNewStatus(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                          <Activity size={16} /> Update Status
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setShowWithdrawConfirm(true); setShowOptions(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2">
                          <Trash2 size={16} /> Withdraw
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Description Bottom Sheet */}
      <AnimatePresence>
        {showDescriptionSheet && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowDescriptionSheet(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[120] bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] mx-auto max-w-2xl"
            >
              <div className="shrink-0 p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate pr-4">
                  {post.title}
                </h3>
                <button onClick={() => setShowDescriptionSheet(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 pb-8">
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">
                  {(post as any).formattedDateTime || `${(post as any).formattedDate} • ${post.timeAgo}`}
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed text-[15px]">
                  {post.content}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Comments Bottom Sheet */}
      <AnimatePresence>
        {showCommentsSheet && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCommentsSheet(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[120] bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] h-[85vh] mx-auto max-w-2xl"
            >
              <div className="shrink-0 p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                  Comments ({liveComments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0)})
                </h3>
                <button onClick={() => setShowCommentsSheet(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-8">
                <CommentSection 
                  comments={liveComments} 
                  postId={post.id} 
                  onAddComment={(text, parentId) => onAddComment(post.id, text, parentId)} 
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Withdraw In-App Confirmation Modal */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Withdraw Report</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Permanently remove this report</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              {(post.confirms > 0 || post.falses > 0 || liveComments.length > 0)
                ? 'This report has existing verifications or comments. Withdrawing it will permanently delete them. Are you sure?'
                : 'Are you sure you want to withdraw this report? This action cannot be undone.'}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => !isWithdrawing && setShowWithdrawConfirm(false)}
                disabled={isWithdrawing}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                disabled={isWithdrawing}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Withdrawing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Withdraw</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PostDetailModal({ posts, initialPostId, initialMode = 'view', isOpen, onClose, onAction, onAddComment, userId, canVerify, onShare }: PostDetailModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // To avoid rendering all 300 heavy posts, we'll implement a sliding window if we want,
  // But a simple fix is to lazily mark posts as 'active' or 'near active'
  const [activeIndex, setActiveIndex] = useState(0);

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current && initialPostId && posts.length > 0) {
      const idx = posts.findIndex(p => p.id === initialPostId);
      if (idx !== -1) {
        setActiveIndex(idx);
        hasInitialized.current = true;
      }
    }
  }, [initialPostId, posts]);

  const hasScrolled = useRef(false);

  useEffect(() => {
    if (isOpen && containerRef.current && posts.length > 0 && !hasScrolled.current) {
      const idx = posts.findIndex(p => p.id === initialPostId);
      if (idx !== -1 && containerRef.current.children[idx]) {
        containerRef.current.children[idx].scrollIntoView({ behavior: 'auto', block: 'start' });
        hasScrolled.current = true;
      }
    }
    if (!isOpen) {
      hasScrolled.current = false;
      hasInitialized.current = false;
    }
  }, [isOpen, posts.length, initialPostId]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const index = Math.round(el.scrollTop / el.clientHeight);
    if (index !== activeIndex && index >= 0 && index < posts.length) {
      setActiveIndex(index);
    }
  };

  if (!isOpen || posts.length === 0) return null;

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden"
    >
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide [&::-webkit-scrollbar]:hidden bg-black"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {posts.map((post, index) => {
          // Render only a sliding window of items (-2 to +2 of active) for performance, 
          // but render placeholders for others to keep scroll height correct
          const isNear = Math.abs(index - activeIndex) <= 2;
          
          if (!isNear) {
            return <div key={post.id} className="w-full h-full snap-start shrink-0" />;
          }
          
          return (
            <PostDetailItem
              key={post.id}
              post={post}
              isActive={index === activeIndex}
              onClose={onClose}
              onAction={onAction}
              onAddComment={onAddComment}
              userId={userId}
              canVerify={canVerify}
              onShare={onShare}
              initialMode={post.id === initialPostId ? initialMode : 'view'}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
