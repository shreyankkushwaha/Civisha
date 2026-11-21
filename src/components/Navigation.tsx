import { Tab } from '../types';
import { Home, Radar, Sparkles, BookOpen } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onOpenInfoPage?: (page: string) => void;
}

export function Navigation({ activeTab, onTabChange, onOpenInfoPage }: NavigationProps) {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home, href: '/' },
    { id: 'radar', label: 'Radar', icon: Radar, href: '/radar' },
    { id: 'pahal', label: 'Pahal', icon: Sparkles, href: null },
    { id: 'journal', label: 'Journal', icon: BookOpen, href: '/journal' },
  ] as const;

  const infoLinks = [
    { id: 'about', label: 'About', href: '/about' },
    { id: 'how-it-works', label: 'How It Works', href: '/how-it-works' },
    { id: 'support', label: 'Support', href: '/support' },
    { id: 'privacy', label: 'Privacy', href: '/privacy' },
    { id: 'terms', label: 'Terms', href: '/terms' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pb-safe pt-2 md:bottom-auto md:left-0 md:top-14 md:h-[calc(100vh-3.5rem)] md:w-64 md:border-r md:border-t-0 md:pt-4 md:flex md:flex-col md:justify-between w-full">
      <div className="flex justify-around md:flex-col md:gap-2 md:px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const className = `flex flex-col items-center gap-1 rounded-xl p-2 transition-colors md:flex-row md:gap-3 md:px-4 md:py-3 ${
            isActive
              ? 'text-indigo-600 dark:text-indigo-400 md:bg-indigo-50 dark:md:bg-indigo-900/30'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 md:hover:bg-gray-50 dark:md:hover:bg-gray-800'
          }`;

          if (tab.href) {
            return (
              <a
                key={tab.id}
                href={tab.href}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    triggerHaptic();
                    onTabChange(tab.id as Tab);
                  }
                }}
                className={className}
              >
                <Icon className="h-5 w-5 md:h-6 md:w-6" />
                <span className={`text-xs font-medium md:text-sm ${isActive ? 'font-semibold' : ''}`}>
                  {tab.label}
                </span>
              </a>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => {
                triggerHaptic();
                onTabChange(tab.id as Tab);
              }}
              className={className}
            >
              <Icon className="h-5 w-5 md:h-6 md:w-6" />
              <span className={`text-xs font-medium md:text-sm ${isActive ? 'font-semibold' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="hidden md:flex flex-wrap gap-x-3 gap-y-1.5 px-6 py-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
        {infoLinks.map((link) => (
          <a
            key={link.id}
            href={link.href}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && onOpenInfoPage) {
                e.preventDefault();
                onOpenInfoPage(link.id);
              }
            }}
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
