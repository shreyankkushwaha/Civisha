import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, GeoJSON, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';
import { feature, merge } from 'topojson-client';

const INDIA_TOPOJSON_URL = 'https://raw.githubusercontent.com/udit-001/india-maps-data/main/topojson/india.json';

let cachedStateGeoJSON: any = null;
let cachedDistrictGeoJSON: any = null;
let cachedCountryGeoJSON: any = null;
let fetchingPromise: Promise<void> | null = null;

const normalizeName = (name: string) => {
  if (!name) return '';
  return name.replace(/&/g, 'and').replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().trim();
};

const getFeatureName = (feature: any, type: 'state' | 'district') => {
  const p = feature.properties;
  if (type === 'state') {
    return p.NAME_1 || p.st_nm || p.state_name || p.name || 'Unknown State';
  } else {
    return p.NAME_2 || p.district || p.dist_name || p.name || 'Unknown District';
  }
};

const getColor = (intensity: number) => {
  const colors = [
    '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', 
    '#6b7280', '#4b5563', '#374151', '#1f2937', '#030712'
  ];
  const idx = Math.min(Math.floor(intensity * colors.length), colors.length - 1);
  return colors[Math.max(0, idx)];
};

function BoundsManager({ geoJsonData }: { geoJsonData: any }) {
  const map = useMap();
  useEffect(() => {
    if (geoJsonData && geoJsonData.features && geoJsonData.features.length > 0) {
      try {
        const geoJsonLayer = L.geoJSON(geoJsonData);
        map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20], maxZoom: 8 });
      } catch (e) {
        console.error('Failed to calculate bounds', e);
      }
    }
  }, [geoJsonData, map]);
  return null;
}

export function RadarMap({
  groupingMode,
  stateFilter,
  sortOption,
  generateCardData,
  onStateSelect,
  onViewDistrict
}: {
  groupingMode: 'state' | 'district';
  stateFilter: string;
  sortOption: string;
  generateCardData: (mode: 'state' | 'district', filter: string) => any[];
  onStateSelect: (stateName: string) => void;
  onViewDistrict: (area: any) => void;
}) {
  const [geoData, setGeoData] = useState<any>(null);
  const [stateOverlayData, setStateOverlayData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePopup, setActivePopup] = useState<{feature: any, data: any, latlng: any} | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    const fetchGeoJSON = async () => {
      setIsLoading(true);
      setError(null);
      setActivePopup(null);
      try {
        if (!cachedStateGeoJSON || !cachedDistrictGeoJSON) {
          if (!fetchingPromise) {
            fetchingPromise = fetch(INDIA_TOPOJSON_URL).then(async (res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const topo = await res.json();
              cachedStateGeoJSON = feature(topo, topo.objects.states);
              cachedDistrictGeoJSON = feature(topo, topo.objects.districts);
              
              cachedCountryGeoJSON = {
                type: "FeatureCollection",
                features: [{
                  type: "Feature",
                  geometry: merge(topo, topo.objects.states.geometries),
                  properties: { name: 'India' }
                }]
              };
            }).finally(() => {
              fetchingPromise = null;
            });
          }
          await fetchingPromise;
        }

        if (groupingMode === 'state') {
          if (isMounted) {
            setStateOverlayData(null);
            if (stateFilter === 'All States') {
              setGeoData(cachedStateGeoJSON);
            } else {
              const targetState = normalizeName(stateFilter);
              const filteredFeatures = cachedStateGeoJSON.features.filter((f: any) => {
                const stateName = normalizeName(f.properties.NAME_1 || f.properties.st_nm || f.properties.state_name || '');
                return stateName === targetState;
              });
              setGeoData({ type: 'FeatureCollection', features: filteredFeatures });
            }
          }
        } else {
          if (isMounted) {
            if (stateFilter === 'All States') {
              setGeoData(cachedDistrictGeoJSON);
              setStateOverlayData(cachedStateGeoJSON);
            } else {
              const targetState = normalizeName(stateFilter);
              const filteredFeatures = cachedDistrictGeoJSON.features.filter((f: any) => {
                const stateName = normalizeName(f.properties.NAME_1 || f.properties.st_nm || f.properties.state_name || '');
                return stateName === targetState;
              });
              setGeoData({ type: 'FeatureCollection', features: filteredFeatures });
              
              const filteredStateFeatures = cachedStateGeoJSON.features.filter((f: any) => {
                const stateName = normalizeName(f.properties.NAME_1 || f.properties.st_nm || f.properties.state_name || '');
                return stateName === targetState;
              });
              setStateOverlayData({ type: 'FeatureCollection', features: filteredStateFeatures });
            }
          }
        }
      } catch (err: any) {
        console.error("Failed to load GeoJSON", err);
        if (isMounted) setError(err.message || "Failed to load map data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchGeoJSON();
    return () => { isMounted = false; };
  }, [groupingMode, stateFilter]);

  const mapData = useMemo(() => {
    return generateCardData(groupingMode, stateFilter);
  }, [groupingMode, stateFilter, generateCardData]);

  const dataMapping = useMemo(() => {
    const map = new Map<string, any>();
    mapData.forEach(item => {
      map.set(normalizeName(item.areaName), item);
    });
    return map;
  }, [mapData]);

  const maxValue = useMemo(() => {
    if (mapData.length === 0) return 1;
    let max = 0;
    mapData.forEach(d => {
      let val = d.total;
      if (val > max) max = val;
    });
    return max || 1;
  }, [mapData]);

  const minValue = useMemo(() => {
    if (mapData.length === 0) return 0;
    let min = Infinity;
    mapData.forEach(d => {
      let val = d.total;
      if (val < min) min = val;
    });
    return min === Infinity ? 0 : min;
  }, [mapData]);

  const getStyle = (feature: any) => {
    const name = getFeatureName(feature, groupingMode);
    const data = dataMapping.get(normalizeName(name));
    
    let intensity = 0;
    if (data) {
      const value = data.total;
      if (sortOption === 'Lowest reported') {
        if (maxValue === minValue) {
          intensity = 1;
        } else {
          intensity = 1 - ((value - minValue) / (maxValue - minValue));
        }
      } else {
        // Top reported
        intensity = value / maxValue;
      }
    }
    
    return {
      fillColor: data ? getColor(intensity) : '#f3f4f6',
      weight: groupingMode === 'district' ? 0.75 : 1.5,
      opacity: 1,
      color: groupingMode === 'district' ? '#9ca3af' : '#ffffff',
      fillOpacity: groupingMode === 'district' ? 0.8 : 0.9,
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({ weight: 2, color: '#000', fillColor: '#fbbf24', fillOpacity: 1 });
        target.bringToFront();
      },
      mouseout: (e) => {
        const target = e.target;
        target.setStyle(getStyle(feature));
      },
      click: (e) => {
        const name = getFeatureName(feature, groupingMode);
        const originalData = dataMapping.get(normalizeName(name));
        setActivePopup({ feature, data: originalData, latlng: e.latlng });
      }
    });
  };

  return (
    <div className="w-full h-full min-h-[400px] relative bg-gray-50 dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
      {isLoading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
        </div>
      )}

      {error && !isLoading && (
        <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
            <span className="text-red-600 dark:text-red-400 text-xl font-bold">!</span>
          </div>
          <h3 className="text-gray-900 dark:text-white font-semibold mb-1">Map Data Unavailable</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">
            {error}. This may happen if the map boundaries are too large to fetch over your current network, or due to ad-blockers blocking the request.
          </p>
        </div>
      )}
      
      <MapContainer preferCanvas={true} 
        center={[22.5937, 78.9629]} 
        zoom={4} 
        zoomControl={false}
        scrollWheelZoom={true}
        className="w-full h-full bg-[#f8fafc] dark:bg-gray-900"
        attributionControl={false}
      >
        {cachedCountryGeoJSON && stateFilter === 'All States' && (
          <GeoJSON 
            key="country-boundary"
            data={cachedCountryGeoJSON} 
            style={{
              color: '#000000',
              weight: 3.5,
              fillOpacity: 0,
              opacity: 1
            }}
            interactive={false}
          />
        )}
        {geoData && (
          <GeoJSON 
            key={`${groupingMode}-${stateFilter}-${sortOption}-${geoData.features ? geoData.features.length : 0}`}
            data={geoData} 
            style={getStyle} 
            onEachFeature={onEachFeature} 
          />
        )}
        {groupingMode === 'district' && stateOverlayData && (
          <GeoJSON 
            key={`overlay-${stateFilter}-${stateOverlayData.features ? stateOverlayData.features.length : 0}`}
            data={stateOverlayData} 
            style={{
              color: '#ffffff',
              weight: 1.5,
              fillOpacity: 0,
              opacity: 1
            }}
            interactive={false}
          />
        )}
        {geoData && <BoundsManager geoJsonData={geoData} />}
        
        {activePopup && (
          <Popup position={activePopup.latlng} onClose={() => setActivePopup(null)}>
            <div className="p-1 min-w-[180px]">
              <h3 className="font-bold text-gray-900 mb-2">{getFeatureName(activePopup.feature, groupingMode)}</h3>
              {activePopup.data ? (
                <div className="space-y-1.5 mb-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total:</span>
                    <span className="font-medium font-mono text-gray-900">{activePopup.data.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Solved:</span>
                    <span className="font-medium font-mono text-green-600">{activePopup.data.solved}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pending:</span>
                    <span className="font-medium font-mono text-red-600">{activePopup.data.pending}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-1.5 mt-1.5">
                    <span className="text-gray-500">Top Issue:</span>
                    <span className="font-medium font-mono uppercase tracking-wider text-xs text-gray-700">{activePopup.data.topIssue}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-3">No data available.</p>
              )}
              
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (activePopup.data) {
                      onViewDistrict(activePopup.data);
                    }
                  }}
                  disabled={!activePopup.data}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  View Details
                </button>
                {groupingMode === 'state' && (
                  <button
                    onClick={() => {
                      const name = getFeatureName(activePopup.feature, 'state');
                      const matchedItem = mapData.find(d => normalizeName(d.areaName) === normalizeName(name));
                      const realStateName = matchedItem ? matchedItem.areaName : name;
                      onStateSelect(realStateName);
                    }}
                    className="w-full bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 py-1.5 rounded-md text-xs font-medium transition-colors"
                  >
                    View Districts Map
                  </button>
                )}
              </div>
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  );
}
