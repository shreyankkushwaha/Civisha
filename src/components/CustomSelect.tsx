import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';


interface Option {
  label: string;
  shortLabel?: string;
  value: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
  triggerClassName?: string;
  icon?: React.ReactNode;
  label?: string; // Optional label for mobile sheet header
  compact?: boolean;
  align?: 'left' | 'right';
}

export function CustomSelect({ value, onChange, options, className = '', triggerClassName = '', icon, label = 'Select an option', compact = false, align = 'left' }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];
  const triggerText = selectedOption?.shortLabel ?? selectedOption?.label;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Only close if it's not a mobile touch (mobile uses bottom sheet)
      if (window.innerWidth >= 768 && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOptionClick = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const listContent = (
    <div className="p-1.5 md:p-2 flex flex-col gap-0.5 md:gap-1">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleOptionClick(option.value)}
            className={`flex items-center justify-between w-full px-4 md:px-3 py-3.5 md:py-2.5 text-base md:text-sm rounded-xl md:rounded-lg transition-colors text-left ${
              isSelected
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium'
            }`}
          >
            <span className="truncate">{option.label}</span>
            {isSelected && (
              <Check className="w-5 h-5 md:w-4 md:h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 ml-2" />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); }}
        className={triggerClassName || "flex items-center justify-between w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"}
      >
        <div className={`flex items-center truncate ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {icon && <span className="flex-shrink-0 opacity-80">{icon}</span>}
          <span className={`truncate ${compact ? 'font-semibold' : 'font-medium'}`}>{triggerText}</span>
        </div>
        <ChevronDown className={`${compact ? 'w-3.5 h-3.5 ml-1' : 'w-4 h-4 ml-2'} opacity-70 flex-shrink-0`} />
      </button>

      {/* Desktop Dropdown */}
      {isOpen && (
        <div className={`hidden md:block absolute z-[9999] mt-1.5 min-w-[220px] max-h-64 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg origin-top ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {listContent}
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {isOpen && createPortal(
        <div className="md:hidden fixed inset-0 z-[9999] flex flex-col justify-end">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          <div className="bg-white dark:bg-gray-800 w-full rounded-t-3xl shadow-xl transform transition-transform animate-in slide-in-from-bottom relative z-10 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">{label}</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full bg-gray-50 dark:bg-gray-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto pb-6 pt-2 px-3">
              {listContent}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
