import { Chat, Dialogs, Messages } from "connectycube/types";
import { ReactNode } from "react";
import { BlockListHook } from "../hooks/useBlockList";
import { UsersHook } from "../hooks/useUsers";

export interface ChatProviderType {
  children?: ReactNode;
}

export interface ChatContextType extends BlockListHook, UsersHook {
  isOnline: boolean;
  connect: (credentials: Chat.ConnectionParams) => Promise<void>;
  isConnected: boolean;
  disconnect: () => void;
  currentUserId?: number;
  createChat: (userId: number, extensions?: { [key: string]: any }) => Promise<Dialogs.Dialog>;
  createGroupChat: (
    usersIds: number[],
    name: string,
    photo?: string,
    extensions?: { [key: string]: any },
  ) => Promise<Dialogs.Dialog>;
  getDialogs: (filters?: Dialogs.ListParams) => Promise<Dialogs.Dialog[]>;
  dialogs: Dialogs.Dialog[];
  selectedDialog?: Dialogs.Dialog;
  selectDialog: (dialog?: Dialogs.Dialog) => Promise<void>;
  getDialogOpponentId: (dialog?: Dialogs.Dialog) => number | undefined;
  unreadMessagesCount: { total: number; [dialogId: string]: number };
  getMessages: (dialogId: string) => Promise<Messages.Message[]>;
  messages: { [key: string]: Messages.Message[] };
  markDialogAsRead: (dialog: Dialogs.Dialog) => Promise<void>;
  addUsersToGroupChat: (usersIds: number[]) => Promise<void>;
  removeUsersFromGroupChat: (usersIds: number[]) => Promise<void>;
  leaveGroupChat: () => Promise<void>;
  sendMessage: (body: string, dialog?: Dialogs.Dialog) => void;
  sendMessageWithAttachment: (files: File[], dialog?: Dialogs.Dialog) => Promise<void>;
  readMessage: (messageId: string, userId: number, dialogId: string) => void;
  sendTypingStatus: (dialog?: Dialogs.Dialog) => void;
  typingStatus: {
    [dialogId: string]: { [userId: string]: boolean };
  };
  lastMessageSentTimeString: (dialog: Dialogs.Dialog) => string;
  messageSentTimeString: (message: Messages.Message) => string;
  processOnMessage: (fn: Chat.OnMessageListener | null) => void;
  processOnMessageError: (fn: Chat.OnMessageErrorListener | null) => void;
}

export enum GroupChatEventType {
  ADDED_TO_DIALOG = "dialog/ADDED_TO_DIALOG",
  REMOVED_FROM_DIALOG = "dialog/REMOVED_FROM_DIALOG",
  ADD_PARTICIPANTS = "dialog/ADD_PARTICIPANTS",
  REMOVE_PARTICIPANTS = "dialog/REMOVE_PARTICIPANTS",
  NEW_DIALOG = "dialog/NEW_DIALOG",
}
