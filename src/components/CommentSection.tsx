import { useState } from 'react';
import { Send, Reply, ChevronDown, ChevronUp } from 'lucide-react';
import { Comment } from '../types';
import { auth } from '../firebase';
import { usePublicProfile } from '../hooks/ProfileContext';

interface CommentSectionProps {
  comments: Comment[];
  postId: string;
  onAddComment: (text: string, parentId?: string) => void;
}

interface CommentItemProps {
  key?: string | number;
  comment: Comment;
  onReply: (text: string, parentId?: string) => void;
}

function CommentItem({ 
  comment, 
  onReply 
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplies, setShowReplies] = useState(true);
  const { openUserProfile } = usePublicProfile();

  const handleReplySubmit = () => {
    if (replyText.trim()) {
      onReply(replyText, comment.id);
      setReplyText('');
      setIsReplying(false);
      setShowReplies(true);
    }
  };

  const isClickable = Boolean(comment.authorId && comment.authorId !== 'guest' && !comment.authorId.startsWith('Guest_') && !comment.authorId.startsWith('u_'));

  return (
    <div className="relative pt-3 text-sm">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => isClickable && openUserProfile(comment.authorId!)}
          disabled={!isClickable}
          className="shrink-0 focus:outline-none disabled:cursor-default"
          title={isClickable ? `View ${comment.author}'s profile` : comment.author}
        >
          {comment.authorAvatar ? (
            <img
              src={comment.authorAvatar}
              alt={comment.author}
              className="h-8 w-8 rounded-full object-cover bg-indigo-50 dark:bg-gray-800 border border-indigo-100 dark:border-indigo-900/50 hover:opacity-90 transition-opacity"
              onError={(e) => {
                e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorId || comment.author}`;
                e.currentTarget.onerror = null;
              }}
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 font-bold text-indigo-700 dark:text-indigo-400">
              {comment.author.charAt(0).toUpperCase()}
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="rounded-2xl rounded-tl-none bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => isClickable && openUserProfile(comment.authorId!)}
                disabled={!isClickable}
                className="flex flex-col items-start text-left focus:outline-none disabled:cursor-default group/cname min-w-0"
              >
                <span className="font-bold text-gray-900 dark:text-white group-hover/cname:text-indigo-600 dark:group-hover/cname:text-indigo-400 transition-colors truncate max-w-full leading-tight">
                  {comment.author}
                </span>
                {comment.authorHandle && (
                  <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500 truncate max-w-full leading-tight">
                    @{comment.authorHandle.replace(/^@/, '')}
                  </span>
                )}
              </button>
              <span className="text-xs font-mono uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
                {comment.timeAgo}
              </span>
            </div>
            <p className="mt-1 text-gray-700 dark:text-gray-300 break-words">{comment.text}</p>
          </div>
          
          <div className="mt-1 ml-2 flex items-center gap-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <button onClick={() => setIsReplying(!isReplying)} className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400">
              <Reply size={14} /> Reply
            </button>
            {comment.replies && comment.replies.length > 0 && (
              <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200">
                {showReplies ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 
                {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>

          {isReplying && (
            <div className="mt-3 flex items-center gap-2 pr-4">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-bold text-gray-600 dark:text-gray-300 text-xs overflow-hidden">
                {auth.currentUser?.photoURL ? (
                  <img src={auth.currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
                ) : (
                  'Me'
                )}
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={`Reply to ${comment.author}...`}
                  autoFocus
                  maxLength={2000}
                  className="w-full rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 pr-8 text-xs focus:border-indigo-500 focus:outline-none dark:text-white"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReplySubmit()}
                />
                <button 
                  onClick={handleReplySubmit}
                  disabled={!replyText.trim()}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {showReplies && comment.replies && comment.replies.length > 0 && (
            <div className="mt-3 relative before:absolute before:left-[-1.25rem] before:top-0 before:h-full before:w-px before:bg-gray-200 dark:before:bg-gray-700 pl-4 space-y-3">
              {comment.replies.map(reply => (
                <CommentItem key={reply.id} comment={reply} onReply={onReply} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentSection({ comments, postId, onAddComment }: CommentSectionProps) {
  const [newCommentText, setNewCommentText] = useState('');

  const handleSubmit = () => {
    if (newCommentText.trim()) {
      onAddComment(newCommentText);
      setNewCommentText('');
    }
  };

  return (
    <div className="mt-4 border-t border-gray-50 dark:border-gray-800 pt-4">
      <div className="space-y-1">
        {comments.map(comment => (
          <CommentItem key={comment.id} comment={comment} onReply={onAddComment} />
        ))}
        {comments.length === 0 && (
          <div className="py-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet. Be the first!</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-gray-800 overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300">
          {auth.currentUser?.photoURL ? (
            <img src={auth.currentUser.photoURL} alt="Me" className="w-full h-full object-cover" />
          ) : (
            'Me'
          )}
        </div>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Add a comment..."
            maxLength={2000}
            className="w-full rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 pr-10 text-sm focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none transition-colors dark:text-white"
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button 
            onClick={handleSubmit}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            disabled={!newCommentText.trim()}
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
