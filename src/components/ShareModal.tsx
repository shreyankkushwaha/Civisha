import { X, Copy, Check, PenLine, Share2, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';
import { api } from '../api';
import { ReportPost } from '../types';
import { CATEGORIES } from '../categories';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  post?: ReportPost | null;
}

export function ShareModal({ isOpen, onClose, postId, post }: ShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPost, setCopiedPost] = useState(false);
  const [aiPostText, setAiPostText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAiPostText('');
      setAiError(null);
      setIsGenerating(false);
      setCopiedLink(false);
      setCopiedPost(false);
    }
  }, [isOpen, postId]);

  if (!isOpen) return null;

  const url = `${window.location.origin}/report/${postId}`;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopyLink = async () => {
    triggerHaptic();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.error('Copy link failed:', e);
    }
  };

  const handleNativeShareLink = async () => {
    if (!canNativeShare) return;
    triggerHaptic();
    try {
      await navigator.share({
        title: post?.title || 'Check out this civic report on Civisha',
        url,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('cancel')) return;
      console.error('Native share failed:', err);
    }
  };

  const handleGenerateAIPost = async () => {
    if (isGenerating) return;
    triggerHaptic();
    setIsGenerating(true);
    setAiError(null);
    try {
      const categoryLabel = post?.category
        ? (CATEGORIES[post.category]?.fullName || post.category)
        : 'Civic Issue';
      const result = await api.generateSharePostWithAI({
        title: post?.title || 'Civic Issue Report',
        content: post?.content || '',
        category: categoryLabel,
        address: post?.address || '',
        status: post?.status || 'Pending',
        confirms: post?.confirms || 0,
        upvotes: post?.upvotes || 0,
        reportUrl: url,
      });
      setAiPostText(result.postText);
    } catch (err: any) {
      setAiError(err?.message || 'Could not write social post. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyAIPost = async () => {
    if (!aiPostText.trim()) return;
    triggerHaptic();
    try {
      await navigator.clipboard.writeText(aiPostText);
      setCopiedPost(true);
      setTimeout(() => setCopiedPost(false), 2000);
    } catch (e) {
      console.error('Copy AI post failed:', e);
    }
  };

  const handleNativeShareAIPost = async () => {
    if (!canNativeShare || !aiPostText.trim()) return;
    triggerHaptic();
    try {
      await navigator.share({
        title: post?.title || 'Civisha Civic Report',
        text: aiPostText,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('cancel')) return;
      console.error('Native share post failed:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-5 shadow-xl border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">Share Report</h3>
            {post?.title && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px] mt-0.5">
                {post.title}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Direct Link Copy & Native Share */}
        <div className="space-y-2.5 mb-5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-xs text-gray-600 dark:text-gray-300 font-mono truncate">
              {url}
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              title="Copy report link"
              className="min-w-[44px] min-h-[44px] px-3.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShareLink}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-gray-800 dark:text-gray-100 text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Share2 size={16} />
              <span>Share Link via Device</span>
            </button>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">AI Social Post Writer</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Write a ready-to-share English post for any social platform.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateAIPost}
              disabled={isGenerating}
              title="Write social media post with AI"
              className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Writing...</span>
                </>
              ) : aiPostText ? (
                <>
                  <RotateCcw size={14} />
                  <span>Rewrite</span>
                </>
              ) : (
                <>
                  <PenLine size={15} />
                  <span>Write Post</span>
                </>
              )}
            </button>
          </div>

          {aiError && (
            <div className="flex items-start gap-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-3">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {aiPostText && (
            <div className="space-y-3">
              <textarea
                value={aiPostText}
                onChange={(e) => setAiPostText(e.target.value)}
                rows={7}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm text-gray-900 dark:text-gray-100 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyAIPost}
                  className="flex-1 min-h-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 whitespace-nowrap"
                >
                  {copiedPost ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedPost ? 'Post Copied' : 'Copy Post'}</span>
                </button>
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={handleNativeShareAIPost}
                    className="flex-1 min-h-[44px] px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-95 whitespace-nowrap"
                  >
                    <Share2 size={16} />
                    <span>Share Post</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
