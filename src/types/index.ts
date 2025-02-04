import { Chat, Dialogs, Messages, Users } from "connectycube/dist/types/types";
import { ReactNode } from "react";

export interface ChatProviderType {
  children?: ReactNode;
}

export interface ChatContextType {
  isOnline: boolean;
  connect: (credentials: Chat.ConnectionParams) => Promise<void>;
  isConnected: boolean;
  disconnect: () => void;
  currentUserId?: number;
  createChat: (userId: number) => Promise<Dialogs.Dialog>;
  createGroupChat: (
    usersIds: number[],
    chatName: string
  ) => Promise<Dialogs.Dialog>;
  getDialogs: (filters?: Dialogs.ListParams) => Promise<Dialogs.Dialog[]>;
  dialogs: Dialogs.Dialog[];
  selectedDialog?: Dialogs.Dialog;
  selectDialog: (dialog: Dialogs.Dialog) => Promise<void>;
  getDialogOpponentId: (dialog?: Dialogs.Dialog) => number | undefined;
  users: { [userId: number]: Users.User };
  getMessages: (dialogId: string) => Promise<Messages.Message[]>;
  messages: { [key: string]: Messages.Message[] };
  markDialogAsRead: (dialog: Dialogs.Dialog) => Promise<void>;
  addUsersToGroupChat: (usersIds: number[]) => Promise<void>;
  removeUsersFromGroupChat: (usersIds: number[]) => Promise<void>;
  leaveGroupChat: () => Promise<void>;
  sendMessage: (body: string, dialog?: Dialogs.Dialog) => void;
  sendMessageWithAttachment: (
    file: File,
    dialog?: Dialogs.Dialog
  ) => Promise<void>;
  readMessage: (messageId: string, userId: number, dialogId: string) => void;
  searchUsers: (term: string) => Promise<Users.User[]>;
  listOnlineUsers: (params?: Users.ListOnlineParams, force?: boolean) => Promise<Users.User[]>;
  sendTypingStatus: (dialog?: Dialogs.Dialog) => void;
  typingStatus: {
    [dialogId: string]: { [userId: string]: boolean };
  };
  getLastActivity: (userId: number) => Promise<string>;
  lastActivity: { [userId: number]: string };
  lastMessageSentTimeString: (dialog: Dialogs.Dialog) => string;
  messageSentTimeString: (message: Messages.Message) => string;
}

export interface FileAttachment {
  uid: string;
  type: string;
}

export enum GroupChatEventType {
  ADDED_TO_DIALOG = "dialog/ADDED_TO_DIALOG",
  REMOVED_FROM_DIALOG = "dialog/REMOVED_FROM_DIALOG",
  ADD_PARTICIPANTS = "dialog/ADD_PARTICIPANTS",
  REMOVE_PARTICIPANTS = "dialog/REMOVE_PARTICIPANTS",
  NEW_DIALOG = "dialog/NEW_DIALOG",
}
