import { useState, useEffect } from 'react';
import { usePost } from '../hooks/PostContext';
import { CheckCircle2, ShieldAlert, FileText, MessageSquare, AtSign, Calendar, MapPin, Users } from 'lucide-react';
import { Notification, NotificationSettings } from '../types';
import { api } from '../api';

export function NotificationsTab() {
  const { openPost } = usePost();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [notifs, sets] = await Promise.all([
          api.getNotifications(),
          api.getSettings()
        ]);
        setNotifications(notifs);
        setSettings(sets);
      } catch (e) {
        console.error('Failed to load notifications data', e);
      }
    };
    fetchData();
  }, []);

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      const unread = notifications.filter(n => !n.isRead);
      await Promise.all(unread.map(n => api.markNotificationRead(n.id)));
    } catch (e) {
      console.error('Failed to mark all as read', e);
    }
  };

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await api.markNotificationRead(id);
    } catch (e) {
      console.error('Failed to mark read', e);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'report_updates': return <FileText className="text-amber-500" size={20} />;
      case 'verification_activity': return <CheckCircle2 className="text-blue-500" size={20} />;
      case 'comments_mentions': return <MessageSquare className="text-indigo-500" size={20} />;
      case 'nearby_reports': return <MapPin className="text-green-500" size={20} />;
      case 'community_events': return <Users className="text-purple-500" size={20} />;
      default: return <ShieldAlert className="text-gray-500" size={20} />;
    }
  };

  const getPriorityStyle = (priority: Notification['priority'], isRead: boolean) => {
    if (isRead) return 'bg-white dark:bg-gray-800 opacity-70';
    switch (priority) {
      case 'P0': return 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500';
      case 'P1': return 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500';
      case 'P2': return 'bg-gray-50 dark:bg-gray-800/80 border-l-4 border-gray-300 dark:border-gray-600';
      default: return 'bg-white dark:bg-gray-800';
    }
  };

  if (!settings) {
    return <div className="flex justify-center p-8"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>;
  }

  const filteredNotifications = notifications.filter(n => {
    return settings[n.type];
  });

  return (
    <div className="mx-auto max-w-2xl bg-white dark:bg-gray-900 h-full relative">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 px-4 py-3 backdrop-blur-md">
        <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">Notifications</h2>
        <button onClick={markAllRead} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300">
          Mark all read
        </button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {filteredNotifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No notifications yet.</div>
        ) : (
          filteredNotifications.map(notification => (
            <div 
              key={notification.id} 
              onClick={() => {
                if (!notification.isRead) markRead(notification.id);
                if (notification.relatedReportId) openPost(notification.relatedReportId);
              }}
              className={`p-4 transition-colors ${!notification.isRead ? 'cursor-pointer' : ''} ${getPriorityStyle(notification.priority, notification.isRead)}`}
            >
              <div className="flex gap-3">
                <div className="mt-1 flex-shrink-0">
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <p className={`text-sm ${notification.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100 font-medium'}`}>
                      {notification.message}
                    </p>
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">{notification.timeAgo}</span>
                  </div>
                  {notification.imageUrl && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <img src={notification.imageUrl} alt="Resolution" className="w-full h-32 object-cover" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=600'; e.currentTarget.onerror = null; }} />
                    </div>
                  )}
                  {notification.priority === 'P0' && !notification.isRead && (
                    <span className="mt-2 inline-block px-2 py-0.5 text-xs font-bold font-mono uppercase tracking-wider bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded">
                      Critical Alert
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
