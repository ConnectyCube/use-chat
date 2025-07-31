import { Users } from "connectycube/types";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type UserItem = Users.User;
export type UsersArray = UserItem[];
export type UsersObject = { [key: number]: UserItem };
export type UsersLastActivity = { [key: number]: string };

export interface BlockListStoreState {
  blockedUsers: Set<number>;
}
export interface NetworkStatusStoreState {
  isOnline: boolean;
}
export interface UsersStoreState {
  users: UsersObject;
  onlineUsers: UsersObject;
  onlineUsersCount: number;
  lastActivity: UsersLastActivity;
}
export interface ChatStoreState extends NetworkStatusStoreState, BlockListStoreState, UsersStoreState {}

export interface BlockListStoreActions {}
export interface NetworkStatusStoreActions {
  setIsOnline: (isOnline: boolean) => void;
}
export interface UsersStoreActions {
  upsertUser: (user: UserItem) => void;
  upsertUsers: (users: UsersArray) => void;
  setOnlineUsers: (onlineUsers: UsersArray) => void;
  updateOnlineUser: (onlineUser: UserItem) => void;
  updateOnlineUsers: (onlineUsers: UsersArray) => void;
  setOnlineUsersCount: (onlineUsersCount: number) => void;
  upsertLastActivity: (userId: number, status: string) => void;
}
export interface ChatStoreActions extends NetworkStatusStoreActions, BlockListStoreActions, UsersStoreActions {
  resetStore: () => void;
}

interface ChatStore extends ChatStoreState, ChatStoreActions {}

const initialBlockListState = {
  blockedUsers: new Set<number>(),
};
const initialNetworkStatusState = {
  isOnline: navigator.onLine,
};
const initialUsersState = {
  users: {},
  onlineUsers: {},
  onlineUsersCount: 0,
  lastActivity: {},
};
const initialState: ChatStoreState = {
  ...initialBlockListState,
  ...initialNetworkStatusState,
  ...initialUsersState,
};

const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    upsertUser: (user: UserItem) => set({ users: { ...get().users, [user.id]: user } }),
    upsertUsers: (users: UsersArray) =>
      set({ users: users.reduce<UsersObject>((map, user) => ({ ...map, [user.id]: user }), { ...get().users }) }),
    setOnlineUsers: (onlineUsers: UsersArray) =>
      set({
        onlineUsers: onlineUsers.reduce<UsersObject>((map, user) => ({ ...map, [user.id]: user }), {}),
      }),
    updateOnlineUser: (onlineUser: UserItem) =>
      get().onlineUsers[onlineUser.id]
        ? set({ onlineUsers: { ...get().onlineUsers, [onlineUser.id]: onlineUser } })
        : void 0,
    updateOnlineUsers: (users: UsersArray) =>
      set({
        onlineUsers: users.reduce<UsersObject>((map, user) => (map[user.id] ? { ...map, [user.id]: user } : map), {
          ...get().onlineUsers,
        }),
      }),
    setOnlineUsersCount: (onlineUsersCount: number) => set({ onlineUsersCount }),
    upsertLastActivity: (userId: number, status: string) =>
      set({ lastActivity: { ...get().lastActivity, [userId]: status } }),

    setIsOnline: (isOnline?: boolean) => set({ isOnline }),
    resetStore: () => set({ ...initialState }),
  })),
);

export default useChatStore;
