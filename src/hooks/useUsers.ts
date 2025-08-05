import ConnectyCube from "connectycube";
import { Chat, ChatEvent, Users } from "connectycube/types";
import { useCallback, useEffect, useRef } from "react";
import { getLastActivityText } from "../helpers";
import useChatStore from "./useChatStore";
import { useShallow } from "zustand/shallow";

export const USERS_LOG_TAG = "[useChat][useUsers]";
export const LIMIT_ONLINE_USERS_INTERVAL = 60000;
export const LIMIT_FETCH_USER_INTERVAL = 30000;
export const MAX_REQUEST_LIMIT = 100;

export type UsersArray = Users.User[];
export type UsersObject = { [userId: Users.User["id"]]: Users.User };
export type UsersLastActivity = { [userId: number]: string };
export type FetchUsersLastRequestAt = { [userId: Users.User["id"]]: number };
export type OnlineUsersLastRequestAt = number;

export interface UsersHookExports {
  users: UsersObject;
  getAndStoreUsers: (params: Users.GetV2Params) => Promise<Users.User[]>;
  searchUsers: (term: string) => Promise<UsersArray>;
  fetchUserById: (id: Users.User["id"], force?: boolean) => Promise<Users.User>;
  onlineUsers: UsersArray;
  listOnlineUsers: (force?: boolean) => Promise<UsersArray>;
  listOnlineUsersWithParams: (params: Users.ListOnlineParams) => Promise<UsersArray>;
  onlineUsersCount: number;
  getOnlineUsersCount: () => Promise<number>;
  lastActivity: UsersLastActivity;
  getLastActivity: (userId: number) => Promise<string>;
  subscribeToUserLastActivityStatus: (userId: number) => void;
  unsubscribeFromUserLastActivityStatus: (userId: number) => void;
}

export type UsersHook = {
  exports: UsersHookExports;
  _retrieveAndStoreUsers: (usersIds: number[]) => Promise<void>;
};

function useUsers(currentUserId?: number): UsersHook {
  const [
    users,
    upsertUser,
    upsertUsers,
    onlineUsers,
    setOnlineUsers,
    updateOnlineUser,
    updateOnlineUsers,
    onlineUsersCount,
    setOnlineUsersCount,
    lastActivity,
    upsertLastActivity,
  ] = useChatStore(
    useShallow((state) => [
      state.users,
      state.upsertUser,
      state.upsertUsers,
      state.onlineUsers,
      state.setOnlineUsers,
      state.updateOnlineUser,
      state.updateOnlineUsers,
      state.onlineUsersCount,
      state.setOnlineUsersCount,
      state.lastActivity,
      state.upsertLastActivity,
    ]),
  );

  const onlineUsersLastRequestAtRef = useRef<OnlineUsersLastRequestAt>(0);
  const fetchUsersLastRequestAtRef = useRef<FetchUsersLastRequestAt>({});

  const getAndStoreUsers = async (params: Users.GetV2Params): Promise<Users.User[]> => {
    const { items } = await ConnectyCube.users.getV2(params);

    upsertUsers(items);
    updateOnlineUsers(items);

    items.forEach((user) => {
      fetchUsersLastRequestAtRef.current[user.id] = Date.now();
    });

    return items;
  };

  const _retrieveAndStoreUsers = async (usersIds: number[]): Promise<void> => {
    const usersToFind = usersIds.filter((userId) => !users[userId]);

    if (usersToFind.length > 0) {
      await getAndStoreUsers({ limit: MAX_REQUEST_LIMIT, id: { in: usersToFind } });
    }
  };

  const fetchUserById = async (id: Users.User["id"], force: boolean = false): Promise<Users.User> => {
    const lastRequestedAt = fetchUsersLastRequestAtRef.current[id] || 0;
    const currentTimestamp = Date.now();
    const shouldRequest = currentTimestamp - lastRequestedAt > LIMIT_FETCH_USER_INTERVAL;

    let user = users[id];

    if (shouldRequest || force) {
      const result = await ConnectyCube.users.getV2({ id, limit: 1 });
      const fetchedUser = result?.items?.[0];

      if (fetchedUser) {
        upsertUser(fetchedUser);
        updateOnlineUser(fetchedUser);

        fetchUsersLastRequestAtRef.current[id] = Date.now();
        user = fetchedUser;
      }
    }

    return user;
  };

  const searchUsers = useCallback(
    async (term: string): Promise<UsersArray> => {
      const { items: usersWithFullName } = await ConnectyCube.users.getV2({
        full_name: { start_with: term },
        limit: MAX_REQUEST_LIMIT,
      });
      const { items: usersWithLogin } = await ConnectyCube.users.getV2({
        login: { start_with: term },
        limit: MAX_REQUEST_LIMIT,
      });
      const usersMap: Map<number, Users.User> = new Map();

      [...usersWithFullName, ...usersWithLogin].forEach((user) => {
        usersMap.set(user.id, user);
      });

      return Array.from(usersMap.values()).filter((user) => user.id !== currentUserId);
    },
    [currentUserId],
  );

  const getOnlineUsersCount = async (): Promise<number> => {
    let nextOnlineUsersCount = onlineUsersCount;

    try {
      const { count } = await ConnectyCube.users.getOnlineCount();

      nextOnlineUsersCount = count;
      setOnlineUsersCount(nextOnlineUsersCount);
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[getOnlineCount][Error]:`, error);
    }

    return nextOnlineUsersCount;
  };

  const _listOnline = async (): Promise<UsersArray> => {
    const onlineUsersCount = await getOnlineUsersCount();
    const promises = [];

    try {
      let limit = MAX_REQUEST_LIMIT;
      let offset = 0;

      while (offset < onlineUsersCount) {
        promises.push(ConnectyCube.users.listOnline({ limit, offset }).then(({ users }) => users));
        offset += limit;
      }

      const results = await Promise.all(promises);
      const onlineUsers = results.flat();

      upsertUsers(onlineUsers);
      setOnlineUsers(onlineUsers);

      return onlineUsers;
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[listOnline][Error]:`, error);
      return [];
    }
  };

  const listOnlineUsersWithParams = async (params: Users.ListOnlineParams): Promise<UsersArray> => {
    try {
      const { users: onlineUsers } = await ConnectyCube.users.listOnline(params);

      upsertUsers(onlineUsers);
      setOnlineUsers(onlineUsers);

      return onlineUsers;
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[listOnlineWithParams][Error]:`, error);
      return [];
    }
  };

  const listOnlineUsers = async (force: boolean = false): Promise<UsersArray> => {
    const lastRequestedAt = onlineUsersLastRequestAtRef.current;
    const currentTimestamp = Date.now();
    const shouldRequest = currentTimestamp - lastRequestedAt > LIMIT_ONLINE_USERS_INTERVAL;

    if (shouldRequest || force) {
      const newOnlineUsers = await _listOnline();

      onlineUsersLastRequestAtRef.current = Date.now();

      return newOnlineUsers;
    } else {
      return Object.values(onlineUsers);
    }
  };

  const getLastActivity = async (userId: number): Promise<string> => {
    try {
      const { seconds } = await ConnectyCube.chat.getLastUserActivity(userId);
      const status = getLastActivityText(seconds);

      upsertLastActivity(userId, status);

      return status;
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[getLastActivity][Error]:`, error);
      return "Last seen recently";
    }
  };

  const subscribeToUserLastActivityStatus = (userId: number): void => {
    ConnectyCube.chat.subscribeToUserLastActivityStatus(userId);
  };

  const unsubscribeFromUserLastActivityStatus = (userId: number): void => {
    ConnectyCube.chat.unsubscribeFromUserLastActivityStatus(userId);
  };

  useEffect(() => {
    const processUserLastActivityChange = (
      userId: Chat.LastActivity["userId"],
      seconds: Chat.LastActivity["seconds"],
    ) => {
      if (typeof userId === "number" && seconds >= 0) {
        upsertLastActivity(userId, getLastActivityText(seconds));
      }
    };

    ConnectyCube.chat.addListener(ChatEvent.USER_LAST_ACTIVITY, processUserLastActivityChange);

    return () => {
      ConnectyCube.chat.removeListener(ChatEvent.USER_LAST_ACTIVITY);
    };
  }, []);

  return {
    _retrieveAndStoreUsers,
    exports: {
      users,
      getAndStoreUsers,
      searchUsers,
      fetchUserById,
      onlineUsers: Object.values(onlineUsers),
      listOnlineUsers,
      listOnlineUsersWithParams,
      onlineUsersCount,
      getOnlineUsersCount,
      lastActivity,
      getLastActivity,
      subscribeToUserLastActivityStatus,
      unsubscribeFromUserLastActivityStatus,
    },
  };
}

export default useUsers;
