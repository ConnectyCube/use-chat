import ConnectyCube from "connectycube";
import { Chat, ChatEvent, Users } from "connectycube/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLastActivityText } from "../helpers";

export const USERS_LOG_TAG = "[useChat][useUsers]";
export const LIMIT_ONLINE_USERS_INTERVAL = 60000;
export const LIMIT_FETCH_USER_INTERVAL = 30000;
export const MAX_REQUEST_LIMIT = 100;

export type FetchUsersLastRequestAt = { [userId: Users.User["id"]]: number };
export type OnlineUsersLastRequestAt = number;
export type UsersArray = Users.User[];
export type UsersObject = { [userId: Users.User["id"]]: Users.User };
export type UsersLastActivity = { [userId: number]: string };

export type UsersHookExports = {
  users: UsersObject;
  getAndStoreUsers: (params: Users.GetV2Params) => Promise<Users.User[]>;
  searchUsers: (term: string) => Promise<UsersArray>;
  fetchUserById: (id: Users.User["id"], force?: boolean) => Promise<Users.User>;
  listOnlineUsers: (force?: boolean) => Promise<UsersArray>;
  listOnlineUsersWithParams: (params: Users.ListOnlineParams) => Promise<UsersArray>;
  onlineUsers: UsersArray;
  getOnlineUsersCount: () => Promise<number>;
  onlineUsersCount: number;
  lastActivity: UsersLastActivity;
  getLastActivity: (userId: number) => Promise<string>;
  subscribeToUserLastActivityStatus: (userId: number) => void;
  unsubscribeFromUserLastActivityStatus: (userId: number) => void;
};

export type UsersHook = {
  exports: UsersHookExports;
  _retrieveAndStoreUsers: (usersIds: number[]) => Promise<void>;
};

function useUsers(currentUserId?: number): UsersHook {
  const [users, setUsers] = useState<UsersObject>({});
  const [onlineUsers, setOnlineUsers] = useState<UsersObject>({});
  const [onlineUsersCount, setOnlineUsersCount] = useState<number>(0);
  const [lastActivity, setLastActivity] = useState<UsersLastActivity>({});

  const onlineUsersLastRequestAtRef = useRef<OnlineUsersLastRequestAt>(0);
  const fetchUsersLastRequestAtRef = useRef<FetchUsersLastRequestAt>({});

  const getAndStoreUsers = async (params: Users.GetV2Params): Promise<Users.User[]> => {
    const { items } = await ConnectyCube.users.getV2(params);

    setUsers((prevUsersState) =>
      items.reduce<UsersObject>(
        (map, user) => {
          map[user.id] = user;
          return map;
        },
        { ...prevUsersState },
      ),
    );

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
        setUsers((prevState) => ({ ...prevState, [id]: fetchedUser }));
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

  const _listOnline = async (): Promise<UsersObject> => {
    const onlineUsersCount = await getOnlineUsersCount();
    const promises = [];

    let onlineUsersState: UsersObject = {};

    try {
      let limit = MAX_REQUEST_LIMIT;
      let offset = 0;

      while (offset < onlineUsersCount) {
        promises.push(ConnectyCube.users.listOnline({ limit, offset }).then(({ users }) => users));
        offset += limit;
      }

      const results = await Promise.all(promises);
      const allUsers = results.flat();

      onlineUsersState = allUsers.reduce<UsersObject>((map, user) => {
        map[user.id] = user;
        return map;
      }, {});

      setUsers((prevUsersState) => ({ ...prevUsersState, ...onlineUsersState }));
      setOnlineUsers(onlineUsersState);
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[listOnline][Error]:`, error);
    }

    return onlineUsersState;
  };

  const listOnlineUsersWithParams = async (params: Users.ListOnlineParams): Promise<UsersArray> => {
    let onlineUsersState: UsersObject = {};

    try {
      const { users: allUsers } = await ConnectyCube.users.listOnline(params);

      onlineUsersState = allUsers.reduce<UsersObject>((map, user) => {
        map[user.id] = user;
        return map;
      }, {});

      setUsers((prevUsersState) => ({ ...prevUsersState, ...onlineUsersState }));
      setOnlineUsers(onlineUsersState);
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[listOnlineWithParams][Error]:`, error);
    }

    return Object.values(onlineUsersState);
  };

  const listOnlineUsers = async (force: boolean = false): Promise<UsersArray> => {
    const lastRequestedAt = onlineUsersLastRequestAtRef.current;
    const currentTimestamp = Date.now();
    const shouldRequest = currentTimestamp - lastRequestedAt > LIMIT_ONLINE_USERS_INTERVAL;

    let onlineUsersState = onlineUsers;

    if (shouldRequest || force) {
      onlineUsersState = await _listOnline();
      onlineUsersLastRequestAtRef.current = Date.now();
    }

    return Object.values(onlineUsersState);
  };

  const getLastActivity = async (userId: number): Promise<string> => {
    let status = "Last seen recently";

    try {
      const { seconds } = await ConnectyCube.chat.getLastUserActivity(userId);
      status = getLastActivityText(seconds);
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[getLastActivity][Error]:`, error);
    } finally {
      setLastActivity((prevLastActivity) => ({ ...prevLastActivity, [userId]: status }));
      return status;
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
        const status = getLastActivityText(seconds);
        setLastActivity((prevLastActivity) => ({ ...prevLastActivity, [userId]: status }));
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
      listOnlineUsers,
      listOnlineUsersWithParams,
      onlineUsers: Object.values(onlineUsers),
      getOnlineUsersCount,
      onlineUsersCount,
      lastActivity,
      getLastActivity,
      subscribeToUserLastActivityStatus,
      unsubscribeFromUserLastActivityStatus,
    },
  };
}

export default useUsers;
