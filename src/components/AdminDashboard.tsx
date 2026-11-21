import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Trash2, Shield, Users, FileText, Ban, AlertCircle, AlertTriangle,
  BarChart2, CheckCircle, X, Loader2, RefreshCw, Eye, UserCheck, UserPlus, Settings, MessageSquare
} from 'lucide-react';
import { db, auth, checkIsAdminUser } from '../firebase';
import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { api } from '../api';
import { SupportTicket, SupportTicketStatus } from '../types';
import { usePost } from '../hooks/PostContext';

import { AdminCreateReportModal } from './AdminCreateReportModal';
import { Plus } from 'lucide-react';
import { AdminXPostsTab } from './AdminXPostsTab';
import { AdminAuthoritiesTab } from './AdminAuthoritiesTab';
import { AdminSettingsTab } from './AdminSettingsTab';
import { LazyImage } from './LazyImage';
import { Twitter, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const { openPost } = usePost();
  const [activeTab, setActiveTab] = useState<'analytics' | 'reports' | 'users' | 'support' | 'x-posts' | 'authorities' | 'settings'>('analytics');

  
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [ticketFilterStatus, setTicketFilterStatus] = useState<string>('all');
  const [ticketNotes, setTicketNotes] = useState<Record<string, string>>({});
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters for reports
  const [reportFilterStatus, setReportFilterStatus] = useState<string>('all');
  const [reportFilterCategory, setReportFilterCategory] = useState<string>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [onlyAIFlagged, setOnlyAIFlagged] = useState(false);

  // Before-vs-After AI proof review modal state
  const [reviewingReport, setReviewingReport] = useState<any | null>(null);
  const [isResolvingReview, setIsResolvingReview] = useState(false);

  // Delete modal state
  const [reportToDelete, setReportToDelete] = useState<{ id: string; title: string; imageUrl?: string; imageUrls?: string[] } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  

  // Toast / Feedback State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isCreatingReport, setIsCreatingReport] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    try {
      if (!auth.currentUser) return;
      
      // Verify admin
      const currentUserSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const isUserAdmin = checkIsAdminUser(auth.currentUser, currentUserSnap.data());
      
      if (!isUserAdmin) {
        onClose();
        return;
      }
      setIsAdmin(true);

      const [userDoc, reportsSnap, ticketsData] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'reports')),
        api.getAllSupportTickets().catch(() => [] as SupportTicket[])
      ]);

      const usersData = userDoc.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(usersData);

      const reportsData = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort newest first
      reportsData.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setReports(reportsData);
      setSupportTickets(ticketsData);
      const notesMap: Record<string, string> = {};
      ticketsData.forEach((t) => {
        notesMap[t.id] = t.adminNote || '';
      });
      setTicketNotes(notesMap);

    } catch (e) {
      console.error(e);
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [onClose]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    setIsDeleting(true);
    try {
      await api.deletePost(reportToDelete.id, reportToDelete.imageUrl, reportToDelete.imageUrls);
      setReports(prev => prev.filter(r => r.id !== reportToDelete.id));
      showToast('Report deleted successfully');
      setReportToDelete(null);
    } catch (e: any) {
      console.error('Delete error in admin dashboard:', e);
      showToast(e.message || 'Failed to delete report', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, newStatus: string) => {
    try {
      const clearFlag = ['Complete', 'Solved', 'Pending', 'Rejected'].includes(newStatus);
      const extra = clearFlag ? { needsAdminReview: false, aiReviewNote: '' } : undefined;
      await api.updateReportStatus(reportId, newStatus, extra);
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus, ...(extra || {}) } : r));
      showToast(`Status updated to ${newStatus}`);
    } catch (e: any) {
      console.error(e);
      showToast('Failed to update status', 'error');
    }
  };

  const handleResolveAIReview = async (reportId: string, decision: 'approve' | 'reject' | 'dismiss') => {
    setIsResolvingReview(true);
    try {
      const targetStatus =
        decision === 'approve'
          ? 'Complete'
          : decision === 'reject'
          ? 'Pending'
          : (reviewingReport?.status || 'Under Review');
      await api.updateReportStatus(reportId, targetStatus, {
        needsAdminReview: false,
        aiReviewNote: '',
      });
      setReports(prev =>
        prev.map(r =>
          r.id === reportId
            ? { ...r, status: targetStatus, needsAdminReview: false, aiReviewNote: '' }
            : r
        )
      );
      setReviewingReport(null);
      showToast(
        decision === 'approve'
          ? 'Proof approved — report marked Complete'
          : decision === 'reject'
          ? 'Proof rejected — report returned to Pending'
          : 'AI review flag dismissed'
      );
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Failed to resolve review', 'error');
    } finally {
      setIsResolvingReview(false);
    }
  };

  const handleUserAction = async (userId: string, action: 'suspend' | 'ban' | 'restore') => {
    try {
      const updates = action === 'suspend' 
        ? { isSuspended: true, isBanned: false } 
        : action === 'ban' 
        ? { isSuspended: false, isBanned: true }
        : { isSuspended: false, isBanned: false };
        
      await updateDoc(doc(db, 'users', userId), updates);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
      showToast(`User status updated: ${action}`);
    } catch (e: any) {
      console.error(e);
      showToast('Failed to update user', 'error');
    }
  };

  const handleUpdateTicket = async (ticketId: string, status: SupportTicketStatus, note: string) => {
    setSavingTicketId(ticketId);
    try {
      await api.updateSupportTicket(ticketId, status, note);
      setSupportTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status, adminNote: note } : t));
      showToast(`Ticket updated (${status})`);
    } catch (e: any) {
      console.error(e);
      showToast('Failed to update support ticket', 'error');
    } finally {
      setSavingTicketId(null);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    setSavingTicketId(ticketId);
    try {
      await api.deleteSupportTicket(ticketId);
      setSupportTickets(prev => prev.filter(t => t.id !== ticketId));
      showToast('Support ticket deleted');
    } catch (e: any) {
      console.error(e);
      showToast('Failed to delete ticket', 'error');
    } finally {
      setSavingTicketId(null);
    }
  };

  if (!isAdmin && !loading) {
    return null;
  }

  // Derived Analytics Data
  const totalUsers = users.length;
  const totalReports = reports.length;
  
  const activeUsers = users.filter(u => !u.isBanned && !u.isSuspended).length;
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const newUsers24h = users.filter(u => {
    if (!u.createdAt) return false;
    const timeMs = (u.createdAt.seconds || u.createdAt) * 1000;
    return (now - timeMs) < oneDayMs;
  }).length;
  
  const reportsByStatus = reports.reduce((acc, r) => {
    const st = r.status || 'Pending';
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const reportsByCategory = reports.reduce((acc, r) => {
    const cat = r.category || 'General';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const aiFlaggedCount = reports.filter(r => Boolean(r.needsAdminReview)).length;

  // Filtered Reports
  const filteredReports = reports.filter(r => {
    if (onlyAIFlagged && !r.needsAdminReview) return false;
    if (reportFilterStatus !== 'all' && (r.status || 'Pending') !== reportFilterStatus) return false;
    if (reportFilterCategory !== 'all' && (r.category || 'General') !== reportFilterCategory) return false;
    if (reportSearch && !r.title?.toLowerCase().includes(reportSearch.toLowerCase()) && !r.id?.toLowerCase().includes(reportSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col w-full h-full font-sans"
    >
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center">
          <button onClick={() => { onClose(); }} className="mr-3 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mr-2" />
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Admin Dashboard</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' 
            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden md:flex flex-col py-6">
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('analytics'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'analytics' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <BarChart2 className="w-5 h-5 mr-3" /> Analytics
          </button>
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('reports'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'reports' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <FileText className="w-5 h-5 mr-3" /> Reports Moderation ({reports.length})
          </button>
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('users'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <Users className="w-5 h-5 mr-3" /> User Management ({users.length})
          </button>
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('support'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'support' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <MessageSquare className="w-5 h-5 mr-3" /> Support Tickets ({supportTickets.filter(t => t.status === 'Open').length})
          </button>
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('x-posts'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'x-posts' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <Twitter className="w-5 h-5 mr-3" /> X (Twitter) Posts
          </button>
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('authorities'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'authorities' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <MapPin className="w-5 h-5 mr-3" /> Authority Mapping
          </button>
          <button 
            onClick={() => { triggerHaptic(); setActiveTab('settings'); }}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-r-4 border-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <Settings className="w-5 h-5 mr-3" /> Settings
          </button>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 absolute top-16 left-0 right-0 z-10 overflow-x-auto">
           <button onClick={() => { triggerHaptic(); setActiveTab('analytics'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'analytics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Analytics</button>
           <button onClick={() => { triggerHaptic(); setActiveTab('reports'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'reports' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Reports ({reports.length})</button>
           <button onClick={() => { triggerHaptic(); setActiveTab('users'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'users' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Users ({users.length})</button>
           <button onClick={() => { triggerHaptic(); setActiveTab('support'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'support' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Support ({supportTickets.filter(t => t.status === 'Open').length})</button>
           <button onClick={() => { triggerHaptic(); setActiveTab('x-posts'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'x-posts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>X Posts</button>
           <button onClick={() => { triggerHaptic(); setActiveTab('authorities'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'authorities' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Authorities</button>
           <button onClick={() => { triggerHaptic(); setActiveTab('settings'); }} className={`shrink-0 px-4 py-3 text-sm font-medium text-center border-b-2 ${activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Settings</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 mt-12 md:mt-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              
              {/* Analytics Tab */}
              {activeTab === 'analytics' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">Overview</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 flex items-center shadow-sm">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mr-4">
                          <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Users</div>
                          <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{totalUsers}</div>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 flex items-center shadow-sm">
                        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mr-4">
                          <UserCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Users</div>
                          <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{activeUsers}</div>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 flex items-center shadow-sm">
                        <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mr-4">
                          <UserPlus className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">New (24h)</div>
                          <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{newUsers24h}</div>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 flex items-center shadow-sm">
                        <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mr-4">
                          <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Reports</div>
                          <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{totalReports}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                        <h4 className="font-semibold text-gray-900 dark:text-white tracking-tight">Reports by Status</h4>
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          {Object.entries(reportsByStatus).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{status}</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                        <h4 className="font-semibold text-gray-900 dark:text-white tracking-tight">Reports by Category</h4>
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          {Object.entries(reportsByCategory).map(([cat, count]) => (
                            <div key={cat} className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{cat.replace('_', ' ')}</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reports Tab */}
              {activeTab === 'reports' && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Report Moderation</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage, review status, and permanently delete active or withdrawn reports</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button 
                        onClick={() => setIsCreatingReport(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
                      >
                        <Plus size={16} />
                        Post Report
                      </button>
                      <input 
                        type="text" 
                        placeholder="Search titles or ID..." 
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm w-full sm:w-auto"
                      />
                      <select 
                        value={reportFilterStatus}
                        onChange={(e) => setReportFilterStatus(e.target.value)}
                        className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-medium"
                      >
                        <option value="all">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="Under Review">Under Review</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Solved">Solved</option>
                        <option value="Complete">Complete</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Withdrawn">Withdrawn</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setOnlyAIFlagged(!onlyAIFlagged)}
                        className={`min-h-[40px] px-3.5 py-2 rounded-lg text-sm font-semibold border flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                          onlyAIFlagged
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        }`}
                      >
                        <AlertTriangle size={15} />
                        <span>AI Flagged ({aiFlaggedCount})</span>
                      </button>
                      <select 
                        value={reportFilterCategory}
                        onChange={(e) => setReportFilterCategory(e.target.value)}
                        className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-medium"
                      >
                        <option value="all">All Categories</option>
                        {Object.keys(reportsByCategory).map(cat => (
                           <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Submitter</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status Override</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {filteredReports.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                              No reports found matching your filters.
                            </td>
                          </tr>
                        ) : (
                          filteredReports.map(report => (
                            <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center max-w-xs">
                                  {report.imageUrl ? (
                                    <img src={report.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0 border border-gray-200 dark:border-gray-600" />
                                  ) : (
                                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 shrink-0 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                                      <FileText className="w-5 h-5 text-gray-400" />
                                    </div>
                                  )}
                                  <div className="ml-4 min-w-0">
                                    <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{report.title}</div>
                                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{report.id}</div>
                                      {report.status === 'Withdrawn' && (
                                        <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                          Withdrawn Post
                                        </span>
                                      )}
                                      {report.needsAdminReview && (
                                        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                          <span className="truncate">AI Flagged: {report.aiReviewNote || 'Proof needs verification'}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 capitalize">
                                    {(report.category || 'General').replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                                  {report.isAnonymous ? 'Ghost / Anonymous' : (report.author || 'User')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <select 
                                    value={report.status || 'Pending'}
                                    onChange={(e) => handleUpdateReportStatus(report.id, e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm font-medium"
                                  >
                                    <option value="Pending">Pending</option>
                                    <option value="Under Review">Under Review</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Solved">Solved</option>
                                    <option value="Complete">Complete</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Withdrawn">Withdrawn</option>
                                  </select>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-1">
                                  {(report.needsAdminReview || (Array.isArray(report.statusUpdates) && report.statusUpdates.length > 0)) && (
                                    <button
                                      type="button"
                                      onClick={() => setReviewingReport(report)}
                                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1 ${
                                        report.needsAdminReview
                                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200'
                                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
                                      }`}
                                      title="Compare Before vs After Proof"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>Review Proof</span>
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => openPost(report.id)}
                                    className="text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    title="View Report Details"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => setReportToDelete({ id: report.id, title: report.title, imageUrl: report.imageUrl, imageUrls: report.imageUrls })}
                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete Report Permanently"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Users Tab */}
              {activeTab === 'users' && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">User Management</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage user permissions, suspensions, and restrictions</p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reports</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Joined</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {users.map(user => {
                          const userReportCount = reports.filter(r => r.authorId === user.id).length;
                          return (
                          <tr key={user.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${user.isBanned ? 'bg-red-50/50 dark:bg-red-900/10' : user.isSuspended ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center max-w-xs">
                                <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email || user.id}`} alt="" className="w-10 h-10 object-cover rounded-full shrink-0 border border-gray-200 dark:border-gray-600" />
                                <div className="ml-4 min-w-0">
                                  <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                    {user.displayName || 'Unnamed User'} {user.isAdmin && <Shield className="inline w-3 h-3 text-indigo-500" />}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">{user.email || user.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user.isBanned ? (
                                <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                  Banned
                                </span>
                              ) : user.isSuspended ? (
                                <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                                  Suspended
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                              {userReportCount}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-medium">
                              {user.createdAt ? new Date((user.createdAt.seconds || user.createdAt) * 1000).toLocaleDateString() : "Unknown"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                              {user.isBanned || user.isSuspended ? (
                                <button 
                                  onClick={() => handleUserAction(user.id, 'restore')}
                                  className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 p-2 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                  title="Restore Access"
                                >
                                  Restore
                                </button>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleUserAction(user.id, 'suspend')}
                                    className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 p-2 rounded-md hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                                    title="Suspend User"
                                  >
                                    <AlertCircle className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleUserAction(user.id, 'ban')}
                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Ban User"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


              {activeTab === 'support' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Support Tickets</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Review citizen inquiries, update ticket status, and post responses</p>
                    </div>
                    <select
                      value={ticketFilterStatus}
                      onChange={(e) => setTicketFilterStatus(e.target.value)}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-medium"
                    >
                      <option value="all">All Statuses ({supportTickets.length})</option>
                      <option value="Open">Open</option>
                      <option value="In Review">In Review</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  {(() => {
                    const filteredTickets = supportTickets.filter(
                      (t) => ticketFilterStatus === 'all' || t.status === ticketFilterStatus
                    );
                    if (filteredTickets.length === 0) {
                      return (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                          No support tickets found.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-4">
                        {filteredTickets.map((ticket) => {
                          const currentNote = ticketNotes[ticket.id] ?? ticket.adminNote ?? '';
                          const isBusy = savingTicketId === ticket.id;
                          return (
                            <div key={ticket.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                                      {ticket.topic}
                                    </span>
                                    <span className="text-xs font-mono text-gray-400">{ticket.id}</span>
                                    {ticket.timeAgo && <span className="text-xs text-gray-400">• {ticket.timeAgo}</span>}
                                  </div>
                                  <h4 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{ticket.subject}</h4>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    From <span className="font-semibold text-gray-700 dark:text-gray-300">{ticket.name}</span> (
                                    <a href={`mailto:${ticket.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                      {ticket.email}
                                    </a>
                                    )
                                  </div>
                                  {ticket.relatedReportId && (
                                    <button
                                      type="button"
                                      onClick={() => openPost(ticket.relatedReportId!)}
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline"
                                    >
                                      <Eye className="w-3.5 h-3.5" /> Inspect Report: {ticket.relatedReportId}
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <select
                                    value={ticket.status}
                                    disabled={isBusy}
                                    onChange={(e) => handleUpdateTicket(ticket.id, e.target.value as SupportTicketStatus, currentNote)}
                                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm font-medium"
                                  >
                                    <option value="Open">Open</option>
                                    <option value="In Review">In Review</option>
                                    <option value="Resolved">Resolved</option>
                                    <option value="Closed">Closed</option>
                                  </select>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleDeleteTicket(ticket.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                    title="Delete Ticket"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3.5 rounded-lg border border-gray-100 dark:border-gray-700/60 whitespace-pre-wrap">
                                {ticket.message}
                              </p>

                              <div className="flex flex-col sm:flex-row gap-2">
                                <textarea
                                  rows={2}
                                  maxLength={1000}
                                  value={currentNote}
                                  onChange={(e) => setTicketNotes(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                  placeholder="Write a response visible to the user (if signed in)..."
                                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                                />
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleUpdateTicket(ticket.id, ticket.status, currentNote)}
                                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold self-start sm:self-end disabled:opacity-50 transition-colors"
                                >
                                  {isBusy ? 'Saving...' : 'Save Reply'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeTab === 'x-posts' && (
                <AdminXPostsTab reports={reports} onRefresh={fetchData} loading={loading} />
              )}

              {activeTab === 'authorities' && (
                <AdminAuthoritiesTab />
              )}

              {activeTab === 'settings' && (
                <AdminSettingsTab />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation In-App Modal */}
      {reportToDelete && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Report</h3>
              </div>
              <button 
                onClick={() => { !isDeleting && setReportToDelete(null); }}
                disabled={isDeleting}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Are you sure you want to permanently delete this report?
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                  {reportToDelete.title}
                </p>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {reportToDelete.id}</p>
              </div>
              <p className="text-xs text-red-500 dark:text-red-400 font-medium">
                This will delete the report, its comments subcollection, and any media permanently.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReportToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Before-vs-After AI Proof Review Modal */}
      {reviewingReport && (() => {
        const beforeUrl = reviewingReport.imageUrls?.[0] || reviewingReport.imageUrl || '';
        const latestUpdate = Array.isArray(reviewingReport.statusUpdates) && reviewingReport.statusUpdates.length > 0
          ? reviewingReport.statusUpdates[reviewingReport.statusUpdates.length - 1]
          : null;
        const aiVerif = latestUpdate?.aiVerification;
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !isResolvingReview && setReviewingReport(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto space-y-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Before vs. After Resolution Review</span>
                    <span>·</span>
                    <span>{reviewingReport.status}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1 truncate">
                    {reviewingReport.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {reviewingReport.address || reviewingReport.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingReport(null)}
                  disabled={isResolvingReview}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <div className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                    Before · Original Report Photo
                  </div>
                  <div className="aspect-video bg-black/10">
                    {beforeUrl ? (
                      <LazyImage src={beforeUrl} alt="Before original report" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No original photo</div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <div className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                    After · Submitted Proof Photo
                  </div>
                  <div className="aspect-video bg-black/10">
                    {latestUpdate?.imageUrl ? (
                      <LazyImage src={latestUpdate.imageUrl} alt="After submitted proof" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No proof photo uploaded</div>
                    )}
                  </div>
                </div>
              </div>

              {(aiVerif || reviewingReport.aiReviewNote) && (
                <div className={`rounded-xl border p-4 space-y-2 ${
                  reviewingReport.needsAdminReview
                    ? 'border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20'
                }`}>
                  <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>AI Assessment</span>
                    {aiVerif?.verdict && (
                      <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300">
                        · Verdict: {aiVerif.verdict.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {reviewingReport.aiReviewNote && (
                    <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">
                      <strong>Moderator Note:</strong> {reviewingReport.aiReviewNote}
                    </p>
                  )}
                  {aiVerif?.userMessage && (
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                      <strong>Message Shown to Reporter:</strong> {aiVerif.userMessage}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  disabled={isResolvingReview}
                  onClick={() => handleResolveAIReview(reviewingReport.id, 'dismiss')}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors whitespace-nowrap"
                >
                  Dismiss Flag
                </button>
                <button
                  type="button"
                  disabled={isResolvingReview}
                  onClick={() => handleResolveAIReview(reviewingReport.id, 'reject')}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  Reject Proof (Set Pending)
                </button>
                <button
                  type="button"
                  disabled={isResolvingReview}
                  onClick={() => handleResolveAIReview(reviewingReport.id, 'approve')}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {isResolvingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  <span>Approve &amp; Mark Complete</span>
                </button>
              </div>
            </motion.div>
          </div>
        );
      })()}

      {isCreatingReport && (
        <AdminCreateReportModal 
          onClose={() => setIsCreatingReport(false)}
          onSuccess={() => {
            setIsCreatingReport(false);
            showToast('Report created successfully');
            fetchData();
          }}
        />
      )}
</motion.div>
  );
}
