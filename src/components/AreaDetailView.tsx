import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { ArrowLeft, Download, FileText, CheckCircle, Clock } from 'lucide-react';
import { CATEGORY_LIST } from '../categories';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useToast } from './Toast';

interface AreaDetailViewProps {
  areaName: string;
  stateName: string;
  total: number;
  solved: number;
  pending: number;
  categoryStats?: Record<string, { total: number, solved: number, pending: number }>;
  onBack: () => void;
  onDownload: () => void;
}

export function AreaDetailView({
  areaName,
  stateName,
  total,
  solved,
  pending,
  categoryStats = {},
  onBack,
  onDownload,
}: AreaDetailViewProps) {
  // We need a ref to capture the shareable snapshot
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();
  
  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;
    setIsGeneratingPdf(true);
    
    try {
      const target = contentRef.current;
      const originalOverflow = target.style.overflow;
      const originalHeight = target.style.height;
      const originalScrollTop = target.scrollTop;
      
      // Temporarily expand the container to fit all content
      target.style.overflow = 'visible';
      target.style.height = 'max-content';
      
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: document.documentElement.classList.contains('dark') ? '#111827' : '#f9fafb',
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight,
        scrollY: -window.scrollY
      });
      
      // Restore original styles
      target.style.overflow = originalOverflow;
      target.style.height = originalHeight;
      target.scrollTop = originalScrollTop;
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`details_${areaName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF', e);
      toast('Failed to generate PDF', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShare = async () => {
    const shareText = `${areaName} (${stateName}) Civic Report — Total: ${total}, Solved: ${solved}, Pending: ${pending}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${areaName} Civic Report | Civisha`,
          text: shareText,
          url: window.location.origin
        });
        return;
      }
      await navigator.clipboard.writeText(`${shareText} - ${window.location.origin}`);
      toast('Area summary copied to clipboard!', 'success');
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('Share canceled') || err.message?.includes('Share cancelled')) {
        return;
      }
      console.error('Error sharing:', err);
    }
  };

  const chartData = useMemo(() => {
    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    return CATEGORY_LIST.map((category, index) => {
      const catData = categoryStats[category.id] || { total: 0 };
      return {
        name: category.shortName,
        value: catData.total,
        color: COLORS[index % COLORS.length]
      };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [categoryStats]);

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Top Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{areaName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{stateName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <span>Share</span>
          </button>
          <button 
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isGeneratingPdf ? 'Generating...' : 'PDF'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full" ref={contentRef}>
        {/* Stats Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8 overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700">
            <div className="p-4 sm:p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-2 sm:mb-3">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 font-mono uppercase tracking-wider mb-0.5 sm:mb-1">Total Reports</p>
              <p className="text-xl sm:text-3xl font-bold font-mono tracking-tight text-gray-900 dark:text-white">{total}</p>
            </div>
            
            <div className="p-4 sm:p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 mb-2 sm:mb-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <p className="text-xs font-bold text-green-600/70 dark:text-green-400/70 font-mono uppercase tracking-wider mb-0.5 sm:mb-1">Solved</p>
              <p className="text-xl sm:text-3xl font-bold font-mono tracking-tight text-green-600 dark:text-green-400">{solved}</p>
            </div>
            
            <div className="p-4 sm:p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 mb-2 sm:mb-3">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <p className="text-xs font-bold text-red-600/70 dark:text-red-400/70 font-mono uppercase tracking-wider mb-0.5 sm:mb-1">Pending</p>
              <p className="text-xl sm:text-3xl font-bold font-mono tracking-tight text-red-600 dark:text-red-400">{pending}</p>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-4">Category Breakdown</h3>
        
        {chartData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-8 p-6 flex items-center justify-center h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-8">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {CATEGORY_LIST.map((category, index) => {
              const catData = categoryStats[category.id] || { total: 0, solved: 0, pending: 0 };
              const baseCount = catData.total;
              const catSolved = catData.solved;
              const catPending = catData.pending;
              const sharePercent = total > 0 ? Math.round((baseCount / total) * 100) : 0;
              
              if (baseCount === 0) return null;

              return (
                <div key={category.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex-1 min-w-[200px]">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white">{category.fullName}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden max-w-[120px]">
                        <div className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full" style={{ width: `${sharePercent}%` }}></div>
                      </div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{sharePercent}% share</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 sm:gap-8 justify-between sm:justify-end">
                    <div className="text-center min-w-[60px]">
                      <div className="text-xs font-bold text-gray-400 dark:text-gray-500 font-mono uppercase tracking-wider mb-1">Total</div>
                      <div className="text-lg font-bold font-mono tracking-tight text-gray-800 dark:text-gray-200">{baseCount}</div>
                    </div>
                    
                    <div className="text-center min-w-[60px]">
                      <div className="text-xs font-bold text-green-600/70 dark:text-green-400/70 font-mono uppercase tracking-wider mb-1">Solved</div>
                      <div className="text-lg font-bold font-mono tracking-tight text-green-600 dark:text-green-400">{catSolved}</div>
                    </div>
                    
                    <div className="text-center min-w-[60px]">
                      <div className="text-xs font-bold text-red-600/70 dark:text-red-400/70 font-mono uppercase tracking-wider mb-1">Pending</div>
                      <div className="text-lg font-bold font-mono tracking-tight text-red-600 dark:text-red-400">{catPending}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
