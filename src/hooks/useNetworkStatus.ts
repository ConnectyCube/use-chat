import { useEffect, useRef, useState } from "react";
import ConnectyCube from "connectycube";

export type NetworkStatusHook = {
  isOnline: boolean;
};

function useNetworkStatus(isConnected: boolean): NetworkStatusHook {
  const pingIntervalRef = useRef<NodeJS.Timeout>(undefined);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const clearPingInterval = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = undefined;
    }
  };

  const setPingInterval = () => {
    pingIntervalRef.current = setInterval(async () => {
      try {
        await ConnectyCube.chat.pingWithTimeout(5000);
        setIsOnline(true);
      } catch (error) {
        setIsOnline(false);
      }
    }, 60000);
  };

  useEffect(() => {
    if (isConnected) {
      clearPingInterval();
      setPingInterval();
    } else {
      clearPingInterval();
    }
  }, [isConnected]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    isOnline,
  };
}

export default useNetworkStatus;
