import React from 'react';
import { X } from 'lucide-react';

interface MenuOverlayProps {
  onClose: () => void;
  onSelect: (page: string) => void;
}

export function MenuOverlay({ onClose, onSelect }: MenuOverlayProps) {
  const items = [
    { id: 'about', label: 'About', href: '/about' },
    { id: 'how-it-works', label: 'How It Works', href: '/how-it-works' },
    { id: 'terms', label: 'Terms & Conditions', href: '/terms' },
    { id: 'privacy', label: 'Privacy Policy', href: '/privacy' },
    { id: 'support', label: 'Community / Support', href: '/support' },
  ];

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop for closing */}
      <div 
        className="absolute inset-0 bg-transparent" 
        onClick={onClose} 
      />
      {/* Dropdown Menu */}
      <div className="absolute top-16 right-4 w-56 bg-white dark:bg-gray-800 shadow-xl rounded-md border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
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
              className={`block text-left font-mono text-sm font-semibold text-gray-800 dark:text-gray-200 px-5 py-4 ${
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
