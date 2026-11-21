import React, { useState, useEffect } from 'react';
import { ChevronLeft, X, ChevronRight, Send, CheckCircle2, Mail, HelpCircle, ShieldCheck, AlertCircle, Loader2, Clock, MessageSquare } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { api } from '../api';
import { SupportTicket, SupportTopic } from '../types';

const PageHeader = ({ title, onClose, onBack }: { title: string, onClose?: () => void, onBack?: () => void }) => (
  <header className="flex shrink-0 h-14 items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
    <div className="flex items-center">
      {onBack ? (
        <button onClick={onBack} className="p-2 -ml-2 mr-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
      ) : null}
      <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white truncate">{title}</h1>
    </div>
    {onClose && (
      <button onClick={onClose} className="p-2 -mr-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
        <X className="w-6 h-6" />
      </button>
    )}
  </header>
);

export function AboutPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col w-full h-full">
      <PageHeader title="About Civisha" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-3xl mx-auto w-full space-y-10 pb-12">
          <div>
            <span className="inline-block text-xs font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full mb-3">
              Civisha Civic Reporting Platform
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight">
              Citizen-Led Civic Issue Reporting &amp; Public Data Platform
            </h2>
            <p className="mt-4 text-base sm:text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              <strong>Civisha</strong> is a community-powered <strong>civic reporting platform</strong> built to bridge the gap between citizens and local municipal authorities across India. We empower residents to <strong>report civic problems</strong>, verify neighborhood infrastructure issues with community consensus, and transform everyday complaints into transparent, actionable <strong>civic report &amp; data</strong> analytics.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Report Civic Problems Instantly</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Document potholes, road damage, uncollected garbage, overflowing drainage, water supply leaks, streetlight outages, and public safety hazards with live GPS-tagged photo evidence.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Community Verification &amp; Trust</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Unlike unverified social media posts, Civisha uses location-based community verification so local citizens can confirm or dispute reports, creating a reliable Trust Score.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Civic Radar &amp; Open Report Data</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Every verified report feeds into <strong>Civisha Radar</strong> and the <strong>Civic Journal</strong>, providing ward-level heatmaps, state and district rankings, and open civic data on resolution rates.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Ghost Mode Privacy Protection</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Citizens can report sensitive local civic issues anonymously using Ghost Mode while still contributing verified geolocation data to the public accountability record.
              </p>
            </div>
          </div>

          <section className="bg-indigo-50/70 dark:bg-indigo-950/30 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 space-y-3">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Why Open Civic Report &amp; Data Matters</h3>
            <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
              Isolated complaints are easy to overlook, but structured <strong>civic report and data</strong> records create measurable public accountability. By combining citizen reporting, on-ground GPS verification, and live status tracking (Pending, In Progress, Solved), Civisha helps communities, journalists, and civic authorities prioritize the infrastructure problems that matter most.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col w-full h-full">
      <PageHeader title="How Civisha Works" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-3xl mx-auto w-full pb-12">
          <span className="inline-block text-xs font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full mb-3">
            Step-by-Step Civic Guide
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4 tracking-tight">
            How to Report Civic Problems, Verify Issues &amp; Track Public Data
          </h2>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 mb-10 leading-relaxed">
            The <strong>Civisha civic reporting platform</strong> turns local citizen observations into verified public infrastructure data in five transparent steps:
          </p>
          
          <div className="space-y-8">
            <div className="flex gap-4 sm:gap-6 bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60">
              <div className="shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold tracking-tight">1</div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Report a Civic Problem with GPS Photo Proof</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                  Tap the <strong>+ Report</strong> button, capture a real-time photo of the civic issue (garbage dump, broken road, pothole, water leakage, drainage blockage, or street hazard), choose the appropriate category, and tag the location. You can publish under your citizen profile or anonymously via <strong>Ghost Mode</strong>.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 sm:gap-6 bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60">
              <div className="shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold tracking-tight">2</div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">500m Proximity Community Verification</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                  Citizens physically located within a <strong>500-meter radius</strong> of the reported civic problem can tap <strong>Confirm</strong> if the issue is genuine or <strong>False</strong> if it is inaccurate. This location-locked verification prevents spam and builds authentic civic report data.
                </p>
              </div>
            </div>

            <div className="flex gap-4 sm:gap-6 bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60">
              <div className="shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold tracking-tight">3</div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Citizen Trust Score (%) &amp; Priority Ranking</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                  Every report and contributor earns a dynamic <strong>Trust Score (%)</strong> based on community confirmations versus disputes. High-trust reports and upvoted civic issues surface higher on the Home Feed so urgent local problems get immediate attention.
                </p>
              </div>
            </div>

            <div className="flex gap-4 sm:gap-6 bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60">
              <div className="shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold tracking-tight">4</div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Explore Civic Radar &amp; Public Report Data</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                  Visit the <strong>Radar</strong> tab to inspect state-wise and district-wise civic issue heatmaps, card rankings, and downloadable PDF/CSV data tables. Check the <strong>Journal</strong> tab for category analytics, resolution velocity, and public civic datasets.
                </p>
              </div>
            </div>

            <div className="flex gap-4 sm:gap-6 bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60">
              <div className="shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold tracking-tight">5</div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Resolution Proof &amp; Status Updates</h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                  When local authorities or community action resolve an issue, the reporter can upload a location-verified <strong>In Progress</strong> or <strong>Complete / Solved</strong> proof photo within 50 meters, keeping the public civic record accurate from start to finish.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TermsPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col w-full h-full">
      <PageHeader title="Terms & Conditions" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-3xl mx-auto w-full space-y-8 pb-12">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight">Terms &amp; Conditions – Civisha Civic Reporting Platform</h2>
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-2 font-mono uppercase tracking-wider">
              Last Updated: August 2026
            </p>
            <p className="mt-4 text-base text-gray-700 dark:text-gray-300 leading-relaxed">
              By accessing or using the <strong>Civisha civic reporting platform</strong> (&ldquo;Civisha&rdquo; or &ldquo;the App&rdquo;) to report civic problems, verify local issues, or browse public <strong>civic report &amp; data</strong> analytics, you agree to be bound by these Terms &amp; Conditions.
            </p>
          </div>

          <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">1. Description of Civic Reporting &amp; Data Service</h3>
              <p>
                Civisha is a citizen-driven civic-issue reporting and public data platform that enables users across India to report civic problems, verify public infrastructure complaints within 500 meters, and access aggregated civic report &amp; data insights (including sanitation, garbage, road damage, potholes, water supply, electricity, street issues, and public safety concerns).
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">2. Eligibility and Accounts</h3>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>You may use the App with or without creating an account (&ldquo;Ghost Mode&rdquo;).</li>
                <li>If you create an account, you agree to provide accurate information and are responsible for maintaining the security of your login credentials.</li>
                <li>You must be at least 13 years old to create an account.</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">3. User-Submitted Content</h3>
              <p>By submitting a report, photo, comment, or any other content, you confirm that:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>The content is accurate to the best of your knowledge.</li>
                <li>You have the right to share the photo/content you upload.</li>
                <li>The report reflects a real, observed civic issue — not fabricated, misleading, or malicious content.</li>
              </ul>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                We reserve the right to remove any content that violates these Terms, including spam, duplicate reports, or content unrelated to civic issues.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">4. Prohibited Uses</h3>
              <p>You agree not to:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>Submit false, defamatory, or malicious reports.</li>
                <li>Use the platform to harass, target, or falsely accuse any individual.</li>
                <li>Attempt to manipulate verification counts, votes, or trust scores through fake accounts or automated tools.</li>
                <li>Upload content that is illegal, obscene, or infringes on others&apos; rights.</li>
                <li>Use the platform for any purpose other than civic-issue reporting.</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">5. Verification System Disclaimer</h3>
              <p>
                Reports on Civisha are verified through a community-driven, location-based Confirm/False system. This verification reflects community consensus and proximity-based confirmation — it is not a guarantee of factual accuracy. Civisha does not independently investigate or confirm the truth of any report.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">6. Report Status</h3>
              <p>
                Report status (Pending, In Progress, Complete) may be updated by the original submitter with photo proof, or by an administrator. Civisha does not guarantee that any reported issue will be resolved by any government body or third party.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">7. Intellectual Property</h3>
              <p>
                The Civisha name, logo, and platform design are the property of Civisha. Content you submit (photos, reports, comments) remains yours, but by submitting it, you grant Civisha a license to display, distribute, and use that content within the platform for its intended civic-transparency purpose.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">8. Limitation of Liability</h3>
              <p>Civisha is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>The accuracy of user-submitted reports.</li>
                <li>Any action or inaction taken by government bodies based on reports.</li>
                <li>Damages arising from use or inability to use the platform.</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">9. Termination</h3>
              <p>
                We reserve the right to suspend or terminate accounts that violate these Terms, including submitting false reports, abusive behavior, or attempts to manipulate the platform.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">10. Governing Law</h3>
              <p>
                These Terms are governed by the laws of India. Any disputes shall be subject to the jurisdiction of the courts of India.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">11. Changes to These Terms</h3>
              <p>
                We may update these Terms from time to time. Continued use of the App after changes constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">12. Contact Us</h3>
              <p>
                For questions regarding these Terms, contact us at:{' '}
                <a href="mailto:civisha94@gmail.com" className="font-semibold text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-700">
                  civisha94@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

const SUPPORT_TOPICS: SupportTopic[] = [
  'General Help',
  'Report Issue / Moderation',
  'Account & Verification',
  'Bug Report',
  'Feature Suggestion',
  'Privacy / Data Request',
];

const SUPPORT_STATUS_BADGE: Record<string, string> = {
  Open: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  'In Review': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  Resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  Closed: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

export function SupportPage({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<SupportTopic>('General Help');
  const [subject, setSubject] = useState('');
  const [relatedReportId, setRelatedReportId] = useState('');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);
  const [submittedSummary, setSubmittedSummary] = useState<{ subject: string; topic: SupportTopic; email: string } | null>(null);

  const [signedInUid, setSignedInUid] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const loadUserTickets = async (uid: string) => {
    setLoadingTickets(true);
    try {
      const list = await api.getMySupportTickets(uid);
      setMyTickets(list);
    } catch (err) {
      console.warn('Could not load user support tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setSignedInUid(user.uid);
        if (user.email) setEmail((prev) => prev || user.email || '');
        if (user.displayName) setName((prev) => prev || user.displayName || '');
        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.displayName) setName((prev) => prev || data.displayName);
          }
        } catch (_) {}
        loadUserTickets(user.uid);
      } else {
        setSignedInUid(null);
        setMyTickets([]);
      }
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName) {
      setErrorMsg('Please enter your name.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address so we can reply.');
      return;
    }
    if (!trimmedSubject) {
      setErrorMsg('Please enter a subject for your request.');
      return;
    }
    if (trimmedMessage.length < 10) {
      setErrorMsg('Please describe your issue in at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const { ticketId } = await api.submitSupportTicket({
        name: trimmedName,
        email: trimmedEmail,
        topic,
        subject: trimmedSubject,
        message: trimmedMessage,
        relatedReportId: relatedReportId.trim() || undefined,
      });

      setSubmittedTicketId(ticketId);
      setSubmittedSummary({ subject: trimmedSubject, topic, email: trimmedEmail });
      setSubject('');
      setRelatedReportId('');
      setMessage('');

      if (signedInUid) {
        loadUserTickets(signedInUid);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to submit support request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col w-full h-full">
      <PageHeader title="Help & Support" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 bg-gray-50/50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto w-full space-y-8 pb-12">
          {/* Header Intro */}
          <div>
            <span className="inline-block text-xs font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full mb-2">
              Citizen Assistance &amp; Data Desk
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight">
              Help &amp; Support – Civisha Civic Reporting Platform
            </h2>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
              Need assistance to <strong>report a civic problem</strong>, verify a neighborhood issue within 500m, use <strong>Ghost Mode</strong>, or request <strong>civic report &amp; data</strong> moderation? Submit a ticket below and the Civisha team will assist you.
            </p>
          </div>

          {/* Support Form Card or Confirmation Receipt */}
          {submittedTicketId ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 p-6 sm:p-8 shadow-sm space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Support Request Submitted</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Thank you! Your request has been logged and will be reviewed shortly.
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Ticket Reference</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{submittedTicketId}</span>
                </div>
                {submittedSummary && (
                  <>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Topic</span>
                      <span className="font-medium text-gray-900 dark:text-white">{submittedSummary.topic}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Subject</span>
                      <span className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{submittedSummary.subject}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Reply Email</span>
                      <span className="font-medium text-gray-900 dark:text-white">{submittedSummary.email}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedTicketId(null);
                    setSubmittedSummary(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                >
                  Submit Another Request
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-semibold transition-colors"
                >
                  Back to Civisha
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-7 shadow-sm space-y-5"
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Send a Message</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">All fields marked with * are required</p>
                </div>
                <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Topic Selector */}
              <div>
                <label htmlFor="support-topic" className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                  Topic *
                </label>
                <select
                  id="support-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as SupportTopic)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {SUPPORT_TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name & Email Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="support-name" className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                    Your Name *
                  </label>
                  <input
                    id="support-name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Shreyank Kushwaha"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="support-email" className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    id="support-email"
                    type="email"
                    required
                    maxLength={200}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Subject & Optional Report ID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="support-subject" className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                    Subject *
                  </label>
                  <input
                    id="support-subject"
                    type="text"
                    required
                    maxLength={200}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary of your question or issue"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="support-report-id" className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                    Report ID <span className="text-xs font-normal text-gray-400">(Optional)</span>
                  </label>
                  <input
                    id="support-report-id"
                    type="text"
                    maxLength={128}
                    value={relatedReportId}
                    onChange={(e) => setRelatedReportId(e.target.value)}
                    placeholder="p_..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="support-message" className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Message *
                  </label>
                  <span className="text-xs font-mono text-gray-400">{message.length}/3000</span>
                </div>
                <textarea
                  id="support-message"
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please share details, steps to reproduce (if bug), or what help you need..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Direct email:{' '}
                  <a href="mailto:civisha94@gmail.com" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    civisha94@gmail.com
                  </a>
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Signed-in User's Submitted Support Tickets */}
          {signedInUid && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">My Support Requests</h3>
                {loadingTickets && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
              </div>
              {myTickets.length === 0 && !loadingTickets ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 text-sm text-gray-500 dark:text-gray-400">
                  You haven&apos;t submitted any support tickets from this account yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {myTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 space-y-2.5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-gray-900 dark:text-white">{ticket.subject}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            <span className="font-mono">{ticket.id}</span>
                            <span>•</span>
                            <span>{ticket.topic}</span>
                            {ticket.timeAgo && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {ticket.timeAgo}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                            SUPPORT_STATUS_BADGE[ticket.status] || SUPPORT_STATUS_BADGE.Open
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.message}</p>
                      {ticket.adminNote && (
                        <div className="mt-2 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/60 text-xs sm:text-sm">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300 block mb-0.5">Civisha Team Response:</span>
                          <span className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{ticket.adminNote}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Quick Help Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                <HelpCircle className="w-4 h-4" />
                <span>Why can&apos;t I Confirm/False a report?</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Proximity verification requires GPS access and physical presence within 500 meters of the reported issue location.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-2">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>Ghost Mode &amp; Privacy</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Anonymous reports hide your name and handle publicly. For account or data deletion requests, choose &ldquo;Privacy / Data Request&rdquo; above or email{' '}
                <a href="mailto:civisha94@gmail.com" className="text-indigo-600 dark:text-indigo-400 underline">
                  civisha94@gmail.com
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrivacyPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col w-full h-full">
      <PageHeader title="Privacy Policy" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-3xl mx-auto w-full space-y-8 pb-12">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tight">Privacy Policy – Ghost Mode &amp; Civic Data Protection</h2>
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-2 font-mono uppercase tracking-wider">
              Last Updated: 23 August, 2026
            </p>
            <p className="mt-4 text-base text-gray-700 dark:text-gray-300 leading-relaxed">
              This Privacy Policy explains how the <strong>Civisha civic reporting platform</strong> (&ldquo;we,&rdquo; &ldquo;our,&rdquo; &ldquo;the App&rdquo;) collects, uses, and protects your information when you <strong>report a civic problem</strong>, verify local reports, or access public <strong>civic report &amp; data</strong> analytics.
            </p>
          </div>

          <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">1. Information We Collect</h3>
              <div className="space-y-3 pl-1">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Account Information (if you sign up)</h4>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                    <li>Full name, username, email address</li>
                    <li>Profile photo (optional)</li>
                    <li>Authentication data via Google Sign-In (if used)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Location Information</h4>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                    <li>Approximate or precise location when you submit a report or verify a report near you</li>
                    <li>Used to tag reports, calculate distance for the 500-meter verification radius, and show &ldquo;Nearby&rdquo; content</li>
                    <li>Precise coordinates are never shown publicly — only an approximate area is displayed to other users</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Photos and Videos</h4>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                    <li>Images you capture and submit with a report</li>
                    <li>Stored securely via our third-party storage provider (Backblaze B2)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Usage Information</h4>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                    <li>Reports submitted, comments posted, upvotes/verifications given</li>
                    <li>Basic device and app-interaction data for improving the service</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Anonymous (&ldquo;Ghost Mode&rdquo;) Usage</h4>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                    <li>If you use the App without creating an account, we do not collect personally identifiable information</li>
                    <li>A temporary session/device identifier may be used to prevent duplicate votes and to display a Guest ID on comments</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">2. How We Use Your Information</h3>
              <p>We use collected information to:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>Display and organize civic reports on the Feed, Radar, and Map</li>
                <li>Verify report authenticity through the location-based Confirm/False system</li>
                <li>Enable community features like comments and notifications</li>
                <li>Improve app performance and troubleshoot issues</li>
                <li>Communicate with you about your account or reports (if logged in)</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">3. How We Share Information</h3>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                We do not sell your personal data to third parties.
              </p>
              <p>We share limited data only with:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li><strong className="text-gray-900 dark:text-white">Firebase (Google)</strong> — for authentication and database services</li>
                <li><strong className="text-gray-900 dark:text-white">Backblaze B2</strong> — for photo/video storage</li>
                <li><strong className="text-gray-900 dark:text-white">Government or civic bodies</strong> — only in aggregated/anonymized form (e.g., area-level statistics), never individual personal identifiers, unless required by law</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">4. Data Security</h3>
              <p>
                We use industry-standard practices to protect your data, including secure authentication, access-controlled databases, and encrypted connections. However, no system is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">5. Data Retention</h3>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>Report data remains publicly visible as part of the civic record unless deleted by the submitter or removed by moderation.</li>
                <li>Account data is retained as long as your account is active.</li>
                <li>You may request account and associated data deletion by contacting us (see Section 9).</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">6. Your Rights</h3>
              <p>You may:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                <li>Access, edit, or delete your profile information</li>
                <li>Request deletion of your account and associated data</li>
                <li>Withdraw a report you submitted (subject to the app&apos;s Edit/Withdraw rules)</li>
                <li>Use the App anonymously (Ghost Mode) without creating an account</li>
              </ul>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">7. Children&apos;s Privacy</h3>
              <p>
                Civisha is not intended for use by children under 13. We do not knowingly collect data from children under this age.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">8. Changes to This Policy</h3>
              <p>
                We may update this Privacy Policy from time to time. Continued use of the App after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="bg-gray-50 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/60 space-y-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">9. Contact Us</h3>
              <p>
                For privacy-related questions or data-deletion requests, contact us at:{' '}
                <a href="mailto:civisha94@gmail.com" className="font-semibold text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-700">
                  civisha94@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

