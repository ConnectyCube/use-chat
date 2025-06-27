import { useEffect } from "react";
import useChatStore from "./useChatStore";
import { useShallow } from "zustand/shallow";

export interface NetworkStatusHook {
  isOnline: boolean;
}

function useNetworkStatus(): NetworkStatusHook {
  const [isOnline, setIsOnline] = useChatStore(useShallow((state) => [state.isOnline, state.setIsOnline]));

  useEffect(() => {
    const abortController1 = new AbortController();
    const abortController2 = new AbortController();

    window.addEventListener(
      "online",
      () => {
        setIsOnline(true);
      },
      {
        signal: abortController1.signal,
      },
    );
    window.addEventListener(
      "offline",
      () => {
        setIsOnline(false);
      },
      {
        signal: abortController2.signal,
      },
    );

    return () => {
      abortController1.abort();
      abortController2.abort();
    };
  }, []);

  return {
    isOnline,
  };
}

export default useNetworkStatus;
