export type Tab = 'home' | 'radar' | 'events' | 'pahal' | 'menu' | 'profile' | 'notifications' | 'journal';

export type CategoryId = 'garbage' | 'roads' | 'infrastructure' | 'street_issues' | 'safety';

export interface CategoryConfig {
  id: CategoryId;
  shortName: string;
  fullName: string;
  example: string;
}

export interface Comment {
  id: string;
  authorId?: string;
  author: string;
  authorAvatar?: string;
  authorHandle?: string;
  text: string;
  timeAgo: string;
  createdAt?: any;
  parentId?: string;
  replies?: Comment[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  handle: string;
  photoURL?: string;
  bio?: string;
  createdAt?: any;
  isAdmin?: boolean;
  isModerator?: boolean;
  isSuspended?: boolean;
  isBanned?: boolean;
  reportCount?: number;
  verificationCount?: number;
}

export type NotificationPriority = 'P0' | 'P1' | 'P2';
export type NotificationType = 
  | 'report_updates'
  | 'verification_activity'
  | 'comments_mentions'
  | 'nearby_reports'
  | 'community_events';

export const NOTIFICATION_CATEGORIES = [
  { id: 'report_updates', label: 'Report Updates', description: 'When the status of a report you submitted changes.' },
  { id: 'verification_activity', label: 'Verification Activity', description: 'Confirmations, false marks, and milestones.' },
  { id: 'comments_mentions', label: 'Comments & Mentions', description: 'New comments on your reports or @mentions.' },
  { id: 'nearby_reports', label: 'Nearby Reports', description: 'When a new report is submitted near you.' },
  { id: 'community_events', label: 'Pahal', description: 'Coming Soon - Action Hub community drives.', disabled: true }
] as const;

export type NotificationPrefKey = typeof NOTIFICATION_CATEGORIES[number]['id'];

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  message: string;
  isRead: boolean;
  timeAgo: string;
  relatedReportId?: string;
  imageUrl?: string;
}

export type NotificationSettings = Record<NotificationPrefKey, boolean>;

export interface ResolutionAIVerification {
  verdict: 'verified' | 'partial' | 'not_resolved' | 'mismatch';
  userMessage: string;
  adminReason: string;
  shouldFlagForAdmin: boolean;
  checkedAt: string;
}

export interface ReportStatusUpdate {
  status: string;
  imageUrl: string;
  timestamp: string;
  aiVerification?: ResolutionAIVerification;
}

export interface ReportPost {
  id: string;
  authorId?: string;
  author: string;
  authorAvatar: string;
  authorHandle?: string;
  isAnonymous?: boolean;
  timeAgo: string;
  createdAt?: any;
  title: string;
  content: string;
  category: CategoryId;
  imageUrl?: string;
  imageUrls?: string[];
  lat: number;
  lng: number;
  address: string;
  status: 'Pending' | 'In Progress' | 'Complete' | 'Under Review' | 'Solved' | 'Rejected' | 'Withdrawn';
  statusUpdates?: ReportStatusUpdate[];
  needsAdminReview?: boolean;
  aiReviewNote?: string;
  trustScore: number;
  confirms: number;
  falses: number;
  upvotes: number;
  confirmUsers?: string[];
  falseUsers?: string[];
  upvoteUsers?: string[];
  comments: Comment[];
}

export type SupportTopic =
  | 'General Help'
  | 'Report Issue / Moderation'
  | 'Account & Verification'
  | 'Bug Report'
  | 'Feature Suggestion'
  | 'Privacy / Data Request';

export type SupportTicketStatus = 'Open' | 'In Review' | 'Resolved' | 'Closed';

export interface SupportTicket {
  id: string;
  userId: string;
  name: string;
  email: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  relatedReportId?: string;
  status: SupportTicketStatus;
  adminNote?: string;
  createdAt?: any;
  updatedAt?: any;
  timeAgo?: string;
}

