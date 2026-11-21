import React from 'react';

export interface AreaCardProps {
  key?: React.Key;
  rank: number;
  areaName: string;
  stateName: string;
  total: number;
  solved: number;
  pending: number;
  topIssue: string;
  onClick?: () => void;
}

export function AreaCard({
  rank,
  areaName,
  stateName,
  total,
  solved,
  pending,
  topIssue,
  onClick,
}: AreaCardProps) {
  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-5 hover:shadow-md transition-shadow cursor-pointer relative group"
    >
      {/* 1. Top row */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="bg-gray-900 dark:bg-gray-700 text-white text-xs font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded">
              #{rank}
            </span>
            <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white leading-tight">{areaName}</h3>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stateName}</span>
        </div>
      </div>

      {/* 2. Stats row */}
      <div className="grid grid-cols-3 gap-4 border-y border-gray-100 dark:border-gray-700 py-4">
        <div className="flex flex-col">
          <span className="text-xs font-medium font-mono text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Total</span>
          <span className="text-xl font-bold font-mono tracking-tight text-gray-800 dark:text-gray-200">{total}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium font-mono text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Solved</span>
          <span className="text-xl font-bold font-mono tracking-tight text-green-600 dark:text-green-400">{solved}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium font-mono text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Pending</span>
          <span className="text-xl font-bold font-mono tracking-tight text-red-600 dark:text-red-400">{pending}</span>
        </div>
      </div>

      {/* 3. Bottom row */}
      <div className="flex justify-between items-center pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Top Issue</span>
          <span className="text-xs font-semibold font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full">
            {topIssue}
          </span>
        </div>
      </div>
    </div>
  );
}
