import React, { useState, useMemo, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Map as MapIcon, LayoutGrid, Table as TableIcon, Filter, ArrowDownUp, Maximize2, Minimize2, ArrowLeft, Download, RefreshCw, MapPin } from 'lucide-react';
import { api } from '../api';
import { INDIA_STATES_AND_DISTRICTS } from '../locations';
import { AreaCard } from './AreaCard';
import { AreaDetailView } from './AreaDetailView';
import { RadarMap } from './RadarMap';
import { ReportPost } from '../types';
import { CustomSelect } from './CustomSelect';
import { useGlobalFeed } from '../hooks/useGlobalFeed';
import { updatePageSEO } from '../utils/seo';

import { CATEGORY_LIST } from '../categories';

type ViewType = 'card' | 'map' | 'table';

const SORT_OPTIONS = ['Top reported', 'Lowest reported'];

export function RadarTab() {
  const [stateFilter, setStateFilter] = useState('All States');
  const [districtFilter, setDistrictFilter] = useState('All Districts');
  const [groupingMode, setGroupingMode] = useState<'state' | 'district'>('state');
  const [viewType, setViewType] = useState<ViewType>('card');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [sortOption, setSortOption] = useState('Top reported');
  const { posts: analyticsPosts, loading } = useGlobalFeed();
  const [displayLimit, setDisplayLimit] = useState(12);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // get districts for selected state
  const availableDistricts = useMemo(() => {
    if (stateFilter === 'All States' || !INDIA_STATES_AND_DISTRICTS[stateFilter]) {
      return [];
    }
    return INDIA_STATES_AND_DISTRICTS[stateFilter];
  }, [stateFilter]);

  const handleStateChange = (newState: string) => {
    setStateFilter(newState);
    setDistrictFilter('All Districts'); // Keep if needed for other components
  };

  const generateCardData = (mode: 'state' | 'district', filter: string) => {
    // Map states/districts to real data if possible
    const statsMap = new Map<string, { total: number, solved: number, pending: number, categories: Record<string, { total: number, solved: number, pending: number }> }>();
    
    // Process real analytics posts
    analyticsPosts.forEach(post => {
      if (categoryFilter !== 'All Categories' && post.category !== categoryFilter) {
        return;
      }
      let assignedState = 'Unknown';
      let assignedDistrict = 'Unknown';
      
      const addr = (post.address || '').toLowerCase();
      
      const checkMatch = (address: string, name: string) => {
        const lowerName = name.toLowerCase();
        if (address.includes(lowerName)) return true;
        if (lowerName.includes('(') && lowerName.includes(')')) {
          const parts = lowerName.split('(');
          const before = parts[0].trim();
          const inside = parts[1].split(')')[0].trim();
          const after = parts[1].split(')')[1]?.trim() || '';
          const withoutParens = `${before} ${after}`.trim();
          if (withoutParens && address.includes(withoutParens)) return true;
          const withInside = `${inside} ${after}`.trim();
          if (withInside && address.includes(withInside)) return true;
          if (inside.length > 3 && address.includes(inside)) return true;
        }
        return false;
      };

      // Attempt to find matching state
      for (const [state, districts] of Object.entries(INDIA_STATES_AND_DISTRICTS)) {
        if (checkMatch(addr, state)) {
          assignedState = state;
        }
        for (const dist of districts) {
           if (checkMatch(addr, dist)) {
             assignedState = state;
             assignedDistrict = dist;
             break;
           }
        }
        if (assignedState !== 'Unknown') break;
      }

      // If no match based on address, we skip or bucket as Unknown
      const key = mode === 'state' ? assignedState : assignedDistrict;
      if (!statsMap.has(key)) {
        statsMap.set(key, { total: 0, solved: 0, pending: 0, categories: {} });
      }
      
      const st = statsMap.get(key)!;
      st.total += 1;
      
      if (!st.categories[post.category]) {
        st.categories[post.category] = { total: 0, solved: 0, pending: 0 };
      }
      const cat = st.categories[post.category];
      cat.total += 1;

      if (post.status === 'Solved' || post.status === 'Complete') {
        st.solved += 1;
        cat.solved += 1;
      } else if (post.status === 'Pending' || post.status === 'In Progress' || post.status === 'Under Review') {
        st.pending += 1;
        cat.pending += 1;
      }
    });

    let list: any[] = [];
    if (mode === 'state') {
      const states = filter === 'All States' ? Object.keys(INDIA_STATES_AND_DISTRICTS) : [filter];
      if (statsMap.has('Unknown')) {
        if (!states.includes('Unknown')) {
          states.push('Unknown');
        }
      }
      
      list = states.map((state, i) => {
        const data = statsMap.get(state) || { total: 0, solved: 0, pending: 0, categories: {} };
        const topCat = Object.entries(data.categories).sort((a: any, b: any) => (b[1]?.total || 0) - (a[1]?.total || 0))[0]?.[0] || 'Unknown';
        return {
          rank: 0,
          areaName: state === 'Unknown' ? 'Unknown Locations' : state,
          stateName: state === 'Unknown' ? 'Unknown' : 'India',
          total: data.total,
          solved: data.solved,
          pending: data.pending,
          topIssue: CATEGORY_LIST.find(c => c.id === topCat)?.shortName || 'None',
          categoryStats: data.categories
        };
      });
    } else {
      let districts: string[] = [];
      if (filter === 'All States') {
        districts = Object.values(INDIA_STATES_AND_DISTRICTS).flat();
      } else {
        districts = INDIA_STATES_AND_DISTRICTS[filter] || [];
      }
      if (statsMap.has('Unknown')) {
        if (!districts.includes('Unknown')) {
          districts.push('Unknown');
        }
      }
      
      list = districts.map((dist, i) => {
        const data = statsMap.get(dist) || { total: 0, solved: 0, pending: 0, categories: {} };
        const topCat = Object.entries(data.categories).sort((a: any, b: any) => (b[1]?.total || 0) - (a[1]?.total || 0))[0]?.[0] || 'Unknown';
        return {
          rank: 0,
          areaName: dist === 'Unknown' ? 'Unknown Locations' : dist,
          stateName: filter === 'All States' ? 'India' : filter,
          total: data.total,
          solved: data.solved,
          pending: data.pending,
          topIssue: CATEGORY_LIST.find(c => c.id === topCat)?.shortName || 'None',
          categoryStats: data.categories
        };
      });
    }
    
    let sortedList = list.filter((item: any) => item.total > 0);
    if (sortOption === 'Top reported') sortedList.sort((a: any, b: any) => b.total - a.total);
    else if (sortOption === 'Lowest reported') sortedList.sort((a: any, b: any) => a.total - b.total);
    return sortedList.map((item: any, i: number) => ({ ...item, rank: i + 1 }));
  };


  const currentCardData = useMemo(() => {
    return generateCardData(groupingMode, stateFilter);
  }, [groupingMode, stateFilter, categoryFilter, analyticsPosts, sortOption]);
  
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
      pdf.save(`radar_${viewType}_${groupingMode}_${stateFilter.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF', e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadCSV = (area: any) => {
    try {
      const rows = [
        ['Area', 'State', 'Rank', 'Total Issues', 'Solved', 'Pending', 'Top Issue'],
        [area.areaName, area.stateName || '', String(area.rank || 0), String(area.total || 0), String(area.solved || 0), String(area.pending || 0), area.topIssue || '']
      ];
      if (area.categoryStats) {
        rows.push([]);
        rows.push(['Category ID', 'Total', 'Solved', 'Pending']);
        Object.entries(area.categoryStats).forEach(([catId, st]: [string, any]) => {
          rows.push([catId, String(st.total || 0), String(st.solved || 0), String(st.pending || 0)]);
        });
      }
      const csvContent = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `civisha_${String(area.areaName).replace(/\s+/g, '_').toLowerCase()}_report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download CSV failed:', err);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !currentCardData.length) return;
    const match = window.location.pathname.match(/^\/area\/([^/]+)/);
    if (match && match[1] && !selectedArea) {
      const targetName = decodeURIComponent(match[1]).trim().toLowerCase();
      const found = currentCardData.find((c: any) => String(c.areaName || '').toLowerCase() === targetName);
      if (found) {
        setSelectedArea(found);
      }
    }
  }, [currentCardData]);

  useEffect(() => {
    if (selectedArea) {
      const areaSlug = encodeURIComponent(selectedArea.areaName);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/area/')) {
        window.history.pushState({ areaName: selectedArea.areaName }, '', `/area/${areaSlug}`);
      }
      const areaDesc = `Track ${selectedArea.total || 0} reported civic issues in ${selectedArea.areaName} (${selectedArea.solved || 0} resolved, ${selectedArea.pending || 0} pending, top issue: ${selectedArea.topIssue || 'General'}) on Civisha Radar.`;
      updatePageSEO({
        title: `${selectedArea.areaName} Civic Issues, Reports & Ward Priority | Civisha`,
        description: areaDesc,
        canonicalPath: `/area/${areaSlug}`,
        type: 'website',
        keywords: [
          `${selectedArea.areaName} civic issues`,
          `${selectedArea.areaName} complaints`,
          selectedArea.topIssue || 'civic report',
          'Civisha Radar',
        ],
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: selectedArea.areaName,
          description: areaDesc,
          url: `${window.location.origin}/area/${areaSlug}`,
        },
      });
    }
  }, [selectedArea]);

  if (selectedArea) {
    return (
      <AreaDetailView
        {...selectedArea}
        onBack={() => {
          setSelectedArea(null);
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/radar');
          }
          updatePageSEO({
            title: 'Civic Radar Heatmap & Area Intelligence | Civisha',
            description: 'Explore real-time geospatial civic issue clusters, ward priority rankings, and resolution rates across India on Civisha Radar.',
            canonicalPath: '/radar',
          });
        }}
        onDownload={() => handleDownloadCSV(selectedArea)}
      />
    );
  }

  return (
    <div className={isFullScreen ? "fixed inset-0 z-[100] flex flex-col h-screen w-screen bg-gray-50 dark:bg-gray-900 overflow-hidden" : "flex flex-col h-full bg-gray-50 dark:bg-gray-900 max-w-7xl mx-auto border-x border-gray-200 dark:border-gray-800 w-full overflow-hidden"}>
      {/* Header and Filters */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 z-[2000] relative space-y-2">
        {/* Row 1: Location & Grouping */}
        <div className="flex flex-row gap-1.5 sm:gap-2 items-center w-full">
          {isFullScreen && (
            <button 
              onClick={() => setIsFullScreen(false)}
              className="p-1.5 -ml-0.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <CustomSelect 
            value={stateFilter}
            onChange={handleStateChange}
            compact
            align="left"
            options={[
              { label: 'All States', shortLabel: 'All States', value: 'All States' },
              ...Object.keys(INDIA_STATES_AND_DISTRICTS).map(state => ({ label: state, value: state }))
            ]}
            label="Select State"
            className="flex-1 min-w-0"
            triggerClassName={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              stateFilter !== 'All States'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-700/80 border-slate-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700'
            }`}
            icon={<MapPin className="w-3.5 h-3.5" />}
          />

          {/* Toggle for State / District */}
          <div className="inline-flex bg-slate-100 dark:bg-slate-700/80 border border-slate-200/80 dark:border-slate-600 rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setGroupingMode('state')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${groupingMode === 'state' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
            >
              State
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode('district')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${groupingMode === 'district' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
            >
              District
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="flex items-center justify-center w-[30px] h-[30px] bg-slate-100 dark:bg-slate-700/80 border border-slate-200/80 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Row 2: Category, Sort, View Type */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <CustomSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              compact
              align="left"
              options={[
                { label: 'All Categories', shortLabel: 'All', value: 'All Categories' },
                ...CATEGORY_LIST.map(cat => ({
                  label: cat.fullName,
                  shortLabel: cat.shortName === 'Street Issues' ? 'Streets' : cat.shortName === 'Infrastructure' ? 'Infra' : cat.shortName,
                  value: cat.id
                }))
              ]}
              label="Filter by Category"
              className="shrink-0 max-w-[110px]"
              triggerClassName={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                categoryFilter !== 'All Categories'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-100 dark:bg-slate-700/80 border-slate-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700'
              }`}
              icon={<Filter className="w-3.5 h-3.5" />}
            />
            
            <CustomSelect
              value={sortOption}
              onChange={setSortOption}
              compact
              align="left"
              options={SORT_OPTIONS.map(opt => ({
                label: opt,
                shortLabel: opt === 'Top reported' ? 'Top' : 'Lowest',
                value: opt
              }))}
              label="Sort By"
              className="shrink-0"
              triggerClassName="flex items-center justify-between bg-slate-100 dark:bg-slate-700/80 border border-slate-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-nowrap hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
              icon={<ArrowDownUp className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="inline-flex bg-slate-100 dark:bg-slate-700/80 border border-slate-200/80 dark:border-slate-600 rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewType('card')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewType === 'card' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5 hidden sm:inline" />
              <span>Card</span>
            </button>
            <button
              type="button"
              onClick={() => setViewType('map')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewType === 'map' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <MapIcon className="w-3.5 h-3.5 hidden sm:inline" />
              <span>Map</span>
            </button>
            <button
              type="button"
              onClick={() => setViewType('table')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewType === 'table' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <TableIcon className="w-3.5 h-3.5 hidden sm:inline" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>
      
      <div ref={contentRef} className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-1.5 sm:p-2.5">
        {loading ? (
          <div className="flex flex-col h-full gap-6 animate-pulse pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <div className="flex-1">
                      <div className="w-1/2 h-4 bg-gray-200 dark:bg-gray-700 rounded-full mb-2" />
                      <div className="w-1/3 h-3 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  </div>
                  <div className="w-full h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
        {viewType === 'card' && (
          <div className="flex flex-col h-full relative">
            <div className="absolute top-0 right-0 z-[10] flex gap-2">
               <button 
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="bg-white/90 dark:bg-gray-700 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:bg-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                title="Download PDF"
              >
                {isGeneratingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
            <div className="pt-11">
            {currentCardData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 py-12">
                <MapIcon className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-lg font-medium text-gray-900 dark:text-white">No data available</p>
                <p className="text-sm mt-1">There are no reports matching the selected filters.</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {currentCardData.slice(0, displayLimit).map(area => (
                  <AreaCard 
                    key={area.areaName}
                    rank={area.rank}
                    areaName={area.areaName}
                    stateName={area.stateName}
                    total={area.total}
                    solved={area.solved}
                    pending={area.pending}
                    topIssue={area.topIssue}
                    onClick={() => setSelectedArea(area)}
                  />
                ))}
              </div>
              
              {/* Infinite Scroll Trigger */}
              {currentCardData.length > displayLimit && (
                <div 
                  className="w-full py-8 flex justify-center"
                  ref={(node) => {
                    if (node) {
                      const observer = new IntersectionObserver(entries => {
                        if (entries[0].isIntersecting) {
                          setDisplayLimit(prev => Math.min(prev + 12, currentCardData.length));
                        }
                      });
                      observer.observe(node);
                      return () => observer.disconnect();
                    }
                  }}
                >
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              </>
            )}
            </div>
          </div>
        )}

        {viewType === 'map' && (
          <div className="w-full h-full min-h-[500px] flex flex-col relative">
            {groupingMode === 'district' && (
              <div className="absolute top-2.5 left-2.5 z-[1000]">
                <button
                  onClick={() => {
                    setStateFilter('All States');
                    setGroupingMode('state');
                  }}
                  className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-white transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to All States
                </button>
              </div>
            )}
            <div className="absolute top-2.5 right-2.5 z-[1000] flex gap-2">
              <button 
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-gray-200 text-gray-600 hover:text-indigo-600 hover:bg-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                title="Download PDF"
              >
                {isGeneratingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
            
            <RadarMap
              groupingMode={groupingMode}
              stateFilter={stateFilter}
              sortOption={sortOption}
              generateCardData={generateCardData}
              onStateSelect={(stateName) => {
                setStateFilter(stateName);
                setGroupingMode('district');
              }}
              onViewDistrict={(area) => setSelectedArea(area)}
            />
          </div>
        )}

        {viewType === 'table' && (
          <div className="w-full h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 pl-2">Data Overview</span>
              <button 
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="bg-white dark:bg-gray-700 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50"
              >
                {isGeneratingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th scope="col" className="px-3 sm:px-6 py-3">Rank</th>
                    <th scope="col" className="px-3 sm:px-6 py-3">Area</th>
                    <th scope="col" className="px-3 sm:px-6 py-3">Total Issues</th>
                    <th scope="col" className="px-3 sm:px-6 py-3 text-green-600 dark:text-green-400">Solved</th>
                    <th scope="col" className="px-3 sm:px-6 py-3 text-red-600 dark:text-red-400">Pending</th>
                    <th scope="col" className="px-3 sm:px-6 py-3">Top Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCardData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        <MapIcon className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                        <p className="text-base font-medium text-gray-900 dark:text-white">No data available</p>
                        <p className="text-sm mt-1">There are no reports matching the selected filters.</p>
                      </td>
                    </tr>
                  ) : (
                    currentCardData.slice(0, displayLimit).map((area, idx) => (
                      <tr key={area.areaName} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/80'}`} onClick={() => setSelectedArea(area)}>
                        <td className="px-3 sm:px-6 py-3.5 sm:py-4 font-bold font-mono text-gray-900 dark:text-white">#{area.rank}</td>
                        <td className="px-3 sm:px-6 py-3.5 sm:py-4 font-medium text-gray-900 dark:text-white">{area.areaName}</td>
                        <td className="px-3 sm:px-6 py-3.5 sm:py-4 font-mono">{area.total}</td>
                        <td className="px-3 sm:px-6 py-3.5 sm:py-4 text-green-600 dark:text-green-400 font-medium font-mono">{area.solved}</td>
                        <td className="px-3 sm:px-6 py-3.5 sm:py-4 text-red-600 dark:text-red-400 font-medium font-mono">{area.pending}</td>
                        <td className="px-3 sm:px-6 py-3.5 sm:py-4">
                          <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium font-mono uppercase tracking-wider px-2.5 py-0.5 rounded">
                            {area.topIssue}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              
              {currentCardData.length > displayLimit && (
                <div 
                  className="w-full py-4 flex justify-center bg-white dark:bg-gray-800"
                  ref={(node) => {
                    if (node) {
                      const observer = new IntersectionObserver(entries => {
                        if (entries[0].isIntersecting) {
                          setDisplayLimit(prev => Math.min(prev + 12, currentCardData.length));
                        }
                      });
                      observer.observe(node);
                      return () => observer.disconnect();
                    }
                  }}
                >
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}