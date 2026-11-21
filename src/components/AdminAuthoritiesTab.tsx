import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Loader2, Plus, Edit2, Trash2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { CATEGORIES, CATEGORY_LIST } from '../categories';
import { CategoryId } from '../types';

export function AdminAuthoritiesTab() {
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    xHandle: '',
    category: 'all',
    location: '',
    active: true,
    priority: 0
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAuthorities = async () => {
    try {
      const snap = await getDocs(collection(db, 'x_authorities'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAuthorities(data.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0)));
    } catch (e) {
      console.error(e);
      showToast('Failed to load authorities', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthorities();
  }, []);

  const handleSave = async () => {
    try {
      if (!formData.name || !formData.xHandle) {
        throw new Error('Name and X/Twitter Handle are required');
      }

      if (isEditing) {
        await updateDoc(doc(db, 'x_authorities', isEditing.id), formData);
        showToast('Authority updated');
      } else {
        await addDoc(collection(db, 'x_authorities'), formData);
        showToast('Authority created');
      }
      
      setIsEditing(null);
      setIsCreating(false);
      fetchAuthorities();
    } catch (e: any) {
      showToast(e.message || 'Failed to save', 'error');
    }
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'x_authorities', id));
      showToast('Authority deleted');
      setDeletingId(null);
      fetchAuthorities();
    } catch (e) {
      showToast('Failed to delete', 'error');
    }
  };

  const openEdit = (auth: any) => {
    setFormData({
      name: auth.name || '',
      xHandle: auth.xHandle || '',
      category: auth.category || 'all',
      location: auth.location || '',
      active: auth.active !== false,
      priority: auth.priority || 0
    });
    setIsEditing(auth);
    setIsCreating(true);
  };

  const openCreate = () => {
    setFormData({
      name: '',
      xHandle: '',
      category: 'all',
      location: '',
      active: true,
      priority: 0
    });
    setIsEditing(null);
    setIsCreating(true);
  };

  return (
    <div className="animate-in fade-in duration-300">
      {toast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Authority Mapping</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configure X accounts for specific categories and geographic areas</p>
        </div>
        <button 
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus size={16} />
          Add Authority
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Authority</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Category & Scope</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
                </td>
              </tr>
            ) : authorities.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                  No authorities configured yet.
                </td>
              </tr>
            ) : (
              authorities.map(auth => (
                <tr key={auth.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm text-gray-900 dark:text-white">{auth.name}</div>
                    <div className="text-xs text-blue-500 font-medium">{auth.xHandle}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">{auth.category === 'all' ? 'All Categories' : (CATEGORIES[auth.category as CategoryId]?.fullName || auth.category.replace('_', ' '))}</div>
                    <div className="text-xs text-gray-500">{auth.location || 'Global/Any Location'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {auth.active ? (
                      <span className="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <button onClick={() => openEdit(auth)} className="text-gray-600 hover:text-indigo-600 p-2"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => setDeletingId(auth.id)} className="text-red-600 hover:text-red-900 p-2"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-lg font-bold">{isEditing ? 'Edit Authority' : 'Add Authority'}</h3>
              <button onClick={() => setIsCreating(false)} className="p-1"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Authority Name</label>
                <input 
                  type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g. Traffic Police Dept"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">X (Twitter) Handle</label>
                <input 
                  type="text" value={formData.xHandle} onChange={e => setFormData({...formData, xHandle: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="@handle"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select 
                    value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Categories</option>
                    {CATEGORY_LIST.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Location Scope</label>
                  <input 
                    type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g. Mumbai (optional)"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  Active
                </label>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Priority (higher = more specific)</label>
                  <input 
                    type="number" value={formData.priority} onChange={e => setFormData({...formData, priority: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-sm font-medium bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button onClick={handleSave} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save Authority</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 text-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Delete Authority?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Are you sure you want to remove this authority? This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={() => confirmDelete(deletingId)} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
