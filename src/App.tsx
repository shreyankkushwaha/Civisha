/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { MotionConfig, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { NetworkProvider } from './hooks/NetworkContext';
import { PostProvider } from './hooks/PostContext';
import { ToastProvider } from './components/Toast';
import { GlobalPostDetail } from './components/GlobalPostDetail';
import { Tab } from './types';
import { TopBar } from './components/TopBar';
import { Navigation } from './components/Navigation';
import { HomeFeed } from './components/HomeFeed';
import { ComingSoon } from './components/ComingSoon';
import { NotificationsTab } from './components/NotificationsTab';
import { ProfileTab } from './components/ProfileTab';
import { MenuTab } from './components/MenuTab';
import { AboutPage, HowItWorksPage, SupportPage, TermsPage, PrivacyPage } from './components/InfoPages';
import { OnboardingWalkthrough } from './components/OnboardingWalkthrough';
import { ProfileProvider, usePublicProfile } from './hooks/ProfileContext';
import { PublicProfileModal } from './components/PublicProfileModal';
import { updatePageSEO, resetDefaultSEO } from './utils/seo';

const RadarTab = lazy(() => import('./components/RadarTab').then(m => ({ default: m.RadarTab })));
const JournalTab = lazy(() => import('./components/JournalTab').then(m => ({ default: m.JournalTab })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));

function GlobalProfileModal({ onEditOwnProfile }: { onEditOwnProfile: () => void }) {
  const { selectedUserId, closeUserProfile } = usePublicProfile();
  return (
    <PublicProfileModal
      userId={selectedUserId}
      isOpen={Boolean(selectedUserId)}
      onClose={closeUserProfile}
      onEditOwnProfile={onEditOwnProfile}
    />
  );
}

const INFO_PAGES_SEO: Record<string, { title: string; description: string; path: string; keywords?: string[]; jsonLd?: Record<string, any> }> = {
  about: {
    title: 'About Civisha – Civic Issue Reporting Platform & Public Data',
    description: 'Civisha is India’s citizen-led civic reporting platform to report civic problems, verify local infrastructure issues, and access open civic report & data analytics.',
    path: '/about',
    keywords: [
      'Civisha civic reporting platform',
      'report civic problem',
      'civic report and data',
      'citizen civic accountability India',
      'report potholes garbage water issues',
      'public infrastructure data platform',
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About Civisha – Civic Issue Reporting Platform & Public Data',
      description: 'Citizen-led civic reporting platform to report civic problems, verify community reports, and track public infrastructure report & data analytics.',
    },
  },
  'how-it-works': {
    title: 'How Civisha Works – Report Civic Problems, Verify & Track Data',
    description: 'Learn how to report civic problems on Civisha with live GPS photos, verify neighborhood issues within 500 meters, build your Trust Score, and explore civic report & data insights.',
    path: '/how-it-works',
    keywords: [
      'how to report civic problem',
      'Civisha civic reporting platform guide',
      '500m GPS community verification',
      'civic report and data analytics',
      'Ghost Mode anonymous civic reporting',
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do I report a civic problem on the Civisha civic reporting platform?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Tap the + Report button on Civisha, capture a live GPS-tagged photo of the civic issue (such as potholes, garbage, streetlights, drainage, or water supply), select a category, and submit publicly or in anonymous Ghost Mode.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does 500m community verification and civic report & data tracking work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Citizens physically located within 500 meters of a reported issue can confirm or dispute it. Verified reports power the Civisha Radar heatmap and Civic Journal public data analytics.',
          },
        },
      ],
    },
  },
  support: {
    title: 'Help & Support – Civic Problem Reporting & Data Help Center | Civisha',
    description: 'Get support on the Civisha civic reporting platform for submitting civic problem reports, 500m GPS verification, Ghost Mode privacy, and public report & data inquiries.',
    path: '/support',
    keywords: [
      'Civisha help and support',
      'civic reporting platform support',
      'report civic problem help',
      'civic report data inquiry',
    ],
  },
  terms: {
    title: 'Terms & Conditions – Civic Reporting Platform & Data Standards | Civisha',
    description: 'Review the Terms & Conditions for using the Civisha civic reporting platform, including authentic civic problem reporting rules, 500m verification integrity, and open civic data usage.',
    path: '/terms',
    keywords: [
      'Civisha terms and conditions',
      'civic reporting platform rules',
      'community verification guidelines',
      'civic report data usage terms',
    ],
  },
  privacy: {
    title: 'Privacy Policy – Ghost Mode & Civic Report Data Protection | Civisha',
    description: 'Read how the Civisha civic reporting platform protects citizen privacy, Ghost Mode anonymous civic problem reports, GPS verification coordinates, and public report & data records.',
    path: '/privacy',
    keywords: [
      'Civisha privacy policy',
      'Ghost Mode anonymous civic reporting',
      'civic report data privacy',
      'citizen location protection',
    ],
  },
};

const TAB_SEO: Record<string, { title: string; description: string; path: string; jsonLd?: Record<string, any> }> = {
  home: {
    title: 'Civisha – Civic Issue Reporting & Community Verification',
    description: 'Report, verify, and track local civic issues in real time with community-driven accountability, GPS verification, and civic radar heatmaps.',
    path: '/',
  },
  radar: {
    title: 'Civic Radar Heatmap & Area Intelligence | Civisha',
    description: 'Explore real-time geospatial civic issue clusters, ward priority rankings, and resolution rates across India on Civisha Radar.',
    path: '/radar',
  },
  journal: {
    title: 'Civic Journal & Public Data Analytics | Civisha',
    description: 'Analyze live civic issue datasets, category breakdowns, resolution velocity, and weekly automated civic briefs on Civisha Journal.',
    path: '/journal',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Civisha Public Civic Issues & Resolution Analytics',
      description: 'Real-time community-verified dataset of civic infrastructure issues, sanitation, roads, water, and resolution metrics.',
    },
  },
  menu: {
    title: 'Menu, Guides & Policies | Civisha',
    description: 'Access Civisha documentation, how-it-works guides, citizen support, terms of service, and privacy policy.',
    path: '/menu',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p === '/radar' || p.startsWith('/area/')) return 'radar';
      if (p === '/journal') return 'journal';
      if (p === '/menu') return 'menu';
    }
    return 'home';
  });

  const [activeInfoPage, setActiveInfoPage] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.replace(/^\//, '');
      if (['about', 'how-it-works', 'support', 'terms', 'privacy'].includes(p)) {
        return p;
      }
    }
    return null;
  });

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const isBot =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver ||
        /bot|crawl|spider|slurp|googlebot|bingbot|yandex|duckduckbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|applebot/i.test(
          navigator.userAgent
        ));
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
    const isHomeEntry = currentPath === '/' || currentPath === '';
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding && !isBot && isHomeEntry) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname;
      const clean = p.replace(/^\//, '');
      if (['about', 'how-it-works', 'support', 'terms', 'privacy'].includes(clean)) {
        setActiveInfoPage(clean);
        return;
      }
      setActiveInfoPage(null);
      if (p === '/radar' || p.startsWith('/area/')) setActiveTab('radar');
      else if (p === '/journal') setActiveTab('journal');
      else if (p === '/menu') setActiveTab('menu');
      else setActiveTab('home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = window.location.pathname;
    // Do not overwrite report, user profile, or area detail SEO
    if (p.startsWith('/report/') || p.startsWith('/u/') || p.startsWith('/area/')) {
      return;
    }
    if (activeInfoPage && INFO_PAGES_SEO[activeInfoPage]) {
      const info = INFO_PAGES_SEO[activeInfoPage];
      if (window.location.pathname !== info.path) {
        window.history.pushState({ infoPage: activeInfoPage }, '', info.path);
      }
      updatePageSEO({
        title: info.title,
        description: info.description,
        canonicalPath: info.path,
        keywords: info.keywords,
        jsonLd: info.jsonLd,
      });
      return;
    }
    const tabMeta = TAB_SEO[activeTab];
    if (tabMeta) {
      if (window.location.pathname !== tabMeta.path && !window.location.search) {
        window.history.replaceState({ tab: activeTab }, '', tabMeta.path);
      }
      updatePageSEO({
        title: tabMeta.title,
        description: tabMeta.description,
        canonicalPath: tabMeta.path,
        jsonLd: tabMeta.jsonLd,
      });
    } else {
      resetDefaultSEO();
    }
  }, [activeTab, activeInfoPage]);

  const [accountAlert, setAccountAlert] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.isSuspended || data.isBanned) {
            setAccountAlert(data.isBanned ? 'Your account has been banned by an administrator.' : 'Your account is suspended.');
            await signOut(auth);
          }
        }
      }
    });
    return () => unsub();
  }, []);


  const handleCloseInfoPage = () => {
    setActiveInfoPage(null);
    if (typeof window !== 'undefined') {
      const targetPath = TAB_SEO[activeTab]?.path || '/';
      window.history.pushState({ tab: activeTab }, '', targetPath);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
    <NetworkProvider>
    <ToastProvider>
    <PostProvider>
    <ProfileProvider>
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 selection:bg-indigo-100 dark:selection:bg-indigo-900/30 selection:text-indigo-900 dark:selection:text-indigo-100 overflow-hidden">

      <TopBar 
        onHomeClick={() => { setActiveInfoPage(null); setActiveTab('home'); }}
        onNotificationsClick={() => { setActiveInfoPage(null); setActiveTab('notifications'); }}
        onProfileClick={() => { setActiveInfoPage(null); setActiveTab('profile'); }}
      />
      
      

      {activeInfoPage === 'about' && <AboutPage onClose={handleCloseInfoPage} />}
      {activeInfoPage === 'how-it-works' && <HowItWorksPage onClose={handleCloseInfoPage} />}
      {activeInfoPage === 'support' && <SupportPage onClose={handleCloseInfoPage} />}
      {activeInfoPage === 'terms' && <TermsPage onClose={handleCloseInfoPage} />}
      {activeInfoPage === 'privacy' && <PrivacyPage onClose={handleCloseInfoPage} />}
      {activeInfoPage === 'admin' && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" /></div>}>
          <AdminDashboard onClose={handleCloseInfoPage} />
        </Suspense>
      )}
      
      <div className="flex flex-1 overflow-hidden relative w-full">
        <Navigation
          activeTab={activeTab}
          onTabChange={(t) => { setActiveInfoPage(null); setActiveTab(t); }}
          onOpenInfoPage={(page) => setActiveInfoPage(page)}
        />
        
        <main className="flex-1 h-full overflow-y-auto overflow-x-hidden md:ml-64 pb-20 md:pb-0 w-full">
          <div className="w-full h-full">
            {activeTab === 'home' && <HomeFeed />}
            {activeTab === 'radar' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" /></div>}>
                <RadarTab />
              </Suspense>
            )}
            {(activeTab === 'pahal' || activeTab === 'events') && <ComingSoon title="Pahal" />}
            {activeTab === 'journal' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" /></div>}>
                <JournalTab />
              </Suspense>
            )}
            {activeTab === 'menu' && <MenuTab onSelect={(page) => setActiveInfoPage(page)} />}
            {activeTab === 'profile' && (
              <ProfileTab
                onOpenAdmin={() => setActiveInfoPage('admin')}
                onOpenSupport={() => setActiveInfoPage('support')}
                onOpenInfoPage={(page) => setActiveInfoPage(page)}
              />
            )}
            {activeTab === 'notifications' && <NotificationsTab />}
          </div>
        </main>
      </div>
    </div>
      <GlobalPostDetail />
      <GlobalProfileModal onEditOwnProfile={() => setActiveTab('profile')} />
      <AnimatePresence>
        {accountAlert && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-red-200 dark:border-red-900 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Notice</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{accountAlert}</p>
              <button 
                onClick={() => setAccountAlert(null)}
                className="w-full py-2.5 px-4 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 font-semibold rounded-xl transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {showOnboarding && (
          <OnboardingWalkthrough
            onComplete={() => {
              localStorage.setItem('hasSeenOnboarding', 'true');
              setShowOnboarding(false);
            }}
          />
        )}
      </AnimatePresence>
    </ProfileProvider>
    </PostProvider>
    </ToastProvider>
    </NetworkProvider>
    </MotionConfig>
  );
}
