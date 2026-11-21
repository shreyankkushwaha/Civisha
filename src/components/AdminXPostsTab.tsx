import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { Loader2, RefreshCw, X, Twitter, AlertCircle, CheckCircle } from 'lucide-react';
import { ReportPost } from '../types';

interface AdminXPostsTabProps {
  reports: any[];
  onRefresh: () => void;
  loading: boolean;
}

export function AdminXPostsTab({ reports, onRefresh, loading }: AdminXPostsTabProps) {
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [suggestedAuthority, setSuggestedAuthority] = useState('');
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const fetchAuthorities = async () => {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const snap = await getDocs(collection(db, 'x_authorities'));
        const authData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAuthorities(authData);
      } catch (e) {
        console.error('Failed to load authorities', e);
      }
    };
    fetchAuthorities();
  }, []);

  const handleGenerate = async (report: any) => {
    setIsGenerating(true);
    setGeneratedText('');
    setSuggestedAuthority('');
    
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/x/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: report.title,
          content: report.content,
          category: report.category,
          location: report.address || 'Unknown Location',
          authorities: authorities.filter(a => a.active !== false)
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setGeneratedText(data.text);
      setSuggestedAuthority(data.suggestedAuthorityHandle || '');
      
      // Save it to the report document
      await updateDoc(doc(db, 'reports', report.id), {
        xPostText: data.text,
        xPostAuthority: data.suggestedAuthorityHandle || '',
        xPostStatus: 'Ready for review'
      });
      
      showToast('X Post generated successfully');
      onRefresh();
    } catch (e: any) {
      showToast(e.message || 'Failed to generate', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedReport) return;
    setIsPublishing(true);
    
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const finalTweetText = `${generatedText}\n${suggestedAuthority ? suggestedAuthority : ''}`.trim();

      await updateDoc(doc(db, 'reports', selectedReport.id), {
        xPostStatus: 'Publishing'
      });
      onRefresh();

      const response = await fetch('/api/x/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: finalTweetText,
          imageUrl: selectedReport.imageUrl,
          reportId: selectedReport.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        await updateDoc(doc(db, 'reports', selectedReport.id), {
          xPostStatus: 'Failed',
          xPostError: data.error || 'Unknown error'
        });
        throw new Error(data.error || 'Failed to publish');
      }

      await updateDoc(doc(db, 'reports', selectedReport.id), {
        xPostStatus: 'Published',
        xPostId: data.xPostId,
        xPostError: null
      });
      
      showToast(data.simulated ? 'Simulated successfully (API Payment Required)' : 'Successfully published to X!');
      setSelectedReport(null);
      onRefresh();
    } catch (e: any) {
      showToast(e.message || 'Failed to publish', 'error');
      onRefresh();
    } finally {
      setIsPublishing(false);
    }
  };

  const eligibleReports = reports.filter(r => r.status !== 'Rejected' && r.status !== 'Withdrawn');

  return (
    <div className="animate-in fade-in duration-300">
      {toast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' 
            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">X (Twitter) Posts</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Generate and review automatic posts to connected X account</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">X Status</th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {eligibleReports.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  No eligible reports found.
                </td>
              </tr>
            ) : (
              eligibleReports.map(report => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center max-w-sm">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{report.title}</div>
                        <div className="text-xs text-gray-500 truncate">{report.category} • {report.address || 'No location'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {report.xPostStatus === 'Published' ? (
                      <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-blue-100 text-blue-800">
                        Published
                      </span>
                    ) : report.xPostStatus === 'Failed' ? (
                      <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-red-100 text-red-800">
                        Failed
                      </span>
                    ) : report.xPostStatus === 'Publishing' ? (
                      <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-gray-100 text-gray-800">
                        Publishing...
                      </span>
                    ) : report.xPostStatus === 'Ready for review' ? (
                      <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-amber-100 text-amber-800">
                        Ready for review
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-gray-100 text-gray-500">
                        Not prepared
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {report.xPostStatus === 'Published' ? (
                      report.xPostId?.startsWith('simulated_') ? (
                        <span className="text-gray-500 font-medium px-2 py-1 bg-gray-100 rounded-md text-xs">Simulated Post</span>
                      ) : (
                        <a 
                          href={`https://x.com/i/web/status/${report.xPostId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Post
                        </a>
                      )
                    ) : (
                      <button 
                        onClick={() => {
                          setSelectedReport(report);
                          setGeneratedText(report.xPostText || '');
                          setSuggestedAuthority(report.xPostAuthority || '');
                        }}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium px-3 py-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                      >
                        {report.xPostStatus === 'Ready for review' || report.xPostStatus === 'Failed' ? 'Review & Publish' : 'Prepare Post'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedReport && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
              <div className="flex items-center gap-2.5">
                <Twitter className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Prepare X Post</h3>
              </div>
              <button onClick={() => setSelectedReport(null)} className="text-gray-400 hover:text-gray-600 p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedReport.xPostError && (
              <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm border border-red-200">
                <span className="font-bold">Previous Publish Failed:</span> {selectedReport.xPostError}
              </div>
            )}

            {!generatedText && !isGenerating ? (
              <div className="py-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  No post has been prepared yet for this issue. Click below to generate a concise post and find the best authority mention using AI.
                </p>
                <button
                  onClick={() => handleGenerate(selectedReport)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                >
                  Generate Post
                </button>
              </div>
            ) : isGenerating ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-sm text-gray-500 font-medium">Analyzing issue & generating post...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Post Text</label>
                  <textarea
                    value={generatedText}
                    onChange={(e) => setGeneratedText(e.target.value)}
                    className="w-full h-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    maxLength={280}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Authority Mention</label>
                  <input
                    type="text"
                    value={suggestedAuthority}
                    onChange={(e) => setSuggestedAuthority(e.target.value)}
                    placeholder="@handle"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                
                {selectedReport.imageUrl && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attached Image</label>
                    <img src={selectedReport.imageUrl} alt="Attached to post" className="h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-600" />
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                  <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">
                    <AlertCircle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                    This will publish the issue to the connected Civisha X account.
                  </p>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => handleGenerate(selectedReport)}
                    className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1.5"
                    disabled={isPublishing}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        updateDoc(doc(db, 'reports', selectedReport.id), {
                          xPostText: generatedText,
                          xPostAuthority: suggestedAuthority
                        });
                        setSelectedReport(null);
                        showToast('Draft saved successfully');
                      }}
                      disabled={isPublishing}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Save Draft
                    </button>
                    <button
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-900 rounded-lg flex items-center gap-1.5 shadow-sm"
                    >
                      {isPublishing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
                      ) : (
                        <><Twitter className="w-4 h-4" /> Approve & Publish</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
