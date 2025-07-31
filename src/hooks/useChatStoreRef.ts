import { useEffect, useRef, RefObject } from "react";
import useChatStore, { ChatStoreState } from "./useChatStore";

const useChatStoreRef = <K extends keyof ChatStoreState>(key: K): RefObject<ChatStoreState[K]> => {
  const ref = useRef<ChatStoreState[K]>(useChatStore.getState()[key]);

  useEffect(() => {
    const unsubscribe = useChatStore.subscribe(
      (state) => state[key],
      (value) => {
        ref.current = value;
      },
    );
    return () => unsubscribe();
  }, [key]);

  return ref;
};

export default useChatStoreRef;
