import ConnectyCube from "connectycube";
import { Users } from "connectycube/types";
import { useCallback, useRef, useState } from "react";
import useStateRef from "react-usestateref";

export const USERS_LOG_TAG = "[useChat][useUsers]";
export const LIST_ONLINE_USERS_INTERVAL = 60000;
export const GET_REQUEST_LIMIT = 100;

export type OnlineUsersRequestData = Users.ListOnlineParams & { requested_at: number };
export type UsersArray = Users.User[];
export type UsersObject = { [userId: Users.User["id"]]: Users.User };
export type UsersLastActivity = { [userId: number]: string };

export type UsersHook = {
  users: UsersObject;
  searchUsers: (term: string) => Promise<UsersArray>;
  listOnlineUsers: (params?: Users.ListOnlineParams, force?: boolean) => Promise<UsersArray>;
  lastActivity: UsersLastActivity;
  getLastActivity: (userId: number) => Promise<string>;
};

export type UsersInternalHook = UsersHook & {
  _retrieveAndStoreUsers: (usersIds: number[]) => Promise<void>;
};

function useUsers(currentUserId?: number): UsersInternalHook {
  const [users, setUsers, usersRef] = useStateRef<UsersObject>({});
  const [onlineUsers, setOnlineUsers] = useState<UsersObject>({});
  const [lastActivity, setLastActivity] = useState<UsersLastActivity>({});

  const onlineUsersRequestDataRef = useRef<OnlineUsersRequestData>({
    limit: GET_REQUEST_LIMIT,
    offset: 0,
    requested_at: 0,
  });

  const _retrieveAndStoreUsers = async (usersIds: number[]): Promise<void> => {
    const usersToFind = usersIds.filter((userId) => !users[userId]);

    if (usersToFind.length > 0) {
      const params = { limit: GET_REQUEST_LIMIT, id: { in: usersToFind } };
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
        limit: GET_REQUEST_LIMIT,
      });
      const { items: usersWithLogin } = await ConnectyCube.users.getV2({
        login: { start_with: term },
        limit: GET_REQUEST_LIMIT,
      });
      const users: Set<Users.User> = new Set([...usersWithFullName, ...usersWithLogin]);
      const result = Array.from(users).filter((user) => user.id !== currentUserId);

      return result;
    },
    [currentUserId],
  );

  const listOnlineUsers = async (
    params: Users.ListOnlineParams = { limit: GET_REQUEST_LIMIT, offset: 0 },
    force: boolean = false,
  ): Promise<UsersArray> => {
    const { limit, offset, requested_at } = onlineUsersRequestDataRef.current;
    const currentTimestamp = Date.now();
    const shouldRequest = currentTimestamp - requested_at > LIST_ONLINE_USERS_INTERVAL;
    const isDifferentParams = params.limit !== limit || params.offset !== offset;

    let onlineUsersState = onlineUsers;

    if (shouldRequest || isDifferentParams || force) {
      try {
        const { users } = await ConnectyCube.users.listOnline(params);

        onlineUsersState = users.reduce<UsersObject>((map, user) => {
          map[user.id] = user;
          return map;
        }, {});

        setUsers({ ...usersRef.current, ...onlineUsersState });
        setOnlineUsers(onlineUsersState);
      } catch (error) {
        console.error(`${USERS_LOG_TAG} Failed to fetch online users`, error);
      }
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
    users,
    searchUsers,
    listOnlineUsers,
    lastActivity,
    getLastActivity,
    _retrieveAndStoreUsers,
  };
}

export default useUsers;
