import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCcw } from 'lucide-react';

interface NetworkContextType {
  isOnline: boolean;
  runWithNetwork: (action: () => Promise<void>) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  runWithNetwork: async () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Optional: automatically run the pending action when back online?
      // But prompt says "offer a Retry action" so we have a modal.
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const runWithNetwork = useCallback(async (action: () => Promise<void>) => {
    if (navigator.onLine) {
      await action();
    } else {
      setPendingAction(() => action);
    }
  }, []);

  const [retryWarning, setRetryWarning] = useState(false);

  return (
    <NetworkContext.Provider value={{ isOnline, runWithNetwork }}>
      {children}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full bg-red-500 text-white px-4 py-2 text-sm font-medium flex items-center justify-between z-[100] shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff size={16} />
            {retryWarning ? 'Still offline! Check connection and try again.' : 'No internet connection. Some features may be unavailable.'}
          </div>
          {pendingAction && (
             <button 
               onClick={async () => {
                 if (navigator.onLine) {
                    setRetryWarning(false);
                    await pendingAction();
                    setPendingAction(null);
                 } else {
                    setRetryWarning(true);
                    setTimeout(() => setRetryWarning(false), 3000);
                 }
               }} 
               className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded flex items-center gap-1 transition-colors"
             >
               <RefreshCcw size={14} /> Retry
             </button>
          )}
        </div>
      )}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
