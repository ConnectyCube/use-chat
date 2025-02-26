import ConnectyCube from "connectycube";
import { useEffect, useState, useRef } from "react";

export const BLOCK_LIST_LOG_TAG = "[useChat][useBlockList]";
export const BLOCK_LIST_NAME = "ConnectyCubeBlockList";

export type BlockListHook = {
  blockedUsers: number[];
  isBlockedUser: (userId: number) => boolean;
  unblockUser: (userId: number) => Promise<void>;
  blockUser: (userId: number) => Promise<void>;
};

enum BlockAction {
  ALLOW = "allow",
  DENY = "deny",
}

function useBlockList(isConnected: boolean): BlockListHook {
  let isApplied = useRef<boolean>(false).current;

  const [state, setState] = useState<Set<number>>(new Set<number>());

  const updateState = (userId: number, action: BlockAction) => {
    const newState = new Set(state);

    if (action === BlockAction.DENY) {
      newState.add(userId);
    } else if (action === BlockAction.ALLOW) {
      newState.delete(userId);
    }

    setState(newState);
  };

  const isBlocked = (userId: number): boolean => state.has(userId);

  const fetch = async (): Promise<void> => {
    if (!isConnected) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[fetch]: chat is not connected`);
      return;
    }

    const blackListNames = await ConnectyCube.chat.privacylist.getNames();

    if (blackListNames.default === BLOCK_LIST_NAME) {
      const blockList = await ConnectyCube.chat.privacylist.getList(BLOCK_LIST_NAME);
      const newState = blockList.items.reduce((list: Set<number>, item) => {
        if (item.action === BlockAction.DENY) {
          list.add(+item.user_id);
        }
        return list;
      }, new Set<number>());

      isApplied = true;

      setState(newState);
    }
  };

  const upsert = async (user_id: number, action: BlockAction): Promise<void> => {
    if (!isConnected) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[upsert]: ${action} user ${user_id} failed, chat is not connected`);
      return;
    }

    const blockList = {
      name: BLOCK_LIST_NAME,
      items: [{ user_id, action, mutualBlock: true }],
    };

    if (isApplied) {
      await ConnectyCube.chat.privacylist.update(blockList);
    } else {
      await ConnectyCube.chat.privacylist.create(blockList);
      await ConnectyCube.chat.privacylist.setAsDefault(BLOCK_LIST_NAME);
    }
  };

  const unblock = async (userId: number): Promise<void> => {
    if (!isBlocked(userId)) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[unblock]: user ${userId} is not blocked`);
      return;
    }

    await upsert(userId, BlockAction.ALLOW);
    updateState(userId, BlockAction.ALLOW);
  };

  const block = async (userId: number): Promise<void> => {
    if (isBlocked(userId)) {
      console.warn(`${BLOCK_LIST_LOG_TAG}[block]: user ${userId} is already blocked`);
      return;
    }

    await upsert(userId, BlockAction.DENY);
    updateState(userId, BlockAction.DENY);
  };

  useEffect(() => {
    console.warn("useEffect", { isConnected });
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
