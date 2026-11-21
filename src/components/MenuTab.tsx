import React from 'react';

interface MenuTabProps {
  onSelect: (page: string) => void;
}

export function MenuTab({ onSelect }: MenuTabProps) {
  const items = [
    { id: 'about', label: 'About', href: '/about' },
    { id: 'how-it-works', label: 'How It Works', href: '/how-it-works' },
    { id: 'terms', label: 'Terms & Conditions', href: '/terms' },
    { id: 'privacy', label: 'Privacy Policy', href: '/privacy' },
    { id: 'support', label: 'Support', href: '/support' },
  ];

  return (
    <div className="w-full h-full flex flex-col p-4 pt-6 bg-gray-50 dark:bg-gray-900">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Menu</h2>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <nav className="flex flex-col">
          {items.map((item, idx) => (
            <a
              key={item.id}
              href={item.href}
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  onSelect(item.id);
                }
              }}
              className={`block text-left font-mono text-base font-semibold text-gray-800 dark:text-gray-200 px-6 py-5 ${
                idx < items.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
              } hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

