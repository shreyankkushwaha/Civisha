import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Calendar, CheckCircle2, FileText, Share2, Edit2, Loader2, Award, ExternalLink, ThumbsUp } from 'lucide-react';
import { api } from '../api';
import { auth, checkIsAdminUser } from '../firebase';
import { UserProfile, ReportPost } from '../types';
import { usePost } from '../hooks/PostContext';
import { CATEGORIES } from '../categories';
import { useToast } from './Toast';
import { updatePageSEO } from '../utils/seo';

interface PublicProfileModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEditOwnProfile?: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  userId,
  isOpen,
  onClose,
  onEditOwnProfile
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportPost[]>([]);
  const [activeTab, setActiveTab] = useState<'reports' | 'about'>('reports');
  const { openPost } = usePost();
  const { toast } = useToast();

  const isOwnProfile = Boolean(auth.currentUser && profile && auth.currentUser.uid === profile.uid);

  useEffect(() => {
    if (!isOpen || !userId) {
      setProfile(null);
      setReports([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const loadProfileData = async () => {
      try {
        const prof = await api.getUserProfile(userId);
        if (!isMounted) return;
        setProfile(prof);

        if (prof && prof.uid && !prof.isBanned) {
          const handleOrUid = prof.handle || prof.uid;
          const canonicalPath = `/u/${encodeURIComponent(handleOrUid)}`;
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/u/')) {
            window.history.replaceState({ userId: handleOrUid }, '', canonicalPath);
          }
          const profileDesc = prof.bio
            ? `${prof.displayName} (@${handleOrUid}) on Civisha: ${prof.bio}`
            : `View ${prof.displayName} (@${handleOrUid})'s verified civic issue reports, community verifications, and civic impact on Civisha.`;
          updatePageSEO({
            title: `${prof.displayName} (@${handleOrUid}) – Citizen Civic Profile | Civisha`,
            description: profileDesc,
            canonicalPath,
            imageUrl: prof.photoURL || '/og-fallback.png',
            type: 'profile',
            keywords: [
              prof.displayName,
              `@${handleOrUid}`,
              'Civisha citizen profile',
              'civic issue reporter',
              'community verification',
            ],
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'ProfilePage',
              mainEntity: {
                '@type': 'Person',
                name: prof.displayName,
                alternateName: `@${handleOrUid}`,
                description: profileDesc,
                image: prof.photoURL || `${window.location.origin}/og-fallback.png`,
                url: `${window.location.origin}${canonicalPath}`,
              },
            },
          });

          const userReports = await api.getUserReports(prof.uid, false);
          if (!isMounted) return;
          // Only show non-anonymous, non-withdrawn, non-rejected public reports on public profile
          const publicReports = (userReports || []).filter(
            r => !r.isAnonymous && r.status !== 'Withdrawn' && r.status !== 'Rejected'
          );
          setReports(publicReports);
        } else {
          setReports([]);
        }
      } catch (err) {
        console.error('Error loading public profile:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProfileData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  const handleShareProfile = async () => {
    if (!profile) return;
    const shareUrl = `${window.location.origin}/u/${encodeURIComponent(profile.handle || profile.uid)}`;
    const shareText = `Check out ${profile.displayName} (@${profile.handle || 'citizen'}) on Civisha`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${profile.displayName} (@${profile.handle}) | Civisha`,
          text: shareText,
          url: shareUrl
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      toast('Profile link copied to clipboard!', 'success');
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('Share canceled') || err.message?.includes('Share cancelled')) {
        return;
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast('Profile link copied to clipboard!', 'success');
      } catch (clipErr) {
        console.error('Share failed:', clipErr);
      }
    }
  };

  const formattedJoinDate = React.useMemo(() => {
    if (!profile?.createdAt) return 'Recently joined';
    try {
      const d = profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt);
      if (isNaN(d.getTime())) return 'Recently joined';
      return `Member since ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    } catch {
      return 'Recently joined';
    }
  }, [profile?.createdAt]);

  if (!isOpen || !userId) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 280 }}
          className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Civic Identity
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShareProfile}
                className="p-2 rounded-full text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Share Profile"
              >
                <Share2 size={18} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Modal Content Scrollable */}
          <div className="overflow-y-auto flex-1 p-5 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Resolving civic profile...</p>
              </div>
            ) : profile ? (
              <>
                {/* Hero / Identity Card */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <div className="relative shrink-0">
                    <img
                      src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`}
                      alt={profile.displayName}
                      className="w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-gray-800 object-cover border-2 border-indigo-100 dark:border-indigo-900/50 shadow-sm"
                      onError={e => {
                        e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`;
                        e.currentTarget.onerror = null;
                      }}
                    />
                    {profile.isAdmin && (
                      <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white p-1 rounded-full shadow-md" title="Administrator">
                        <Shield size={12} className="stroke-[3]" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                        {profile.displayName}
                      </h3>
                      {profile.isAdmin && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                          Admin
                        </span>
                      )}
                      {profile.isModerator && !profile.isAdmin && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          Moderator
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-1 text-indigo-600 dark:text-indigo-400 text-sm font-semibold mt-0.5">
                      <span>@{profile.handle || 'citizen'}</span>
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-2">
                      <Calendar size={13} />
                      <span>{formattedJoinDate}</span>
                    </div>
                  </div>

                  {isOwnProfile && onEditOwnProfile && (
                    <button
                      onClick={() => {
                        onClose();
                        onEditOwnProfile();
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
                    >
                      <Edit2 size={13} />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                {/* Bio Section */}
                {profile.bio ? (
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {profile.bio}
                  </div>
                ) : isOwnProfile ? (
                  <div 
                    onClick={() => {
                      onClose();
                      onEditOwnProfile?.();
                    }}
                    className="border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-3 text-center text-xs text-gray-500 hover:border-indigo-500 hover:text-indigo-600 cursor-pointer transition-colors"
                  >
                    + Add a bio to your civic profile
                  </div>
                ) : null}

                {/* Impact Metrics Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-indigo-50/80 to-indigo-100/30 dark:from-indigo-950/30 dark:to-indigo-900/10 border border-indigo-100/80 dark:border-indigo-900/30 rounded-2xl p-4 text-center">
                    <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {reports.length}
                    </div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-0.5">
                      Public Reports
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 dark:from-emerald-950/30 dark:to-emerald-900/10 border border-emerald-100/80 dark:border-emerald-900/30 rounded-2xl p-4 text-center">
                    <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                      {reports.filter(r => r.status === 'Solved' || r.status === 'Complete').length}
                    </div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-0.5">
                      Issues Solved
                    </div>
                  </div>
                </div>

                {/* User's Public Reports */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Reports by {profile.displayName.split(' ')[0]}
                    </h4>
                    <span className="text-xs font-medium text-gray-500">
                      {reports.length} {reports.length === 1 ? 'report' : 'reports'}
                    </span>
                  </div>

                  {reports.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800">
                      <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2 opacity-60" />
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">No public reports yet</p>
                      <p className="text-xs text-gray-500 mt-1">This user has not filed any public civic issues.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {reports.map(report => {
                        const isSolved = report.status === 'Solved' || report.status === 'Complete';
                        return (
                          <div
                            key={report.id}
                            onClick={() => {
                              onClose();
                              openPost(report.id);
                            }}
                            className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl cursor-pointer transition-all hover:shadow-sm group"
                          >
                            {report.imageUrl ? (
                              <img
                                src={report.imageUrl}
                                alt={report.title}
                                className="w-14 h-14 rounded-xl object-cover shrink-0 bg-gray-100 dark:bg-gray-700"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                <FileText size={20} />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  isSolved 
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                }`}>
                                  {report.status}
                                </span>
                                <span className="text-[11px] text-gray-500 truncate">
                                  {CATEGORIES[report.category]?.shortName || report.category}
                                </span>
                              </div>
                              <h5 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {report.title}
                              </h5>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <ThumbsUp size={11} /> {report.confirms || 0}
                                </span>
                                <span>•</span>
                                <span>{report.timeAgo || 'Recently'}</span>
                              </div>
                            </div>
                            
                            <ExternalLink size={15} className="text-gray-400 group-hover:text-indigo-600 transition-colors shrink-0 mr-1" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-base font-semibold text-gray-800 dark:text-gray-200">Profile Unavailable</p>
                <p className="text-xs text-gray-500 mt-1">This user profile cannot be displayed or does not exist.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
