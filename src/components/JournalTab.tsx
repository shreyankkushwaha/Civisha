import React, { useState, useEffect } from 'react';
import { Search, ArrowLeft, Share2, Copy, ExternalLink, ChevronRight, Check } from 'lucide-react';
import { LazyImage } from './LazyImage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

type JournalCategory = 'Latest' | 'Explainers' | 'Reports' | 'Notices' | 'Statements' | 'Ground Reports' | 'Civisha Brief';

interface Article {
  id: string;
  category: JournalCategory;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  readTime: string;
  imageUrl: string;
  imageCaption: string;
  content: React.ReactNode;
}

// Sample Data
const ARTICLES: Article[] = [
  {
    id: '1',
    category: 'Explainers',
    title: 'How changes to municipal tender timelines impact neighborhood oversight',
    subtitle: 'Why reducing the public consultation window from 30 days to 10 days makes citizen verification more critical than ever.',
    author: 'Civisha Editorial Desk',
    date: '24 August 2026',
    readTime: '8 min read',
    imageUrl: 'https://images.unsplash.com/photo-1541888062947-062e7b39922e?auto=format&fit=crop&q=80&w=1200',
    imageCaption: 'Photo: Civisha / Source',
    content: (
      <>
        <p className="mb-6 text-gray-800 dark:text-gray-200 leading-relaxed text-lg">
          Across major urban wards, municipal transparency depends on how early residents learn about road, drainage, and sanitation contracts before construction begins on the ground.
        </p>
        
        <h2 className="text-2xl font-bold mt-10 mb-4 text-gray-900 dark:text-white font-serif">What happened?</h2>
        <p className="mb-6 text-gray-800 dark:text-gray-200 leading-relaxed text-lg">
          Following the recent civic body elections, a series of notifications were issued amending the 
          public consultation framework for urban infrastructure projects. Citizens previously had a 30-day 
          window to raise objections to new tenders over ₹50 crore. Under the new directive, this has been 
          reduced to 10 days, severely limiting community oversight.
        </p>

        <div className="my-8 border border-gray-200 dark:border-gray-800 p-6 bg-white dark:bg-gray-900 shadow-sm">
          <p className="text-sm font-semibold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-3">Key Takeaway</p>
          <p className="text-xl font-medium text-gray-900 dark:text-white leading-snug">
            The reduction in the consultation window from 30 days to 10 days drastically reduces the ability of 
            local residents to review and object to large-scale infrastructure projects in their neighborhoods.
          </p>
        </div>

        <h2 className="text-2xl font-bold mt-10 mb-4 text-gray-900 dark:text-white font-serif">The Timeline</h2>
        <div className="my-8 relative pl-6 border-l border-gray-300 dark:border-gray-700">
          <div className="mb-6 relative">
            <div className="absolute w-3 h-3 bg-gray-900 dark:bg-white rounded-full -left-[1.9rem] top-1.5"></div>
            <p className="font-semibold text-gray-900 dark:text-white mb-1">12 June</p>
            <p className="text-gray-700 dark:text-gray-300">Initial notification drafted by the urban development committee.</p>
          </div>
          <div className="mb-6 relative">
            <div className="absolute w-3 h-3 bg-gray-900 dark:bg-white rounded-full -left-[1.9rem] top-1.5"></div>
            <p className="font-semibold text-gray-900 dark:text-white mb-1">18 June</p>
            <p className="text-gray-700 dark:text-gray-300">Public representatives raise concerns during the general assembly session.</p>
          </div>
          <div className="relative">
            <div className="absolute w-3 h-3 bg-gray-900 dark:bg-white rounded-full -left-[1.9rem] top-1.5"></div>
            <p className="font-semibold text-gray-900 dark:text-white mb-1">24 June</p>
            <p className="text-gray-700 dark:text-gray-300">Official order passed without amendments, taking immediate effect.</p>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold mt-10 mb-4 text-gray-900 dark:text-white font-serif">What this means</h2>
        <p className="mb-6 text-gray-800 dark:text-gray-200 leading-relaxed text-lg">
          For everyday citizens, this places the burden of vigilance almost entirely on organized civic groups. 
          Without a centralized and easily accessible portal for these tenders, tracking new proposals within a 
          10-day timeframe becomes nearly impossible for a layperson.
        </p>

        <div className="my-10 flex flex-col items-center">
          <span className="text-5xl font-light text-gray-900 dark:text-white mb-2">₹450 crore</span>
          <span className="text-sm text-gray-500 uppercase tracking-wider">Total value of tenders affected in Q3</span>
        </div>
      </>
    )
  },
  {
    id: '2',
    category: 'Reports',
    title: 'The state of municipal water supply in the northern wards',
    subtitle: 'A comprehensive review of water pressure issues reported over the last six months.',
    author: 'Civisha Editorial Desk',
    date: '20 August 2026',
    readTime: '12 min read',
    imageUrl: 'https://images.unsplash.com/photo-1545243424-0ce743321e11?auto=format&fit=crop&q=80&w=800',
    imageCaption: 'Photo: Civisha / Source',
    content: <p className="text-lg text-gray-800 dark:text-gray-200 leading-relaxed">Over the past six months, residents across northern wards documented recurring low-pressure water supply and pipeline leaks through community-verified civic reports. Cross-checking ground submissions revealed that aging distribution valves and unscheduled road excavations accounted for over 68% of supply disruptions.</p>
  },
  {
    id: '3',
    category: 'Notices',
    title: 'Road closure advisory for central district',
    subtitle: 'Upcoming metro construction works will divert traffic on main arterial routes.',
    author: 'Civisha Public Information',
    date: '18 August 2026',
    readTime: '3 min read',
    imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=800',
    imageCaption: 'Photo: Civisha / Source',
    content: <p className="text-lg text-gray-800 dark:text-gray-200 leading-relaxed">Commuters are advised that Phase-2 metro corridor utility shifting will restrict heavy vehicle movement along central arterial roads between 10:00 PM and 6:00 AM this week. Local traffic police have designated alternative diversions via Ring Road.</p>
  },
  {
    id: '4',
    category: 'Explainers',
    title: 'Understanding the new property tax assessment framework',
    subtitle: 'Breaking down the capital-value based system and how it impacts homeowners.',
    author: 'Civisha Editorial Desk',
    date: '15 August 2026',
    readTime: '7 min read',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800',
    imageCaption: 'Photo: Civisha / Source',
    content: <p className="text-lg text-gray-800 dark:text-gray-200 leading-relaxed">Municipal corporations transitioning to the Capital Value System (CVS) calculate property tax based on guidance value rather than annual rental value. Here is how ward infrastructure classifications and age-of-building rebates affect residential homeowners.</p>
  }
];

const CATEGORIES: JournalCategory[] = [
  'Latest', 'Explainers', 'Reports', 'Notices', 'Statements', 'Ground Reports', 'Civisha Brief'
];

export function JournalTab() {
  const [view, setView] = useState<'home' | 'category' | 'article'>('home');
  const [activeCategory, setActiveCategory] = useState<JournalCategory>('Latest');
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [enableJournalTab, setEnableJournalTab] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'app_settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEnableJournalTab(docSnap.data().enableJournalTab || false);
        }
      } catch (err) {
        console.error("Error fetching journal config:", err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (view === 'article') {
      const handleScroll = () => {
        const articleElement = document.getElementById('article-content');
        if (articleElement) {
          const totalHeight = articleElement.clientHeight;
          const windowHeight = window.innerHeight;
          const scrollY = window.scrollY || document.documentElement.scrollTop;
          
          // Calculate progress based on the article's position
          const articleTop = articleElement.offsetTop;
          
          let progress = 0;
          if (scrollY > articleTop) {
            progress = ((scrollY - articleTop) / (totalHeight - windowHeight)) * 100;
          }
          
          setReadingProgress(Math.min(100, Math.max(0, progress)));
        }
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [view]);

  const handleOpenArticle = (article: Article) => {
    setActiveArticle(article);
    setView('article');
    window.scrollTo(0, 0);
  };

  const handleOpenCategory = (cat: JournalCategory) => {
    setActiveCategory(cat);
    setView(cat === 'Latest' ? 'home' : 'category');
    window.scrollTo(0, 0);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loadingConfig) {
    return <div className="w-full h-full flex items-center justify-center bg-[#fcfcfa] dark:bg-gray-950"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div></div>;
  }

  if (!enableJournalTab) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#fcfcfa] dark:bg-gray-950 p-6 text-center">
        <h2 className="text-2xl font-bold font-serif text-gray-900 dark:text-white mb-2">Coming Soon</h2>
        <p className="text-gray-500 max-w-md">This feature is under development. Please check back later for the latest updates and reports from Civisha Journal.</p>
      </div>
    );
  }

  const renderSearch = () => {
    if (!searchOpen) return null;
    return (
      <div className="fixed inset-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 md:py-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1 flex items-center border-b-2 border-gray-900 dark:border-white pb-2">
              <Search className="h-6 w-6 text-gray-400 mr-3" />
              <input 
                type="text" 
                placeholder="Search Civisha Journal" 
                className="w-full bg-transparent text-xl md:text-3xl font-serif text-gray-900 dark:text-white outline-none placeholder-gray-400"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setSearchOpen(false)}
              className="ml-6 text-gray-500 hover:text-gray-900 dark:hover:text-white uppercase tracking-widest text-sm font-semibold"
            >
              Close
            </button>
          </div>
          
          {!searchQuery && (
            <div className="mt-12">
              <h3 className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-6">Popular Topics</h3>
              <div className="flex flex-wrap gap-3">
                {['Explainers', 'Reports', 'Notices', 'Infrastructure', 'Water'].map(topic => (
                  <button key={topic} onClick={() => setSearchQuery(topic)} className="px-5 py-2 border border-gray-200 dark:border-gray-800 rounded-full text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-white transition-colors">
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchQuery && (
            <div className="mt-12">
              <h3 className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-6">Search Results</h3>
              <div className="space-y-6">
                {ARTICLES.filter(a =>
                  a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.category.toLowerCase().includes(searchQuery.toLowerCase())
                ).map(article => (
                  <div
                    key={article.id}
                    onClick={() => { setSearchOpen(false); handleOpenArticle(article); }}
                    className="p-4 border border-gray-200 dark:border-gray-800 hover:border-indigo-500 cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">{article.category}</span>
                    <h4 className="text-xl font-serif font-bold text-gray-900 dark:text-white mt-1">{article.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{article.subtitle}</p>
                  </div>
                ))}
                {ARTICLES.filter(a =>
                  a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.category.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 && (
                  <p className="text-gray-500 text-lg">No articles found matching "{searchQuery}".</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHome = () => {
    const featured = ARTICLES[0];
    const latest = ARTICLES.slice(1);

    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 pb-24 md:pb-12 bg-[#fcfcfa] dark:bg-gray-950 min-h-screen">
        
        {/* Journal Header */}
        <div className="flex justify-between items-start mb-16 md:mb-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
              JOURNAL
            </h1>
            <h2 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-200 mb-6 font-light leading-snug">
              Understanding issues.<br/>Documenting what matters.
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
              Civisha's editorial desk covering public issues, civic accountability, rights, governance and important developments.
            </p>
          </div>
          <button 
            onClick={() => setSearchOpen(true)}
            className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Search className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Section Divider */}
        <div className="flex items-center mb-10">
          <h3 className="text-sm font-bold tracking-widest text-gray-900 dark:text-white uppercase mr-4">LATEST</h3>
          <div className="h-[1px] flex-1 bg-gray-200 dark:bg-gray-800"></div>
        </div>

        {/* Featured Story - Split Layout on Desktop */}
        <div 
          className="group cursor-pointer mb-16 md:mb-24 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          onClick={() => handleOpenArticle(featured)}
        >
          <div className="flex flex-col lg:flex-row h-full">
            <div className="lg:w-3/5 relative overflow-hidden aspect-[4/3] lg:aspect-auto">
              <img 
                src={featured.imageUrl} 
                alt={featured.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <div className="lg:w-2/5 p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-4 md:mb-6 block">
                {featured.category}
              </span>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-gray-900 dark:text-white leading-tight mb-4 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                {featured.title}
              </h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 md:mb-10 leading-relaxed">
                {featured.subtitle}
              </p>
              
              <div className="mt-auto pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{featured.author}</p>
                  <p className="text-xs text-gray-500 mt-1">{featured.readTime} · {featured.date}</p>
                </div>
                <div className="text-indigo-600 dark:text-indigo-400 font-medium text-sm flex items-center">
                  Read story <ChevronRight className="h-4 w-4 ml-1" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Header */}
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-sm font-bold tracking-widest text-gray-900 dark:text-white uppercase">MORE LATEST STORIES</h3>
          <button onClick={() => handleOpenCategory('Explainers')} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 flex items-center">
            View all <ChevronRight className="h-4 w-4 ml-1" />
          </button>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {latest.map(article => (
            <div 
              key={article.id} 
              className="group cursor-pointer flex flex-col"
              onClick={() => handleOpenArticle(article)}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100 mb-4 border border-gray-100 dark:border-gray-800">
                <img 
                  src={article.imageUrl} 
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <span className="text-xs font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-2">
                {article.category}
              </span>
              <h4 className="text-xl font-serif font-bold text-gray-900 dark:text-white leading-tight mb-2 group-hover:text-indigo-700 transition-colors">
                {article.title}
              </h4>
              <div className="mt-auto pt-4 flex items-center text-xs text-gray-500">
                <span>{article.readTime}</span>
                <span className="mx-2">·</span>
                <span>{article.date}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    );
  };

  const renderCategory = () => {
    const categoryArticles = ARTICLES.filter(a => a.category === activeCategory || activeCategory === 'Latest');

    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 pb-24 md:pb-12 bg-[#fcfcfa] dark:bg-gray-950 min-h-screen">
        <div className="flex items-center mb-12">
          <button 
            onClick={() => setView('home')}
            className="mr-4 p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-3xl font-serif font-bold text-gray-900 dark:text-white uppercase tracking-tight">
            {activeCategory}
          </h1>
        </div>

        <div className="max-w-2xl mb-16">
          <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed font-light">
            Clear context on issues that affect citizens and public life.
          </p>
        </div>

        <div className="w-full h-[1px] bg-gray-200 dark:bg-gray-800 mb-10"></div>

        <div className="flex items-center justify-between mb-12">
          <button 
            onClick={() => setSearchOpen(true)}
            className="flex-1 max-w-sm flex items-center px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 text-sm hover:border-gray-400 transition-colors"
          >
            <Search className="h-4 w-4 mr-3" />
            Search {activeCategory}...
          </button>
          <div className="hidden md:flex gap-6 ml-4">
            <button className="text-sm font-bold text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white pb-1">Latest</button>
            <button className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white pb-1">Popular</button>
            <button className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white pb-1">All</button>
          </div>
        </div>

        {/* Large Editorial List */}
        <div className="space-y-12 md:space-y-16">
          {categoryArticles.map((article, idx) => (
            <div key={article.id}>
              <div 
                className="group cursor-pointer flex flex-col md:flex-row gap-6 md:gap-10 items-start"
                onClick={() => handleOpenArticle(article)}
              >
                <div className="w-full md:w-2/5 aspect-[4/3] md:aspect-[4/3] overflow-hidden bg-gray-100 border border-gray-100 dark:border-gray-800 shrink-0">
                  <img 
                    src={article.imageUrl} 
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex-1 flex flex-col">
                  <span className="text-xs font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-3">
                    {article.category}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-gray-900 dark:text-white leading-tight mb-4 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-lg text-gray-600 dark:text-gray-300 mb-6 line-clamp-3 leading-relaxed">
                    {article.subtitle}
                  </p>
                  <div className="mt-auto flex items-center text-xs text-gray-500 font-medium">
                    <span>{article.readTime}</span>
                    <span className="mx-2">·</span>
                    <span>{article.date}</span>
                  </div>
                </div>
              </div>
              {idx < categoryArticles.length - 1 && (
                <div className="w-full h-[1px] bg-gray-100 dark:bg-gray-800 mt-12 md:mt-16"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderArticle = () => {
    if (!activeArticle) return null;

    return (
      <div className="w-full bg-[#fcfcfa] dark:bg-gray-950 min-h-screen relative pb-24">
        
        {/* Sticky reading bar (Mobile & Desktop when scrolled) */}
        <div className={`fixed top-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 transition-transform duration-300 ${readingProgress > 5 ? 'translate-y-0' : '-translate-y-full'}`}>
          <div className="h-1 bg-gray-100 dark:bg-gray-800 w-full absolute top-0 left-0">
            <div className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-100 ease-out" style={{ width: `${readingProgress}%` }}></div>
          </div>
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <button 
              onClick={() => {setView('home'); window.scrollTo(0,0);}}
              className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline line-clamp-1 max-w-[200px]">{activeArticle.title}</span>
              <span className="sm:hidden">Back</span>
            </button>
            <div className="flex items-center gap-3">
              <button onClick={handleCopyLink} className="p-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={handleCopyLink} className="p-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100" title="Share link">
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 md:py-16 pt-24 md:pt-24">
          
          <button 
            onClick={() => {setView('home'); window.scrollTo(0,0);}}
            className="mb-10 flex items-center text-sm font-bold tracking-widest uppercase text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Journal
          </button>

          <span className="text-xs font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-4 block">
            {activeArticle.category}
          </span>
          
          <h1 className="text-4xl md:text-5xl lg:text-[64px] font-serif font-bold text-gray-900 dark:text-white leading-[1.1] mb-6 md:mb-8 tracking-tight">
            {activeArticle.title}
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 leading-relaxed font-light mb-10 md:mb-12">
            {activeArticle.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center border-t border-gray-200 dark:border-gray-800 pt-6 pb-10">
            <div className="flex items-center mb-4 sm:mb-0">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-700 flex items-center justify-center font-serif font-bold text-xl mr-4">
                C
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{activeArticle.author}</p>
                <p className="text-xs text-gray-500 mt-1">Civisha Editorial</p>
              </div>
            </div>
            <div className="sm:ml-auto flex items-center text-sm text-gray-500">
              <span>{activeArticle.date}</span>
              <span className="mx-3">·</span>
              <span>{activeArticle.readTime}</span>
            </div>
          </div>
        </div>

        {/* Hero Image - Wide but constrained */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-12 md:mb-16">
          <div className="aspect-[16/9] w-full bg-gray-100 overflow-hidden">
            <img src={activeArticle.imageUrl} alt={activeArticle.title} className="w-full h-full object-cover" />
          </div>
          <p className="text-right text-xs text-gray-500 mt-3 font-medium">{activeArticle.imageCaption}</p>
        </div>

        {/* Article Content */}
        <div id="article-content" className="max-w-[720px] mx-auto px-4 sm:px-6">
          <div className="font-sans max-w-none text-gray-900 dark:text-gray-100">
            {activeArticle.content}
          </div>

          <div className="mt-20 pt-10 border-t border-gray-200 dark:border-gray-800">
            <div className="bg-gray-50 dark:bg-gray-900/50 p-8 border border-gray-200 dark:border-gray-800 text-center mb-16">
              <h4 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">About this story</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-medium">Published by Civisha Journal</p>
              <p className="text-sm text-gray-500">This article is based on publicly available documents and sources compiled by the Civisha editorial team.</p>
            </div>

            <h4 className="text-sm font-bold tracking-widest text-gray-900 dark:text-white uppercase mb-6 border-b border-gray-200 dark:border-gray-800 pb-2">Sources</h4>
            <div className="space-y-4 mb-16">
              <div className="flex items-start">
                <span className="text-xs font-bold text-gray-400 w-8 pt-1">01</span>
                <a href="#" className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 transition-colors flex items-center">
                  Official notification document <ExternalLink className="h-3 w-3 ml-2 text-gray-400" />
                </a>
              </div>
              <div className="flex items-start">
                <span className="text-xs font-bold text-gray-400 w-8 pt-1">02</span>
                <a href="#" className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 transition-colors flex items-center">
                  Court order summary <ExternalLink className="h-3 w-3 ml-2 text-gray-400" />
                </a>
              </div>
              <div className="flex items-start">
                <span className="text-xs font-bold text-gray-400 w-8 pt-1">03</span>
                <a href="#" className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 transition-colors flex items-center">
                  Government data portal extracts <ExternalLink className="h-3 w-3 ml-2 text-gray-400" />
                </a>
              </div>
            </div>

            <h4 className="text-sm font-bold tracking-widest text-gray-900 dark:text-white uppercase mb-6 border-b border-gray-200 dark:border-gray-800 pb-2">Share</h4>
            <div className="flex gap-4">
              <button 
                onClick={handleCopyLink}
                className="flex items-center px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {copied ? <Check className="h-4 w-4 mr-2 text-green-600" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>

        {/* More from Journal */}
        <div className="mt-24 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h4 className="text-sm font-bold tracking-widest text-gray-900 dark:text-white uppercase mb-10 text-center">More from Civisha Journal</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {ARTICLES.slice(1, 4).map(article => (
                <div 
                  key={article.id} 
                  className="group cursor-pointer"
                  onClick={() => handleOpenArticle(article)}
                >
                  <span className="text-xs font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-2 block">
                    {article.category}
                  </span>
                  <h5 className="text-lg font-serif font-bold text-gray-900 dark:text-white leading-tight mb-2 group-hover:text-indigo-700 transition-colors line-clamp-3">
                    {article.title}
                  </h5>
                  <p className="text-xs text-gray-500">{article.date}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    );
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[#fcfcfa] dark:bg-gray-950 font-sans">
      
      {/* Category Navigation - Horizontal scroll on mobile */}
      {view !== 'article' && (
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex overflow-x-auto py-3 no-scrollbar space-x-6 md:space-x-8">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => handleOpenCategory(cat)}
                  className={`whitespace-nowrap text-sm font-bold tracking-wide uppercase transition-colors pt-1 pb-2 border-b-2 ${
                    activeCategory === cat 
                      ? 'text-gray-900 dark:text-white border-gray-900 dark:border-white' 
                      : 'text-gray-500 border-transparent hover:text-gray-900 dark:hover:text-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'home' && renderHome()}
      {view === 'category' && renderCategory()}
      {view === 'article' && renderArticle()}
      
      {renderSearch()}
    </div>
  );
}
