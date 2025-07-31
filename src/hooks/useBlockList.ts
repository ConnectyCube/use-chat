import ConnectyCube from "connectycube";
import { PrivacyListAction } from "connectycube/types";
import { useEffect, useState, useRef } from "react";
import useChatStore from "./useChatStore";
import { useShallow } from "zustand/shallow";

export const BLOCK_LIST_LOG_TAG = "[useChat][useBlockList]";
export const BLOCK_LIST_NAME = "ConnectyCubeBlockList";

export type BlockListHook = {
  blockedUsers: number[];
  isBlockedUser: (userId: number) => boolean;
  unblockUser: (userId: number) => Promise<void>;
  blockUser: (userId: number) => Promise<void>;
};

function useBlockList(isConnected: boolean): BlockListHook {
  const [blockedUsers, setBlockedUsers] = useChatStore(
    useShallow((state) => [state.blockedUsers, state.setBlockedUsers]),
  );
  const [state, setState] = useState<Set<number>>(new Set<number>());
  const isApplied = useRef<boolean>(false);

  const isBlocked = (userId: number): boolean => blockedUsers.has(userId);

  const fetch = async (): Promise<void> => {
    if (!isConnected) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[fetch]: chat is not connected`);
      return;
    }

    const blackListNames = await ConnectyCube.chat.privacylist.getNames();

    if (blackListNames.default === BLOCK_LIST_NAME) {
      const blockList = await ConnectyCube.chat.privacylist.getList(BLOCK_LIST_NAME);
      const newState = blockList.items.reduce((list: Set<number>, item) => {
        if (item.action === PrivacyListAction.DENY) {
          list.add(+item.user_id);
        }
        return list;
      }, new Set<number>());

      isApplied.current = true;

      setState(newState);
    }
  };

  const upsert = async (user_id: number, action: PrivacyListAction): Promise<void> => {
    if (!isConnected) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[upsert]: ${action} user ${user_id} failed, chat is not connected`);
      return;
    }

    const newState = new Set(state);

    const blockList = {
      name: BLOCK_LIST_NAME,
      items: [{ user_id, action, mutualBlock: true }],
    };

    try {
      if (action === PrivacyListAction.DENY) {
        newState.add(user_id);
      } else if (action === PrivacyListAction.ALLOW) {
        newState.delete(user_id);
      }

      if (isApplied.current) {
        await ConnectyCube.chat.privacylist.setAsDefault(null);
        await ConnectyCube.chat.privacylist.update(blockList);
        if (newState.size > 0) {
          await ConnectyCube.chat.privacylist.setAsDefault(BLOCK_LIST_NAME);
        }
      } else {
        await ConnectyCube.chat.privacylist.create(blockList);
        await ConnectyCube.chat.privacylist.setAsDefault(BLOCK_LIST_NAME);
      }
    } catch (error) {
      return;
    } finally {
      setState(newState);
    }
  };

  const unblock = async (userId: number): Promise<void> => {
    if (!isBlocked(userId)) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[unblock]: user ${userId} is not blocked`);
      return;
    }

    await upsert(userId, PrivacyListAction.ALLOW);
  };

  const block = async (userId: number): Promise<void> => {
    if (isBlocked(userId)) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[block]: user ${userId} is already blocked`);
      return;
    }

    await upsert(userId, PrivacyListAction.DENY);
  };

  useEffect(() => {
    if (isConnected) {
      fetch();
    }
  }, [isConnected]);

  return {
    blockedUsers: Array.from(state),
    isBlockedUser: isBlocked,
    unblockUser: unblock,
    blockUser: block,
  };
}

export default useBlockList;
