import ConnectyCube from "connectycube";
import { useEffect, useState } from "react";

export const BLOCK_LIST_NAME = "@ConnectyCube/blockList";

export type BlockListHook = {
  blockedUsers: Set<number>;
  isBlockedUser: (userId: number) => boolean;
  unblockUser: (userId: number) => Promise<void>;
  blockUser: (userId: number) => Promise<void>;
};

enum BlockAction {
  ALLOW = "allow",
  DENY = "deny",
}

function useBlockList(isConnected: boolean): BlockListHook {
  const [state, setState] = useState<Set<number>>(new Set<number>());

  const addToState = (userId: number): void => {
    setState((state) => {
      state.add(userId);
      return state;
    });
  };

  const deleteFromState = (userId: number): void => {
    setState((state) => {
      state.delete(userId);
      return state;
    });
  };

  const isBlocked = (userId: number): boolean => state.has(userId);

  const fetch = async (): Promise<void> => {
    if (!isConnected) {
      return;
    }

    const blockList = await ConnectyCube.chat.privacylist.getList(BLOCK_LIST_NAME);

    if (blockList?.name === BLOCK_LIST_NAME) {
      const newState = blockList.items.reduce((list: Set<number>, item) => {
        if (item.action === BlockAction.DENY) {
          list.add(+item.user_id);
        }
        return list;
      }, new Set<number>());

      setState(newState);
    } else {
      await ConnectyCube.chat.privacylist.create({
        name: BLOCK_LIST_NAME,
        items: [],
      });
      await ConnectyCube.chat.privacylist.setAsDefault(BLOCK_LIST_NAME);
    }
  };

  const update = async (user_id: number, action: BlockAction): Promise<void> => {
    if (!isConnected) {
      return;
    }

    if (action === BlockAction.ALLOW && !isBlocked(user_id)) {
      console.warn("[useChat][useBlockList][update]: user is not blocked");
      return;
    }

    if (action === BlockAction.DENY && isBlocked(user_id)) {
      console.warn("[useChat][useBlockList][update]: user is already blocked");
      return;
    }

    return ConnectyCube.chat.privacylist.update({
      name: BLOCK_LIST_NAME,
      items: [{ user_id, action, mutualBlock: true }],
    });
  };

  const unblock = async (userId: number): Promise<void> => {
    await update(userId, BlockAction.ALLOW);
    deleteFromState(userId);
  };

  const block = async (userId: number): Promise<void> => {
    await update(userId, BlockAction.DENY);
    addToState(userId);
  };

  useEffect(() => {
    if (isConnected) {
      fetch();
    }
  }, [isConnected]);

  return {
    blockedUsers: state,
    isBlockedUser: isBlocked,
    unblockUser: unblock,
    blockUser: block,
  };
}

export default useBlockList;
