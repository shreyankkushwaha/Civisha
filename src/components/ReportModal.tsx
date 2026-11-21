import React, { useState, useRef, useEffect } from 'react';
import { usePost } from "../hooks/PostContext";
import { X, Camera, MapPin as MapPinIcon, Check, Shield, Navigation, ImagePlus, PenTool, AlertCircle, RotateCcw } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { CATEGORY_LIST } from '../categories';
import { CategoryId } from '../types';

import { ReportPost } from '../types';
import { ThumbsUp, ThumbsDown, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitReport: (report: any) => Promise<void>;
  posts?: ReportPost[];
  onAction?: (id: string, action: "confirm" | "false" | "upvote") => void;
  userId?: string;
}


const compressImage = (file: File, maxWidth: number = 1024, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export function ReportModal({ isOpen, onClose, onSubmitReport, posts = [], onAction, userId }: ReportModalProps) {
  const { openPost } = usePost();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [duplicateReports, setDuplicateReports] = useState<ReportPost[]>([]);
  const [showDuplicateList, setShowDuplicateList] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [lat, setLat] = useState<number>(28.6139);
  const [lng, setLng] = useState<number>(77.2090);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Opt-in Snap-to-Fill AI drafting state (never auto-runs unless user taps button)
  const [aiLanguage, setAiLanguage] = useState<'en' | 'hi'>('en');
  const [isDraftingAI, setIsDraftingAI] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);
  const [aiDraftApplied, setAiDraftApplied] = useState(false);

  const [allowDeviceUploads, setAllowDeviceUploads] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'app_settings', 'global'));
        if (docSnap.exists()) {
          setAllowDeviceUploads(docSnap.data().allowDeviceUploads || false);
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  useEffect(() => {
    // If modal opens, we can keep it as is, waiting for user to click camera button.
  }, [isOpen, step]);

  useEffect(() => {
    if (step === 2 && isOpen && mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const customIcon = L.divIcon({
        html: `<div style="color:red; font-size: 24px;">📍</div>`,
        className: 'custom-pin',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
      });

      const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);
      markerRef.current = marker;
      mapRef.current = map;

      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        setLat(pos.lat);
        setLng(pos.lng);
        reverseGeocode(pos.lat, pos.lng);
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setLat(e.latlng.lat);
        setLng(e.latlng.lng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });
      
      // Auto-locate
      handleUseCurrentLocation();
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [step, isOpen]);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const addressName = await api.getFullAddress(latitude, longitude);
      setAddress(addressName);
    } catch (e) {
      setAddress(`Coordinate: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      try {
        const remainingSlots = 3 - photos.length;
        const filesToProcess = files.slice(0, remainingSlots);
        
        const compressedBase64s = await Promise.all(
          filesToProcess.map(file => compressImage(file, 1024, 0.7))
        );
        
        setPhotos(prev => {
          const newPhotos = [...prev, ...compressedBase64s];
          return newPhotos.slice(0, 3); // Ensure max 3
        });
        
        if (step === 1) {
          setStep(2);
        }
      } catch (err) {
        console.error("Compression failed:", err);
        // Fallback to original if compression fails somehow
        const remainingSlots = 3 - photos.length;
        if (remainingSlots > 0 && files[0]) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setPhotos(prev => {
              if (prev.length < 3) return [...prev, reader.result as string];
              return prev;
            });
            if (step === 1) setStep(2);
          };
          reader.readAsDataURL(files[0]);
        }
      }
    }
  };

  const handleUseCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setLat(latitude);
          setLng(longitude);
          if (mapRef.current) mapRef.current.setView([latitude, longitude], 15);
          if (markerRef.current) markerRef.current.setLatLng([latitude, longitude]);
          reverseGeocode(latitude, longitude);
        },
        (err) => {
          console.warn("Location access not available or denied:", err);
        }
      );
    }
  };

  const handleSubmit = () => {
    if (step === 3 && posts && posts.length > 0) {
      const duplicates = posts.filter(p => 
        p.category === category && getDistance(lat, lng, p.lat, p.lng) <= 50 && p.status !== 'Rejected'
      );
      if (duplicates.length > 0) {
        setDuplicateReports(duplicates);
        setStep(4);
        return;
      }
    }
    forceSubmit();
  };

  const forceSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmitReport({
        title,
        content: description,
        category,
        address,
        lat,
        lng,
        imageUrl: photos[0],
        imageUrls: photos,
        isAnonymous
      });
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDraftWithAI = async () => {
    if (photos.length === 0 || isDraftingAI) return;
    triggerHaptic();
    setIsDraftingAI(true);
    setAiDraftError(null);
    try {
      const draft = await api.draftReportWithAI({
        images: photos,
        address,
        lat,
        lng,
        language: aiLanguage,
      });
      setCategory(draft.category);
      setTitle(draft.title);
      setDescription(draft.description);
      setAiDraftApplied(true);
    } catch (err: any) {
      setAiDraftError(err?.message || 'Could not generate AI draft. Please try again or enter details manually.');
    } finally {
      setIsDraftingAI(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setDuplicateReports([]);
    setShowDuplicateList(false);
    setPhotos([]);
    setTitle('');
    setDescription('');
    setCategory(null);
    setAddress('');
    setAiDraftError(null);
    setAiDraftApplied(false);
    setIsDraftingAI(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-lg font-bold tracking-tight dark:text-white">New Report</h2>
        <button onClick={() => { handleClose(); }} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full dark:text-white"><X size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto pb-safe">
        {step === 1 && (
          <div className="flex flex-col items-center justify-center h-full p-4 space-y-6 bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <div className="bg-indigo-100 dark:bg-indigo-900/30 p-4 rounded-full inline-block mb-4">
                <Camera size={32} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Capture Evidence</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">Please take a clear photo of the issue using your device's camera.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row w-full max-w-sm gap-3">
              <label className="flex-1 bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg active:scale-95 transition-transform text-center cursor-pointer flex items-center justify-center gap-2">
                <Camera size={20} />
                Open Camera
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  multiple
                  className="hidden" 
                  onChange={handlePhotoCapture} 
                />
              </label>
              
              {allowDeviceUploads && (
                <label className="flex-1 bg-white dark:bg-gray-800 border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold py-4 px-6 rounded-xl shadow-lg active:scale-95 transition-transform text-center cursor-pointer flex items-center justify-center gap-2">
                  <ImagePlus size={20} />
                  Gallery
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                    onChange={handlePhotoCapture} 
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-4 flex flex-col h-full bg-white dark:bg-gray-900">
            <h3 className="font-bold mb-2 dark:text-white">Pin the Location</h3>
            <div className="relative h-64 rounded-xl overflow-hidden mb-4 border border-gray-200 dark:border-gray-700">
              <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            </div>
            <button onClick={handleUseCurrentLocation} className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold mb-4 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-lg self-start">
              <Navigation size={18} /> Use Current Location
            </button>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Address</label>
                <input value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Latitude</label>
                  <input value={lat.toFixed(6)} disabled className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm font-mono text-gray-700 dark:text-gray-300" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Longitude</label>
                  <input value={lng.toFixed(6)} disabled className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm font-mono text-gray-700 dark:text-gray-300" />
                </div>
              </div>
            </div>
            <button onClick={() => setStep(3)} className="mt-auto mb-4 w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">
              Next Step
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="p-4 flex flex-col h-full bg-white dark:bg-gray-900">
            {photos.length > 0 && (
              <div className="relative mb-4">
                <div className="flex overflow-x-auto snap-x snap-mandatory gap-2 pb-2 no-scrollbar">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative w-4/5 sm:w-2/3 snap-center shrink-0">
                      <img src={p} alt={`evidence-${idx}`} className="w-full h-48 object-cover rounded-xl" />
                      <button
                        onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                        className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {photos.length < 3 && (
                    <label className="w-32 flex-shrink-0 snap-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer h-48 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Camera size={24} className="mb-2" />
                      <span className="text-xs font-bold">Camera</span>
                      <span className="text-xs">({photos.length}/3)</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        multiple
                        className="hidden" 
                        onChange={handlePhotoCapture} 
                      />
                    </label>
                  )}
                  {photos.length < 3 && allowDeviceUploads && (
                    <label className="w-32 flex-shrink-0 snap-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer h-48 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <ImagePlus size={24} className="mb-2" />
                      <span className="text-xs font-bold">Gallery</span>
                      <span className="text-xs">({photos.length}/3)</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple
                        className="hidden" 
                        onChange={handlePhotoCapture} 
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              {/* Opt-in AI Snap-to-Fill Bar (only runs when explicitly triggered by user) */}
              {photos.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <PenTool size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>AI Report Drafter</span>
                        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">· Optional</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Auto-fill category, title &amp; description from your photo and pinned location.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="inline-flex items-center p-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg" role="group" aria-label="AI Draft Language">
                        <button
                          type="button"
                          onClick={() => setAiLanguage('en')}
                          disabled={isDraftingAI}
                          className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            aiLanguage === 'en'
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          English
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiLanguage('hi')}
                          disabled={isDraftingAI}
                          className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            aiLanguage === 'hi'
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          हिन्दी
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleDraftWithAI}
                        disabled={isDraftingAI}
                        className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        {isDraftingAI ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>Drafting...</span>
                          </>
                        ) : aiDraftApplied ? (
                          <>
                            <RotateCcw size={14} />
                            <span>Regenerate</span>
                          </>
                        ) : (
                          <>
                            <PenTool size={14} />
                            <span>Draft with AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {aiDraftApplied && !isDraftingAI && !aiDraftError && (
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={14} className="shrink-0" />
                      <span>Draft filled from your photo &amp; location. You can review or edit any field below.</span>
                    </div>
                  )}

                  {aiDraftError && (
                    <div className="flex items-start gap-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-2.5">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>{aiDraftError}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold mb-2 dark:text-white">Category</label>
                <div className="flex flex-col gap-2">
                  {CATEGORY_LIST.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`text-left px-4 py-3 rounded-xl border transition-all ${category === cat.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 dark:border-indigo-500 ring-1 ring-indigo-600 dark:ring-indigo-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      <div className={`font-bold ${category === cat.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-900 dark:text-gray-100'}`}>{cat.fullName}</div>
                      <div className={`text-xs mt-1 ${category === cat.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>{cat.example}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 dark:text-white">Issue Title</label>
                <input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="E.g., Large pothole on main road" className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 focus:outline-none focus:border-indigo-500 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 dark:text-white">Description</label>
                <textarea value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Add details..." className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 focus:outline-none focus:border-indigo-500 dark:text-white" />
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div>
                  <p className="font-bold text-sm dark:text-white">Ghost Mode</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Report anonymously</p>
                </div>
                <button onClick={() => setIsAnonymous(!isAnonymous)} className={`w-12 h-6 rounded-full transition-colors relative ${isAnonymous ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${isAnonymous ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="mt-auto pt-6 pb-4">
              <button disabled={!category || !title || isSubmitting} onClick={() => { triggerHaptic(); handleSubmit(); }} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex justify-center items-center">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="p-4 flex flex-col h-full bg-white dark:bg-gray-900">
            <div className="flex-1 overflow-y-auto">
              <div className="text-center mb-6">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-4 rounded-full inline-block mb-4">
                  <ShieldAlert size={32} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">Similar Report Nearby</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto mb-4">
                  There may already be a similar report nearby. You can verify an existing report to resolve it faster.
                </p>
                {!showDuplicateList && (
                  <button onClick={() => setShowDuplicateList(true)} className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-bold py-2 px-4 rounded-lg">
                    Check / View Existing Reports
                  </button>
                )}
              </div>

              {showDuplicateList && (
                <div className="space-y-4 mb-6">
                  {duplicateReports.map(post => {
                    const hasConfirmed = userId && post.confirmUsers?.includes(userId);
                    const hasFalsed = userId && post.falseUsers?.includes(userId);
                    
                    return (
                      <div key={post.id} onClick={() => openPost(post.id)} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 transition-colors">
                        <div className="flex gap-3 mb-3">
                          {post.imageUrl && <img src={post.imageUrl} alt="" className="w-16 h-16 object-cover rounded-lg" />}
                          <div>
                            <h4 className="font-bold text-sm dark:text-white">{post.title}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{post.content}</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                          <button 
                            disabled={!userId || hasConfirmed || hasFalsed}
                            onClick={() => onAction && onAction(post.id, 'confirm')}
                            className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${hasConfirmed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400'}`}
                          >
                            <CheckCircle2 size={16} /> Confirm ({post.confirms})
                          </button>
                          <button 
                            disabled={!userId || hasConfirmed || hasFalsed}
                            onClick={() => onAction && onAction(post.id, 'false')}
                            className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${hasFalsed ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400'}`}
                          >
                            <X size={16} /> False ({post.falses})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="mt-auto pt-6 pb-4 space-y-3">
              <button onClick={forceSubmit} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">
                Submit My Report Anyway
              </button>
              <button onClick={handleClose} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold py-4 rounded-xl active:scale-95 transition-transform">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
