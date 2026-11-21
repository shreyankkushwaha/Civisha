import { Bell, User, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  onHomeClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
}

export function TopBar({ onHomeClick, onNotificationsClick, onProfileClick }: TopBarProps) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;
    const setupListener = (userId: string) => {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('isRead', '==', false)
      );
      
      unsubscribe = onSnapshot(q, (snapshot) => {
        setHasUnread(!snapshot.empty);
      });
    };

    const authUnsub = auth.onAuthStateChanged(user => {
      if (unsubscribe) unsubscribe();
      if (user) {
        setupListener(user.uid);
      } else {
        setHasUnread(false);
      }
    });

    return () => {
      authUnsub();
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 px-4 backdrop-blur-md w-full">
      <a
        href="/"
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            onHomeClick?.();
          }
        }}
        className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white hover:opacity-80 transition-opacity focus:outline-none"
      >
        Civisha
      </a>
      
      <div className="flex items-center gap-2 sm:gap-3">
        <PWAInstallButton />

        <button 
          onClick={() => window.dispatchEvent(new Event('openReportModal'))} 
          className="flex items-center gap-1.5 bg-indigo-600 dark:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-sm font-semibold shadow hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors active:scale-95 mr-1"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Report</span>
        </button>

        <button 
          onClick={onNotificationsClick}
          className="relative rounded-full p-2 text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
        >
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"></span>
          )}
        </button>

        <button 
          onClick={onProfileClick}
          className="rounded-full p-2 text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
        >
          <User className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
