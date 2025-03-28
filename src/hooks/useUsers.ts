import ConnectyCube from "connectycube";
import { Users } from "connectycube/types";
import { useCallback, useRef, useState } from "react";
import useStateRef from "react-usestateref";

export const USERS_LOG_TAG = "[useChat][useUsers]";
export const LIST_ONLINE_USERS_INTERVAL = 60000;
export const MAX_REQUEST_LIMIT = 100;

export type OnlineUsersLastRequestAt = number;
export type UsersArray = Users.User[];
export type UsersObject = { [userId: Users.User["id"]]: Users.User };
export type UsersLastActivity = { [userId: number]: string };

export type UsersHookExports = {
  users: UsersObject;
  searchUsers: (term: string) => Promise<UsersArray>;
  listOnlineUsers: (force?: boolean) => Promise<UsersArray>;
  listOnlineUsersWithParams: (params: Users.ListOnlineParams) => Promise<UsersArray>;
  onlineUsers: UsersArray;
  getOnlineUsersCount: () => Promise<number>;
  onlineUsersCount: number;
  lastActivity: UsersLastActivity;
  getLastActivity: (userId: number) => Promise<string>;
};

export type UsersHook = {
  exports: UsersHookExports;
  _retrieveAndStoreUsers: (usersIds: number[]) => Promise<void>;
};

function useUsers(currentUserId?: number): UsersHook {
  const [users, setUsers, usersRef] = useStateRef<UsersObject>({});
  const [onlineUsers, setOnlineUsers] = useState<UsersObject>({});
  const [onlineUsersCount, setOnlineUsersCount] = useState<number>(0);
  const [lastActivity, setLastActivity] = useState<UsersLastActivity>({});

  const onlineUsersLastRequestAtRef = useRef<OnlineUsersLastRequestAt>(0);

  const _retrieveAndStoreUsers = async (usersIds: number[]): Promise<void> => {
    const usersToFind = usersIds.filter((userId) => !users[userId]);

    if (usersToFind.length > 0) {
      const params = { limit: MAX_REQUEST_LIMIT, id: { in: usersToFind } };
      const { items } = await ConnectyCube.users.getV2(params);
      const nextUsersState = items.reduce<UsersObject>(
        (map, user) => {
          map[user.id] = user;
          return map;
        },
        { ...usersRef.current },
      );

      setUsers(nextUsersState);
    }
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

      setUsers({ ...usersRef.current, ...onlineUsersState });
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

      setUsers({ ...usersRef.current, ...onlineUsersState });
      setOnlineUsers(onlineUsersState);
    } catch (error) {
      console.error(`${USERS_LOG_TAG}[listOnlineWithParams][Error]:`, error);
    }

    return Object.values(onlineUsersState);
  };

  const listOnlineUsers = async (force: boolean = false): Promise<UsersArray> => {
    const lastRequestedAt = onlineUsersLastRequestAtRef.current;
    const currentTimestamp = Date.now();
    const shouldRequest = currentTimestamp - lastRequestedAt > LIST_ONLINE_USERS_INTERVAL;

    let onlineUsersState = onlineUsers;

    if (shouldRequest || force) {
      onlineUsersState = await _listOnline();
      onlineUsersLastRequestAtRef.current = Date.now();
    }

    return Object.values(onlineUsersState);
  };

  const getLastActivity = async (userId: number): Promise<string> => {
    try {
      const result = await ConnectyCube.chat.getLastUserActivity(userId);
      const secondsAgo = result.seconds;
      const lastLoggedInTime = new Date(Date.now() - secondsAgo * 1000);

      let status;

      if (secondsAgo <= 30) {
        status = "Online";
      } else if (secondsAgo < 3600) {
        const minutesAgo = Math.ceil(secondsAgo / 60);
        status = `Last seen ${minutesAgo} minutes ago`;
      } else {
        const hoursAgo = Math.ceil(secondsAgo / 3600);
        const currentHour = new Date().getHours();

        if (currentHour - hoursAgo <= 0) {
          const day = lastLoggedInTime.getUTCDate();
          const month = lastLoggedInTime.getMonth() + 1;
          const year = lastLoggedInTime.getFullYear();
          status = `Last seen ${day}/${month.toString().padStart(2, "0")}/${year}`;
        } else {
          status = `Last seen ${hoursAgo} hours ago`;
        }
      }

      // Update last activity and trigger any necessary updates
      lastActivity[userId] = status;
      setLastActivity({ ...lastActivity });

      return status;
    } catch (error) {
      const fallbackStatus = "Last seen recently";
      lastActivity[userId] = fallbackStatus;
      setLastActivity({ ...lastActivity });
      return fallbackStatus;
    }
  };

  return {
    _retrieveAndStoreUsers,
    exports: {
      users,
      searchUsers,
      listOnlineUsers,
      listOnlineUsersWithParams,
      onlineUsers: Object.values(onlineUsers),
      getOnlineUsersCount,
      onlineUsersCount,
      lastActivity,
      getLastActivity,
    },
  };
}

export default useUsers;
