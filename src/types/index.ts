import { Chat, Dialogs, Messages } from "connectycube/types";
import { ReactNode } from "react";
import { BlockListHook } from "../hooks/useBlockList";
import { UsersHookExports } from "../hooks/useUsers";
import { NetworkStatusHook } from "../hooks/useNetworkStatus";

export interface ChatProviderType {
  children?: ReactNode;
}

export interface ChatContextType extends BlockListHook, UsersHookExports, NetworkStatusHook {
  isConnected: boolean;
  chatStatus: ChatStatus;
  connect: (credentials: Chat.ConnectionParams) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  terminate: () => void;
  currentUserId?: number;
  createChat: (userId: number, extensions?: { [key: string]: any }) => Promise<Dialogs.Dialog>;
  createGroupChat: (
    usersIds: number[],
    name: string,
    photo?: string,
    extensions?: { [key: string]: any },
  ) => Promise<Dialogs.Dialog>;
  getDialogs: (filters?: Dialogs.ListParams) => Promise<Dialogs.Dialog[]>;
  getNextDialogs: () => Promise<Dialogs.Dialog[]>;
  totalDialogReached: boolean;
  dialogs: Dialogs.Dialog[];
  selectedDialog?: Dialogs.Dialog;
  selectDialog: (dialog?: Dialogs.Dialog) => Promise<void>;
  getDialogOpponentId: (dialog?: Dialogs.Dialog) => number | undefined;
  unreadMessagesCount: { total: number; [dialogId: string]: number };
  getMessages: (dialogId: string) => Promise<Messages.Message[]>;
  getNextMessages: (dialogId: string) => Promise<Messages.Message[]>;
  totalMessagesReached: { [dialogId: string]: boolean };
  messages: { [key: string]: Messages.Message[] };
  markDialogAsRead: (dialog: Dialogs.Dialog) => Promise<void>;
  addUsersToGroupChat: (usersIds: number[]) => Promise<void>;
  removeUsersFromGroupChat: (usersIds: number[]) => Promise<void>;
  leaveGroupChat: () => Promise<void>;
  sendSignal: (userIdOrIds: number | number[], signal: string, params?: any) => void;
  sendMessage: (body: string, dialog?: Dialogs.Dialog) => void;
  sendMessageWithAttachment: (files: File[], dialog?: Dialogs.Dialog) => Promise<void>;
  readMessage: (messageId: string, userId: number, dialogId: string) => void;
  addTempMessage: (dialog?: Dialogs.Dialog, props?: any) => Messages.Message;
  updateTempMessage: (id: string, dialog?: Dialogs.Dialog, props?: any) => Messages.Message;
  sendTypingStatus: (dialog?: Dialogs.Dialog, isTyping?: boolean) => void;
  typingStatus: { [dialogId: string]: number[] };
  lastMessageSentTimeString: (dialog: Dialogs.Dialog) => string;
  messageSentTimeString: (message: Messages.Message) => string;
  processOnSignal: (fn: Chat.OnMessageSystemListener | null) => void;
  processOnMessage: (fn: Chat.OnMessageListener | null) => void;
  processOnMessageError: (fn: Chat.OnMessageErrorListener | null) => void;
  processOnMessageSent: (fn: Chat.OnMessageSentListener | null) => void;
}

export enum DialogEventSignal {
  ADDED_TO_DIALOG = "dialog/ADDED_TO_DIALOG",
  REMOVED_FROM_DIALOG = "dialog/REMOVED_FROM_DIALOG",
  ADD_PARTICIPANTS = "dialog/ADD_PARTICIPANTS",
  REMOVE_PARTICIPANTS = "dialog/REMOVE_PARTICIPANTS",
  NEW_DIALOG = "dialog/NEW_DIALOG",
}

export enum MessageStatus {
  WAIT = "wait",
  LOST = "lost",
  SENT = "sent",
  READ = "read",
}

export enum ChatStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  NOT_AUTHORIZED = "not-authorized",
  ERROR = "error",
}
