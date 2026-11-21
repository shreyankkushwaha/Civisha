import { ReportPost, Notification, NotificationSettings, UserProfile, SupportTicket, SupportTopic, SupportTicketStatus, CategoryId, ResolutionAIVerification } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { collection, runTransaction, doc, where, writeBatch, collectionGroup, setDoc, getDocs, getDoc, deleteDoc, deleteField, query, orderBy, serverTimestamp, updateDoc, increment, addDoc, limit } from 'firebase/firestore';

const authorProfileCache = new Map<string, { displayName: string; handle: string; photoURL: string }>();

const mediaDataUrlCache = new Map<string, string>();

export const resolveFirestoreMediaUrl = async (url?: string | null): Promise<string | null> => {
  if (!url || !url.startsWith('/api/media/firestore/')) return null;
  if (mediaDataUrlCache.has(url)) return mediaDataUrlCache.get(url)!;
  try {
    const mediaId = url.replace('/api/media/firestore/', '').trim();
    if (!mediaId) return null;
    const snap = await getDoc(doc(db, 'reports_media', mediaId));
    if (snap.exists()) {
      const data = snap.data();
      if (data.base64Data) {
        const contentType = data.contentType || 'image/jpeg';
        const dataUrl = data.base64Data.startsWith('data:')
          ? data.base64Data
          : `data:${contentType};base64,${data.base64Data}`;
        mediaDataUrlCache.set(url, dataUrl);
        return dataUrl;
      }
    }
  } catch (err) {
    console.warn('Could not resolve Firestore fallback media on client:', err);
  }
  return null;
};

export const uploadImageToStorage = async (base64Data: string, customFileName?: string): Promise<string> => {
  if (!base64Data || !base64Data.startsWith('data:')) {
    return base64Data;
  }
  const match = base64Data.match(/^data:([^;]+);/);
  const contentType = match ? match[1] : 'image/jpeg';
  const extension = contentType.split('/')[1] || 'jpg';
  const fileName = customFileName || `image_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

  // 1. Primary method: JSON upload to /api/storage/upload
  try {
    const jsonRes = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        contentType,
        base64Data
      })
    });
    if (jsonRes.ok) {
      const jsonBody = await jsonRes.json();
      if (jsonBody?.proxyUrl) {
        if (jsonBody.proxyUrl.startsWith('/api/media/firestore/')) {
          mediaDataUrlCache.set(jsonBody.proxyUrl, base64Data);
        }
        return jsonBody.proxyUrl;
      }
    }
  } catch (err) {
    console.warn('JSON upload failed, attempting raw upload fallback...', err);
  }

  // 2. Secondary method: Binary upload to /api/storage/upload-raw
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const rawRes = await fetch(`/api/storage/upload-raw?fileName=${encodeURIComponent(fileName)}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: blob
    });
    if (rawRes.ok) {
      const rawBody = await rawRes.json();
      if (rawBody?.proxyUrl) {
        if (rawBody.proxyUrl.startsWith('/api/media/firestore/')) {
          mediaDataUrlCache.set(rawBody.proxyUrl, base64Data);
        }
        return rawBody.proxyUrl;
      }
    }
  } catch (rawErr) {
    console.warn('Raw upload failed, falling back to direct Firestore media storage...', rawErr);
  }

  // 3. Automatic direct Firestore media storage fallback (100% resilient even if serverless function is unavailable)
  try {
    const mediaId = `m_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const authorId = auth.currentUser?.uid || localStorage.getItem('local_user_id') || 'guest';
    await setDoc(doc(db, 'reports_media', mediaId), {
      contentType,
      base64Data: rawBase64,
      fileName: fileName.slice(0, 200),
      authorId,
      createdAt: serverTimestamp()
    });
    const proxyUrl = `/api/media/firestore/${mediaId}`;
    mediaDataUrlCache.set(proxyUrl, base64Data);
    return proxyUrl;
  } catch (firestoreMediaErr: any) {
    console.error('All storage upload methods failed:', firestoreMediaErr);
    throw new Error(firestoreMediaErr?.message || 'Photo upload failed. Please try again.');
  }
};

export const api = {
  uploadImage: uploadImageToStorage,
  resolveAuthorProfiles: async (authorIds: string[]): Promise<Map<string, { displayName: string; handle: string; photoURL: string }>> => {
    const uniqueIds = Array.from(new Set(
      authorIds.filter(id => id && id !== 'guest' && !id.startsWith('Guest_') && !id.startsWith('u_'))
    ));
    const missingIds = uniqueIds.filter(id => !authorProfileCache.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
              const d = snap.data();
              const cleanH = (d.handle || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
              authorProfileCache.set(uid, {
                displayName: d.displayName || 'Citizen',
                handle: cleanH ? `@${cleanH}` : '',
                photoURL: d.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`
              });
            }
          } catch (_) {
            // non-fatal
          }
        })
      );
    }
    return authorProfileCache;
  },
  getPosts: async (): Promise<ReportPost[]> => {
    try {
      const reportsRef = collection(db, 'reports');
      const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(300));
      const querySnapshot = await getDocs(q);
      
      const posts: ReportPost[] = [];
      for (const document of querySnapshot.docs) {
        const data = document.data();
        if (data.status === 'Withdrawn' || data.status === 'Rejected') continue;

        posts.push({
          id: document.id,
          authorId: data.authorId,
          author: data.author,
          authorAvatar: data.authorAvatar,
          authorHandle: data.authorHandle,
          isAnonymous: data.isAnonymous,
          title: data.title,
          content: data.content,
          category: data.category,
          lat: data.lat,
          lng: data.lng,
          address: data.address,
          status: data.status,
          trustScore: data.trustScore,
          confirms: data.confirms,
          falses: data.falses,
          upvotes: data.upvotes,
          imageUrl: data.imageUrl,
          imageUrls: data.imageUrls || [],
          statusUpdates: data.statusUpdates || [],
          needsAdminReview: Boolean(data.needsAdminReview),
          aiReviewNote: data.aiReviewNote || '',
          confirmUsers: data.confirmUsers || [],
          falseUsers: data.falseUsers || [],
          upvoteUsers: data.upvoteUsers || [],
          comments: [],
          createdAt: data.createdAt,
          timeAgo: data.createdAt?.toDate ? getRelativeTime(data.createdAt.toDate()) : 'Recently'
        });
      }
      return posts;
    } catch (error) {
      console.error('Failed to fetch posts from Firestore:', error);
      throw error;
    }
  },
  
  createPost: async (postData: any, localUserId: string): Promise<{ success: boolean, post: ReportPost }> => {
    try {
      if (!postData.title || postData.title.trim().length === 0) {
        throw new Error('Title is required');
      }
      if (!postData.category) {
        throw new Error('Category is required');
      }
      
      const reportsRef = collection(db, 'reports');
      const newReportId = `p_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const reportDoc = doc(reportsRef, newReportId);
      
      const currentUser = auth.currentUser;
      const isGhost = Boolean(postData.isAnonymous || !currentUser);
      // Keep authenticated UID as authorId even in Ghost Mode so the owner can still edit/withdraw their own report
      const authorId = currentUser ? currentUser.uid : `Guest_${localUserId}`;
      let authorName = isGhost ? 'Anonymous' : (currentUser?.displayName || 'Citizen');
      let authorAvatar = isGhost ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=anon' : (currentUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId}`);
      let authorHandle = isGhost ? '' : `@${authorName.replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9_]/g, '')}`;

      if (!isGhost && currentUser) {
        try {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.displayName) authorName = uData.displayName;
            if (uData.photoURL) authorAvatar = uData.photoURL;
            if (uData.handle) {
              const cleanH = uData.handle.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
              if (cleanH) authorHandle = `@${cleanH}`;
            }
          }
        } catch (profileErr) {
          console.warn('Could not read user profile during createPost (non-fatal):', profileErr);
        }
      }

      let finalImageUrl = null;
      let finalImageUrls: string[] = [];

      if (postData.imageUrls && Array.isArray(postData.imageUrls) && postData.imageUrls.length > 0) {
        const uploadPromises = postData.imageUrls.map((url: string, i: number) => {
          if (url && url.startsWith('data:')) {
            return uploadImageToStorage(url, `image_${Date.now()}_${i}.jpg`);
          }
          return Promise.resolve(url);
        });
        finalImageUrls = await Promise.all(uploadPromises);
        finalImageUrl = finalImageUrls[0] || null;
      } else if (postData.imageUrl && postData.imageUrl.startsWith('data:')) {
        finalImageUrl = await uploadImageToStorage(postData.imageUrl);
        finalImageUrls = [finalImageUrl];
      } else if (postData.imageUrl) {
        finalImageUrl = postData.imageUrl;
        finalImageUrls = [finalImageUrl];
      }

      const report = {
        authorId,
        author: authorName, 
        authorAvatar,
        authorHandle,
        isAnonymous: isGhost,
        title: postData.title.trim(),
        content: postData.content || '',
        category: postData.category || 'infrastructure',
        lat: Number(postData.lat),
        lng: Number(postData.lng),
        address: postData.address || '',
        status: 'Pending',
        trustScore: 0,
        confirms: 0,
        falses: 0,
        upvotes: 0,
        imageUrl: finalImageUrl,
        imageUrls: finalImageUrls,
        confirmUsers: [],
        falseUsers: [],
        upvoteUsers: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(reportDoc, report);
      
      const newPost: ReportPost = {
        id: newReportId,
        ...report,
        timeAgo: 'Just now',
        comments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ReportPost;
      
      return { success: true, post: newPost };
    } catch (error) {
      console.error('Failed to save to Firestore:', error);
      throw error;
    }
  },
  
  updatePost: async (postId: string, data: Partial<ReportPost>): Promise<void> => {
    try {
      if (data.title !== undefined && (!data.title || data.title.trim().length === 0)) {
        throw new Error('Title cannot be empty');
      }
      const docRef = doc(db, 'reports', postId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to update post', e);
      throw e;
    }
  },

  updateReportStatus: async (reportId: string, newStatus: string, extraUpdates?: Record<string, any>): Promise<void> => {
    try {
      const docRef = doc(db, 'reports', reportId);
      const docSnap = await getDoc(docRef);
      const reportData = docSnap.exists() ? docSnap.data() : null;

      await updateDoc(docRef, {
        ...(extraUpdates || {}),
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      if (
        reportData &&
        reportData.authorId &&
        reportData.authorId !== 'guest' &&
        !reportData.authorId.startsWith('u_') &&
        !reportData.authorId.startsWith('Guest_')
      ) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: reportData.authorId,
            type: 'report_updates',
            priority: 'P1',
            message: `Your report "${reportData.title}" status was updated to ${newStatus}.`,
            isRead: false,
            createdAt: serverTimestamp(),
            relatedReportId: reportId,
            imageUrl: reportData.imageUrl || null
          });
        } catch (notifErr) {
          console.warn('Could not send status update notification (non-fatal):', notifErr);
        }
      }
    } catch (e) {
      console.error('Failed to update report status', e);
      throw e;
    }
  },

  deletePost: async (postId: string, imageUrl?: string, imageUrls?: string[]): Promise<void> => {
    try {
      // 1. Delete media via API if stored in backend B2
      const urlsToDelete = new Set<string>();
      if (imageUrl) urlsToDelete.add(imageUrl);
      if (imageUrls && Array.isArray(imageUrls)) {
        imageUrls.forEach(url => {
          if (url) urlsToDelete.add(url);
        });
      }

      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      for (const url of urlsToDelete) {
        if (typeof url === 'string' && url.startsWith('/api/media/')) {
          try {
            const key = url.replace('/api/media/', '');
            const safePath = key.split('/').map(encodeURIComponent).join('/');
            await fetch(`/api/media/${safePath}`, { method: 'DELETE', headers });
          } catch (mediaErr) {
            console.warn('Could not delete media asset file:', mediaErr);
          }
        }
      }
      
      const docRef = doc(db, 'reports', postId);
      
      // 2. Delete comments subcollection
      try {
        const commentsRef = collection(db, `reports/${postId}/comments`);
        const commentsSnapshot = await getDocs(commentsRef);
        if (!commentsSnapshot.empty) {
          const batch = writeBatch(db);
          commentsSnapshot.forEach(c => batch.delete(c.ref));
          await batch.commit();
        }
      } catch (subErr) {
        console.warn('Could not delete subcollection comments (non-fatal):', subErr);
      }

      // 3. Delete main report document
      await deleteDoc(docRef);
    } catch (e) {
      console.error('Failed to delete post', e);
      throw e;
    }
  },

  interactWithPost: async (id: string, action: 'confirm' | 'false' | 'upvote', userId: string) => {
    try {
      const docRef = doc(db, 'reports', id);
      
      const newPostData = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists()) throw new Error('Post not found');
        
        const data = docSnap.data();
        let confirmUsers = [...(data?.confirmUsers || [])];
        let falseUsers = [...(data?.falseUsers || [])];
        let upvoteUsers = [...(data?.upvoteUsers || [])];
        
        let confirms = Number(data?.confirms || 0);
        let falses = Number(data?.falses || 0);
        let upvotes = Number(data?.upvotes || 0);
        
        const updates: any = { updatedAt: serverTimestamp() };
        
        if (action === 'confirm') {
          const isRemoving = confirmUsers.includes(userId);
          
          if (isRemoving) {
            confirmUsers = confirmUsers.filter(u => u !== userId);
            confirms = Math.max(0, confirms - 1);
          } else {
            confirmUsers.push(userId);
            confirms += 1;
            if (falseUsers.includes(userId)) {
              falseUsers = falseUsers.filter(u => u !== userId);
              falses = Math.max(0, falses - 1);
              updates.falseUsers = falseUsers;
              updates.falses = falses;
            }
          }
          updates.confirmUsers = confirmUsers;
          updates.confirms = confirms;
          
          const totalVotes = confirms + falses;
          updates.trustScore = totalVotes > 0 ? Math.round((confirms / totalVotes) * 100) : 50;
          if (updates.trustScore >= 80 && confirms >= 2) updates.status = 'Solved';
          else if (updates.trustScore < 20 && falses >= 2) updates.status = 'Rejected';
          
        } else if (action === 'false') {
          const isRemoving = falseUsers.includes(userId);
          
          if (isRemoving) {
            falseUsers = falseUsers.filter(u => u !== userId);
            falses = Math.max(0, falses - 1);
          } else {
            falseUsers.push(userId);
            falses += 1;
            if (confirmUsers.includes(userId)) {
              confirmUsers = confirmUsers.filter(u => u !== userId);
              confirms = Math.max(0, confirms - 1);
              updates.confirmUsers = confirmUsers;
              updates.confirms = confirms;
            }
          }
          updates.falseUsers = falseUsers;
          updates.falses = falses;
          
          const totalVotes = confirms + falses;
          updates.trustScore = totalVotes > 0 ? Math.round((confirms / totalVotes) * 100) : 50;
          if (updates.trustScore < 20 && falses >= 2) updates.status = 'Rejected';
          else if (updates.trustScore >= 80 && confirms >= 2) updates.status = 'Solved';
          
        } else if (action === 'upvote') {
          const isRemoving = upvoteUsers.includes(userId);
          if (isRemoving) {
            upvoteUsers = upvoteUsers.filter(u => u !== userId);
            upvotes = Math.max(0, upvotes - 1);
          } else {
            upvoteUsers.push(userId);
            upvotes += 1;
          }
          updates.upvoteUsers = upvoteUsers;
          updates.upvotes = upvotes;
        }
        
        const newTotalVerifications = confirms + falses;
        transaction.update(docRef, updates);
        return { 
          ...data, 
          ...updates,
          _newTotalVerifications: newTotalVerifications
        };
      });
      
      // Milestones notifications
      if ((action === 'confirm' || action === 'false') && newPostData.authorId && !newPostData.authorId.startsWith('u_') && !newPostData.authorId.startsWith('Guest_')) {
        const milestones = [5, 10, 25, 50];
        if (milestones.includes(newPostData._newTotalVerifications)) {
          try {
            await addDoc(collection(db, 'notifications'), {
              userId: newPostData.authorId,
              type: 'verification_activity',
              priority: 'P1',
              message: `Your report "${newPostData.title}" reached ${newPostData._newTotalVerifications} verifications!`,
              isRead: false,
              createdAt: serverTimestamp(),
              relatedReportId: id,
              imageUrl: newPostData.imageUrl || null
            });
          } catch (notifErr) {
            console.warn('Could not trigger notification (non-fatal):', notifErr);
          }
        }
      }
      
      return { success: true, post: { id, ...newPostData } };
    } catch (error) {
      console.error('Interaction failed:', error);
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(error, OperationType.UPDATE, `reports/${id}`);
      }
      throw error;
    }
  },

  addComment: async (id: string, data: { text: string, author: string, parentId?: string, authorAvatar?: string, authorHandle?: string }, userId: string) => {
    try {
      const docRef = doc(db, 'reports', id);
      const docSnap = await getDoc(docRef);
      const postData = docSnap.exists() ? docSnap.data() : null;
      
      const commentsRef = collection(db, `reports/${id}/comments`);
      const newComment = {
        authorId: userId,
        author: data.author,
        authorAvatar: data.authorAvatar || '',
        authorHandle: data.authorHandle || '',
        text: data.text,
        parentId: data.parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const newDocRef = await addDoc(commentsRef, newComment);
      
      // Update commentCount + updatedAt on main document (required by firestore.rules)
      await updateDoc(docRef, {
        commentCount: increment(1),
        updatedAt: serverTimestamp()
      });
      
      // Notify original author if someone else commented
      if (postData && postData.authorId && !postData.authorId.startsWith('u_') && !postData.authorId.startsWith('Guest_') && postData.authorId !== userId) {
        try {
          const notifRef = collection(db, 'notifications');
          await addDoc(notifRef, {
            userId: postData.authorId,
            type: 'comments_mentions',
            priority: 'P1',
            message: `${data.author} commented on your report: "${data.text.substring(0, 30)}..."`,
            isRead: false,
            createdAt: serverTimestamp(),
            relatedReportId: id,
            imageUrl: postData.imageUrl || null
          });
        } catch (notifErr) {
          console.warn('Could not send comment notification (non-fatal):', notifErr);
        }
      }
      
      return { success: true, comment: { id: newDocRef.id, ...newComment, timeAgo: 'Just now' } };
    } catch (error) {
      console.error('Add comment failed:', error);
      throw error;
    }
  },

  // Location APIs
  getLocationName: async (lat: number, lng: number): Promise<string> => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&email=civisha94@gmail.com`, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) throw new Error('Failed to fetch location');
    const data = await res.json();
    return data.address?.city || data.address?.state_district || data.address?.state || 'Your Location';
  },

  getFullAddress: async (lat: number, lng: number): Promise<string> => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&email=civisha94@gmail.com`, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) throw new Error('Failed to fetch address');
    const data = await res.json();
    
    if (data.address && data.address.postcode && data.display_name) {
      const parts = data.display_name.split(',').map((p: string) => p.trim());
      return parts.filter((p: string) => p !== data.address.postcode).join(', ');
    }
    
    return data.display_name || `Coordinate: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  },

  getCoordinatesFromAddress: async (address: string): Promise<{lat: number, lng: number} | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&email=civisha94@gmail.com`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch (e) {
      console.error('Failed to forward geocode:', e);
      return null;
    }
  },

  // Notification APIs
  getNotifications: async (): Promise<Notification[]> => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];
      
      const notifRef = collection(db, 'notifications');
      const q = query(notifRef, where('userId', '==', currentUser.uid));
      const querySnapshot = await getDocs(q);
      
      const notifications = querySnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a, b) => {
           const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
           const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
           return timeB - timeA;
        })
        .map(n => ({
          ...n,
          timeAgo: n.createdAt?.toDate ? getRelativeTime(n.createdAt.toDate()) : 'Recently'
        }))
        .slice(0, 50);
      
      return notifications;
    } catch (error) {
      console.error('Fetch notifications failed:', error);
      return [];
    }
  },
  
  getSettings: async (): Promise<NotificationSettings> => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not logged in");
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().notificationSettings) {
        return userSnap.data().notificationSettings;
      }
      return {
        report_updates: true,
        verification_activity: true,
        comments_mentions: true,
        nearby_reports: false,
        community_events: true
      };
    } catch (e) {
      return {
        report_updates: true,
        verification_activity: true,
        comments_mentions: true,
        nearby_reports: false,
        community_events: true
      };
    }
  },

  updateSettings: async (settings: NotificationSettings): Promise<void> => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not logged in");
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { notificationSettings: settings }, { merge: true });
    } catch (e) {
      console.error('Failed to update settings:', e);
      throw e;
    }
  },

  markNotificationRead: async (notificationId: string): Promise<void> => {
    try {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, { isRead: true });
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
      throw e;
    }
  },

  getAnalyticsPosts: async (): Promise<ReportPost[]> => {
    try {
      const reportsRef = collection(db, 'reports');
      const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(100));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs
        .filter(d => {
          const st = d.data().status;
          return st !== 'Withdrawn' && st !== 'Rejected';
        })
        .map(document => ({
          id: document.id,
          ...document.data(),
          createdAt: document.data().createdAt?.toDate ? document.data().createdAt.toDate() : new Date(),
          updatedAt: document.data().updatedAt?.toDate ? document.data().updatedAt.toDate() : new Date(),
        })) as any;
    } catch (error) {
      console.error('Failed to fetch analytics posts:', error);
      return [];
    }
  },

  cleanHandle: (raw: string): string => {
    return raw.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
  },

  checkUniqueHandle: async (handle: string, userId: string): Promise<boolean> => {
    const clean = handle.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    if (!clean || clean.length < 3) return false;
    try {
      // 1. Check atomic usernames collection
      const usernameDoc = await getDoc(doc(db, 'usernames', clean));
      if (usernameDoc.exists()) {
        return usernameDoc.data().uid === userId;
      }
      // 2. Fallback check in users collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('handle', '==', clean));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.filter(d => d.id !== userId);
      return docs.length === 0;
    } catch (err) {
      console.error('Handle uniqueness check error:', err);
      return false; // Fail safe
    }
  },

  getUserProfile: async (identifier: string): Promise<UserProfile | null> => {
    if (!identifier || identifier === 'guest' || identifier.startsWith('Guest_') || identifier.startsWith('u_')) {
      return {
        uid: identifier || 'guest',
        displayName: 'Citizen',
        handle: 'citizen',
        photoURL: '',
        bio: 'Participating as an anonymous community member.',
        reportCount: 0,
        verificationCount: 0
      };
    }

    try {
      let resolvedUid = identifier.trim();
      let userDoc = await getDoc(doc(db, 'users', resolvedUid));

      // If identifier is a @handle (e.g. from /?user=handle), resolve handle -> uid
      if (!userDoc.exists()) {
        const cleanIdentifier = resolvedUid.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
        if (cleanIdentifier) {
          const handleSnap = await getDoc(doc(db, 'usernames', cleanIdentifier));
          if (handleSnap.exists() && handleSnap.data().uid) {
            resolvedUid = handleSnap.data().uid;
            userDoc = await getDoc(doc(db, 'users', resolvedUid));
          } else {
            const q = query(collection(db, 'users'), where('handle', '==', cleanIdentifier), limit(1));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              resolvedUid = qSnap.docs[0].id;
              userDoc = qSnap.docs[0] as any;
            }
          }
        }
      }

      if (!userDoc.exists()) {
        return {
          uid: resolvedUid,
          displayName: 'Civic Contributor',
          handle: 'citizen',
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${resolvedUid}`,
          bio: 'Community member on Civisha.',
          reportCount: 0,
          verificationCount: 0
        };
      }

      const data = userDoc.data();
      if (data.isBanned) {
        return {
          uid: resolvedUid,
          displayName: 'Account Restricted',
          handle: 'restricted',
          photoURL: '',
          bio: 'This account has been restricted by an administrator.',
          isBanned: true,
          reportCount: 0,
          verificationCount: 0
        };
      }

      // Count user public reports (excluding anonymous Ghost Mode, withdrawn, and rejected)
      let publicReportCount = 0;
      try {
        const reportsRef = collection(db, 'reports');
        const q = query(reportsRef, where('authorId', '==', resolvedUid));
        const snapshots = await getDocs(q);
        publicReportCount = snapshots.docs.filter(d => {
          const rData = d.data();
          const st = rData.status;
          return !rData.isAnonymous && st !== 'Withdrawn' && st !== 'Rejected';
        }).length;
      } catch (countErr) {
        console.warn('Could not fetch user public reports count:', countErr);
      }

      // Count user verifications
      let publicVerificationCount = 0;
      try {
        const reportsRef = collection(db, 'reports');
        const [confirmedSnap, falsedSnap] = await Promise.all([
          getDocs(query(reportsRef, where('confirmUsers', 'array-contains', resolvedUid))),
          getDocs(query(reportsRef, where('falseUsers', 'array-contains', resolvedUid)))
        ]);
        const verifiedIds = new Set<string>();
        [...confirmedSnap.docs, ...falsedSnap.docs].forEach(d => verifiedIds.add(d.id));
        publicVerificationCount = verifiedIds.size;
      } catch (verifErr) {
        console.warn('Could not fetch user verifications count:', verifErr);
      }

      const rawHandle = data.handle || '';
      const cleanH = rawHandle ? rawHandle.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '') : (data.displayName ? data.displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') : 'citizen');

      return {
        uid: resolvedUid,
        displayName: data.displayName || 'Citizen',
        handle: cleanH,
        photoURL: data.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${resolvedUid}`,
        bio: data.bio || '',
        createdAt: data.createdAt,
        isAdmin: Boolean(data.isAdmin),
        isModerator: Boolean(data.isModerator),
        isSuspended: Boolean(data.isSuspended),
        isBanned: Boolean(data.isBanned),
        reportCount: publicReportCount,
        verificationCount: publicVerificationCount
      };
    } catch (err) {
      console.error('Failed to get user profile:', err);
      return null;
    }
  },

  updateUserProfile: async (userId: string, data: { displayName?: string, photoURL?: string, handle?: string, bio?: string }) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not logged in");

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const existingData = userSnap.exists() ? userSnap.data() : {};
      const oldHandle = existingData.handle ? existingData.handle.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '') : '';

      let cleanHandle: string | undefined = undefined;
      if (data.handle !== undefined) {
        cleanHandle = data.handle.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
        if (cleanHandle.length < 3) {
          throw new Error('Username handle must be at least 3 characters (letters, numbers, underscores).');
        }

        // Atomic username reservation via runTransaction if handle changed
        if (cleanHandle !== oldHandle) {
          await runTransaction(db, async (transaction) => {
            const newHandleRef = doc(db, 'usernames', cleanHandle!);
            const newHandleSnap = await transaction.get(newHandleRef);
            if (newHandleSnap.exists() && newHandleSnap.data().uid !== userId) {
              throw new Error(`Username @${cleanHandle} is already taken.`);
            }
            transaction.set(newHandleRef, {
              uid: userId,
              createdAt: serverTimestamp()
            });
            if (oldHandle && oldHandle !== cleanHandle) {
              transaction.delete(doc(db, 'usernames', oldHandle));
            }
          });
        }
      }
      
      if (data.displayName || data.photoURL) {
        await updateProfile(currentUser, {
          displayName: data.displayName || currentUser.displayName,
          photoURL: data.photoURL || currentUser.photoURL
        }).catch(err => console.warn('Auth profile update error:', err));
      }
      
      const payload: any = {
        updatedAt: serverTimestamp(),
        email: deleteField()
      };
      if (data.displayName !== undefined) payload.displayName = data.displayName.trim();
      if (data.photoURL !== undefined) payload.photoURL = data.photoURL;
      if (cleanHandle !== undefined) payload.handle = cleanHandle;
      if (data.bio !== undefined) payload.bio = data.bio.trim();

      await setDoc(userRef, payload, { merge: true });

      // Update in-memory author profile cache immediately
      const resolvedHandle = cleanHandle !== undefined ? cleanHandle : oldHandle;
      authorProfileCache.set(userId, {
        displayName: (data.displayName !== undefined ? data.displayName.trim() : existingData.displayName) || 'Citizen',
        handle: resolvedHandle ? `@${resolvedHandle}` : '',
        photoURL: (data.photoURL !== undefined ? data.photoURL : existingData.photoURL) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
      });
      
      // Propagate to reports owned by this user (chunked under 500 batch limit)
      try {
        const reportsRef = collection(db, 'reports');
        const q = query(reportsRef, where('authorId', '==', userId));
        const snapshots = await getDocs(q);
        
        if (!snapshots.empty) {
          const publicDocs = snapshots.docs.filter(d => !d.data().isAnonymous);
          for (let i = 0; i < publicDocs.length; i += 400) {
            const chunk = publicDocs.slice(i, i + 400);
            const reportBatch = writeBatch(db);
            chunk.forEach(reportDoc => {
              const updates: any = { updatedAt: serverTimestamp() };
              if (data.displayName) updates.author = data.displayName.trim();
              if (data.photoURL) updates.authorAvatar = data.photoURL;
              if (cleanHandle !== undefined) updates.authorHandle = cleanHandle ? `@${cleanHandle}` : '';
              reportBatch.update(reportDoc.ref, updates);
            });
            await reportBatch.commit();
          }
        }
      } catch (reportPropErr) {
        console.warn('Could not propagate profile changes to reports (non-fatal):', reportPropErr);
      }
      
      // Propagate to comments (chunked and wrapped in try/catch)
      try {
        const commentsQ = query(collectionGroup(db, 'comments'), where('authorId', '==', userId));
        const commentsSnap = await getDocs(commentsQ);
        if (!commentsSnap.empty) {
          for (let i = 0; i < commentsSnap.docs.length; i += 400) {
            const chunk = commentsSnap.docs.slice(i, i + 400);
            const commentBatch = writeBatch(db);
            chunk.forEach(commentDoc => {
              const updates: any = { updatedAt: serverTimestamp() };
              if (data.displayName) updates.author = data.displayName.trim();
              if (data.photoURL) updates.authorAvatar = data.photoURL;
              if (cleanHandle !== undefined) updates.authorHandle = cleanHandle ? `@${cleanHandle}` : '';
              commentBatch.update(commentDoc.ref, updates);
            });
            await commentBatch.commit();
          }
        }
      } catch (commentPropErr) {
        console.warn('Could not propagate profile changes to comments (collectionGroup index may be needed):', commentPropErr);
      }
      
      return true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  getUserReports: async (userId: string, includeAnonymous: boolean = false): Promise<ReportPost[]> => {
    try {
      const reportsRef = collection(db, 'reports');
      const q = query(reportsRef, where('authorId', '==', userId));
      const querySnapshot = await getDocs(q);
      
      const posts: ReportPost[] = [];
      for (const document of querySnapshot.docs) {
        const data = document.data();
        if (!includeAnonymous && data.isAnonymous) continue;

        const createdMs = data.createdAt?.toMillis
          ? data.createdAt.toMillis()
          : (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0);
        posts.push({
          id: document.id,
          authorId: data.authorId,
          author: data.author,
          authorAvatar: data.authorAvatar,
          authorHandle: data.authorHandle,
          isAnonymous: data.isAnonymous,
          title: data.title,
          content: data.content,
          category: data.category,
          lat: data.lat,
          lng: data.lng,
          address: data.address,
          status: data.status,
          trustScore: data.trustScore,
          confirms: data.confirms,
          falses: data.falses,
          upvotes: data.upvotes,
          imageUrl: data.imageUrl,
          imageUrls: data.imageUrls || [],
          confirmUsers: data.confirmUsers || [],
          falseUsers: data.falseUsers || [],
          upvoteUsers: data.upvoteUsers || [],
          comments: [] as any,
          createdAt: createdMs,
          timeAgo: data.createdAt?.toDate ? getRelativeTime(data.createdAt.toDate()) : 'Recently'
        });
      }
      return posts.sort((a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0));
    } catch (error) {
      console.error('Failed to fetch user reports:', error);
      return [];
    }
  },

  getUserVerifications: async (userId: string): Promise<ReportPost[]> => {
    try {
      const reportsRef = collection(db, 'reports');
      const [confirmedSnap, falsedSnap] = await Promise.all([
        getDocs(query(reportsRef, where('confirmUsers', 'array-contains', userId))),
        getDocs(query(reportsRef, where('falseUsers', 'array-contains', userId)))
      ]);
      
      const seenIds = new Set<string>();
      const posts: ReportPost[] = [];

      for (const document of [...confirmedSnap.docs, ...falsedSnap.docs]) {
        if (seenIds.has(document.id)) continue;
        seenIds.add(document.id);
        const data = document.data();
        const createdMs = data.createdAt?.toMillis
          ? data.createdAt.toMillis()
          : (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0);
        posts.push({
          id: document.id,
          authorId: data.authorId,
          author: data.author,
          authorAvatar: data.authorAvatar,
          authorHandle: data.authorHandle,
          isAnonymous: data.isAnonymous,
          title: data.title,
          content: data.content,
          category: data.category,
          lat: data.lat,
          lng: data.lng,
          address: data.address,
          status: data.status,
          trustScore: data.trustScore,
          confirms: data.confirms,
          falses: data.falses,
          upvotes: data.upvotes,
          imageUrl: data.imageUrl,
          imageUrls: data.imageUrls || [],
          confirmUsers: data.confirmUsers || [],
          falseUsers: data.falseUsers || [],
          upvoteUsers: data.upvoteUsers || [],
          comments: [] as any,
          createdAt: createdMs,
          timeAgo: data.createdAt?.toDate ? getRelativeTime(data.createdAt.toDate()) : 'Recently'
        });
      }
      return posts.sort((a, b) => ((b as any).createdAt || 0) - ((a as any).createdAt || 0));
    } catch (error) {
      console.error('Failed to fetch user verifications:', error);
      return [];
    }
  },

  getUserReportCount: async (userId: string): Promise<number> => {
    try {
      const reportsRef = collection(db, 'reports');
      const q = query(reportsRef, where('authorId', '==', userId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error('Failed to fetch report count:', error);
      return 0;
    }
  },

  submitSupportTicket: async (payload: {
    name: string;
    email: string;
    topic: SupportTopic;
    subject: string;
    message: string;
    relatedReportId?: string;
  }): Promise<{ ticketId: string }> => {
    const allowedTopics: SupportTopic[] = [
      'General Help',
      'Report Issue / Moderation',
      'Account & Verification',
      'Bug Report',
      'Feature Suggestion',
      'Privacy / Data Request',
    ];
    const cleanName = String(payload.name || '').trim().slice(0, 100);
    const cleanEmail = String(payload.email || '').trim().slice(0, 200);
    const cleanSubject = String(payload.subject || '').trim().slice(0, 200);
    const cleanMessage = String(payload.message || '').trim().slice(0, 3000);
    const cleanRelatedReportId = String(payload.relatedReportId || '').trim().slice(0, 128);
    const cleanTopic: SupportTopic = allowedTopics.includes(payload.topic) ? payload.topic : 'General Help';

    if (!cleanName) throw new Error('Please enter your name.');
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!cleanSubject) throw new Error('Please enter a subject.');
    if (cleanMessage.length < 10) {
      throw new Error('Please provide at least 10 characters in your message.');
    }

    let uid = auth.currentUser?.uid;
    if (!uid) {
      let localUid = typeof localStorage !== 'undefined' ? localStorage.getItem('local_user_id') : null;
      if (!localUid) {
        localUid = `u_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        if (typeof localStorage !== 'undefined') localStorage.setItem('local_user_id', localUid);
      }
      uid = localUid;
    }

    const ticketId = `t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ticketPath = `support_tickets/${ticketId}`;
    try {
      const docPayload: Record<string, any> = {
        userId: uid.slice(0, 128),
        name: cleanName,
        email: cleanEmail,
        topic: cleanTopic,
        subject: cleanSubject,
        message: cleanMessage,
        status: 'Open',
        adminNote: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanRelatedReportId) {
        docPayload.relatedReportId = cleanRelatedReportId;
      }
      await setDoc(doc(db, 'support_tickets', ticketId), docPayload);
      return { ticketId };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, ticketPath);
    }
  },

  getMySupportTickets: async (userId: string): Promise<SupportTicket[]> => {
    if (!auth.currentUser || auth.currentUser.uid !== userId) {
      return [];
    }
    try {
      const q = query(collection(db, 'support_tickets'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const tickets: SupportTicket[] = snap.docs.map((d) => {
        const data = d.data();
        const createdMs = data.createdAt?.toMillis
          ? data.createdAt.toMillis()
          : data.createdAt?.seconds
          ? data.createdAt.seconds * 1000
          : 0;
        return {
          id: d.id,
          userId: data.userId,
          name: data.name,
          email: data.email,
          topic: data.topic,
          subject: data.subject,
          message: data.message,
          relatedReportId: data.relatedReportId || '',
          status: data.status || 'Open',
          adminNote: data.adminNote || '',
          createdAt: createdMs,
          updatedAt: data.updatedAt,
          timeAgo: data.createdAt?.toDate ? getRelativeTime(data.createdAt.toDate()) : 'Just now',
        };
      });
      return tickets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'support_tickets');
    }
  },

  getAllSupportTickets: async (): Promise<SupportTicket[]> => {
    try {
      const snap = await getDocs(collection(db, 'support_tickets'));
      const tickets: SupportTicket[] = snap.docs.map((d) => {
        const data = d.data();
        const createdMs = data.createdAt?.toMillis
          ? data.createdAt.toMillis()
          : data.createdAt?.seconds
          ? data.createdAt.seconds * 1000
          : 0;
        return {
          id: d.id,
          userId: data.userId,
          name: data.name,
          email: data.email,
          topic: data.topic,
          subject: data.subject,
          message: data.message,
          relatedReportId: data.relatedReportId || '',
          status: data.status || 'Open',
          adminNote: data.adminNote || '',
          createdAt: createdMs,
          updatedAt: data.updatedAt,
          timeAgo: data.createdAt?.toDate ? getRelativeTime(data.createdAt.toDate()) : 'Recently',
        };
      });
      return tickets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'support_tickets');
    }
  },

  updateSupportTicket: async (ticketId: string, status: SupportTicketStatus, adminNote?: string): Promise<void> => {
    const ticketPath = `support_tickets/${ticketId}`;
    try {
      await updateDoc(doc(db, 'support_tickets', ticketId), {
        status,
        adminNote: String(adminNote ?? '').trim().slice(0, 1000),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, ticketPath);
    }
  },

  deleteSupportTicket: async (ticketId: string): Promise<void> => {
    const ticketPath = `support_tickets/${ticketId}`;
    try {
      await deleteDoc(doc(db, 'support_tickets', ticketId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, ticketPath);
    }
  },

  draftReportWithAI: async (payload: {
    images: string[];
    address?: string;
    lat?: number;
    lng?: number;
    language: 'en' | 'hi';
  }): Promise<{ category: CategoryId; title: string; description: string; language: 'en' | 'hi' }> => {
    const res = await fetch('/api/ai/draft-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to draft report with AI. Please try again.');
    }
    return data;
  },

  verifyResolutionWithAI: async (payload: {
    beforeImageUrl?: string;
    beforeImageBase64?: string;
    afterImageBase64: string;
    title: string;
    category: string;
    description?: string;
    address?: string;
    proposedStatus: 'In Progress' | 'Complete';
  }): Promise<ResolutionAIVerification> => {
    const res = await fetch('/api/ai/verify-resolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to verify resolution photo with AI.');
    }
    return data;
  },

  generateSharePostWithAI: async (payload: {
    title: string;
    content?: string;
    category?: string;
    address?: string;
    status?: string;
    confirms?: number;
    upvotes?: number;
    reportUrl: string;
  }): Promise<{ postText: string }> => {
    const res = await fetch('/api/ai/share-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to generate social media post.');
    }
    return data;
  },
};

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
