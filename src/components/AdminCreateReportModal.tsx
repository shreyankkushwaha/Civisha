import React, { useState, useEffect, useRef } from 'react';
import { X, Image as ImageIcon, MapPin as MapPinIcon, Loader2, Navigation, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';
import { api } from '../api';
import { CATEGORY_LIST } from '../categories';
import { CategoryId } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Cropper from 'react-easy-crop';

interface AdminCreateReportModalProps {
  onClose: () => void;
  onSuccess: () => void;
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
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};


const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (error) => reject(error));
    img.src = imageSrc;
  });
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );
  return canvas.toDataURL('image/jpeg', 0.8);
};

export function AdminCreateReportModal({ onClose, onSuccess }: AdminCreateReportModalProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [rawPhoto, setRawPhoto] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<CategoryId>('infrastructure');
  
  const [lat, setLat] = useState<number>(28.6139);
  const [lng, setLng] = useState<number>(77.2090);
  const [address, setAddress] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  
  // Ref to prevent cyclic updates between lat/lng, map, and address
  const isUpdatingFromMap = useRef(false);
  const isUpdatingFromInputs = useRef(false);
  const isUpdatingFromAddressSearch = useRef(false);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    try {
      const addressName = await api.getFullAddress(latitude, longitude);
      setAddress(addressName);
    } catch (e) {
      setAddress(`Coordinate: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } finally {
      setIsGeocoding(false);
    }
  };

  const forwardGeocode = async (searchAddress: string) => {
    if (!searchAddress || searchAddress.length < 3) return;
    setIsGeocoding(true);
    try {
      const coords = await api.getCoordinatesFromAddress(searchAddress);
      if (coords) {
        isUpdatingFromInputs.current = true;
        setLat(coords.lat);
        setLng(coords.lng);
        
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([coords.lat, coords.lng], 15);
          markerRef.current.setLatLng([coords.lat, coords.lng]);
        }
        
        setTimeout(() => { isUpdatingFromInputs.current = false; }, 500);
      }
    } catch (e) {
      console.error("Forward geocoding error:", e);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Debounced forward geocoding when address changes manually
  useEffect(() => {
    if (!isUpdatingFromAddressSearch.current) return;
    
    const handler = setTimeout(() => {
      if (address) {
        forwardGeocode(address);
      }
    }, 1500); // 1.5s debounce for typing address
    
    return () => clearTimeout(handler);
  }, [address]);

  // Update map when manual coordinates change
  useEffect(() => {
    if (!isUpdatingFromInputs.current) return;
    
    const handler = setTimeout(() => {
      if (!isNaN(lat) && !isNaN(lng)) {
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lng], 15);
          markerRef.current.setLatLng([lat, lng]);
        }
        reverseGeocode(lat, lng);
      }
    }, 1000);
    
    return () => clearTimeout(handler);
  }, [lat, lng]);

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          isUpdatingFromMap.current = true;
          setLat(latitude);
          setLng(longitude);
          reverseGeocode(latitude, longitude);
          
          if (mapRef.current && markerRef.current) {
            mapRef.current.setView([latitude, longitude], 15);
            markerRef.current.setLatLng([latitude, longitude]);
          }
          
          setTimeout(() => { isUpdatingFromMap.current = false; }, 500);
        },
        (error) => console.warn("Location not available"),
        { enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
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

      marker.on('drag', () => {
        isUpdatingFromMap.current = true;
        isUpdatingFromAddressSearch.current = false;
        isUpdatingFromInputs.current = false;
      });

      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        setLat(pos.lat);
        setLng(pos.lng);
        await reverseGeocode(pos.lat, pos.lng);
        isUpdatingFromMap.current = false;
      });
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRawPhoto(reader.result as string);
        setIsCropping(true);
        // Reset crop settings
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const saveCroppedImage = async () => {
    if (!rawPhoto || !croppedAreaPixels) return;
    setIsCompressing(true);
    try {
      const croppedImage = await getCroppedImg(rawPhoto, croppedAreaPixels);
      setPhoto(croppedImage);
      setIsCropping(false);
      setRawPhoto(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async () => {
    if (!title || !content || !categoryId || !lat || !lng || !address) {
      setError('Please fill in all required fields');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      await api.createPost({
        title,
        content,
        category: categoryId,
        lat,
        lng,
        address,
        imageUrl: photo || undefined,
        isAnonymous: isGhostMode
      }, 'admin');
      
      onSuccess();
    } catch (err: any) {
      console.error('Failed to submit report:', err);
      setError(err.message || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 sticky top-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Admin: Post Report</h2>
          <button onClick={() => { onClose(); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo (From Device)</label>
              {isCropping && rawPhoto ? (
                <div className="space-y-3">
                  <div className="relative w-full h-64 bg-gray-900 rounded-lg overflow-hidden">
                    <Cropper
                      image={rawPhoto}
                      crop={crop}
                      zoom={zoom}
                      aspect={4 / 3}
                      onCropChange={setCrop}
                      onCropComplete={handleCropComplete}
                      onZoomChange={setZoom}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCropping(false);
                        setRawPhoto(null);
                      }}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveCroppedImage}
                      disabled={isCompressing}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      {isCompressing ? <Loader2 size={16} className="animate-spin" /> : 'Crop & Save'}
                    </button>
                  </div>
                </div>
              ) : photo ? (
                <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img src={photo} alt="Preview" className="w-full h-48 object-cover" />
                  <button 
                    onClick={() => setPhoto(null)}
                    className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-400 cursor-pointer bg-gray-50 dark:bg-gray-800/50 transition-colors">
                  {isCompressing ? (
                    <Loader2 size={24} className="text-indigo-500 animate-spin mb-2" />
                  ) : (
                    <ImageIcon size={24} className="text-gray-400 mb-2" />
                  )}
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {isCompressing ? 'Processing...' : 'Select a photo from device'}
                  </span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleFileSelect} 
                    disabled={isCompressing}
                  />
                </label>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input 
                type="text" 
                value={title}
                maxLength={100}
                onChange={e => setTitle(e.target.value)}
                placeholder="E.g., Large pothole on main road"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value as CategoryId)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
                >
                  {CATEGORY_LIST.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.fullName}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea 
                value={content}
                maxLength={2000}
                onChange={e => setContent(e.target.value)}
                placeholder="Provide details..."
                rows={3}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white resize-none"
              />
            </div>
            
            <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-gray-900 dark:text-white">Location Details</label>
                {isGeocoding && <Loader2 size={16} className="text-indigo-500 animate-spin" />}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Address Search</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                  <input 
                    type="text" 
                    value={address}
                    onChange={e => {
                      isUpdatingFromMap.current = false;
                      isUpdatingFromInputs.current = false;
                      isUpdatingFromAddressSearch.current = true;
                      setAddress(e.target.value);
                    }}
                    placeholder="Type address (e.g. Red Fort) to search..."
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 pl-9 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    value={lat}
                    onChange={e => {
                      isUpdatingFromMap.current = false;
                      isUpdatingFromAddressSearch.current = false;
                      isUpdatingFromInputs.current = true;
                      setLat(parseFloat(e.target.value));
                    }}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
                  <input 
                    type="number"
                    step="any"
                    value={lng}
                    onChange={e => {
                      isUpdatingFromMap.current = false;
                      isUpdatingFromAddressSearch.current = false;
                      isUpdatingFromInputs.current = true;
                      setLng(parseFloat(e.target.value));
                    }}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="relative h-48 w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <div ref={mapContainerRef} className="absolute inset-0 z-0" />
                </div>
                <button 
                  onClick={handleUseCurrentLocation}
                  className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-lg text-sm w-full justify-center"
                >
                  <Navigation size={16} /> Use My Current Location
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={isGhostMode}
                onChange={e => setIsGhostMode(e.target.checked)}
              />
              <div className={`block w-10 h-6 rounded-full transition-colors ${isGhostMode ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isGhostMode ? 'translate-x-4' : ''}`}></div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Post Anonymously (Ghost Mode)</span>
              <span className="text-xs text-gray-500">Your admin identity will be hidden</span>
            </div>
          </label>
          <button 
            onClick={() => { triggerHaptic(); handleSubmit(); }}
            disabled={isSubmitting || isGeocoding}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {isSubmitting ? (
              <><Loader2 size={18} className="animate-spin" /> Publishing...</>
            ) : (
              'Publish Admin Report'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
