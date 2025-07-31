import { createContext, useContext, useEffect, useRef, useState } from "react";
import useStateRef from "react-usestateref";
import ConnectyCube from "connectycube";
import { Chat, ChatEvent, ChatType, Dialogs, DialogType, Messages } from "connectycube/types";
import { formatDistanceToNow } from "date-fns";
import { ChatContextType, ChatProviderType, ChatStatus, DialogEventSignal, MessageStatus } from "./types";
import { useBlockList, useChatStore, useNetworkStatus, useUsers } from "./hooks";
import { getDialogTimestamp, parseDate } from "./helpers";

const ChatContext = createContext<ChatContextType | undefined>(undefined);
ChatContext.displayName = "ChatContext";

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChat must be within ChatProvider");
  }

  return context;
};

export const ChatProvider = ({ children }: ChatProviderType): React.ReactElement => {
  // state
  const [isConnected, setIsConnected] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<ChatContextType["unreadMessagesCount"]>({ total: 0 });
  const [typingStatus, setTypingStatus] = useState<{ [dialogId: string]: number[] }>({});
  const [totalMessagesReached, setTotalMessagesReached] = useState<{ [dialogId: string]: boolean }>({});
  const [totalDialogReached, setTotalDialogReached] = useState<boolean>(false);
  // state refs
  const [messages, setMessages, messagesRef] = useStateRef<{ [dialogId: string]: Messages.Message[] }>({});
  const [dialogs, setDialogs, dialogsRef] = useStateRef<Dialogs.Dialog[]>([]);
  const [currentUserId, setCurrentUserId, currentUserIdRef] = useStateRef<number | undefined>();
  const [selectedDialog, setSelectedDialog, selectedDialogRef] = useStateRef<Dialogs.Dialog | undefined>();
  const [chatStatus, setChatStatus, chatStatusRef] = useStateRef(ChatStatus.DISCONNECTED);
  // refs
  const typingTimers = useRef<{ [dialogId: string]: { [userId: number | string]: NodeJS.Timeout } }>({});
  const onMessageRef = useRef<Chat.OnMessageListener | null>(null);
  const onSignalRef = useRef<Chat.OnMessageSystemListener | null>(null);
  const onMessageSentRef = useRef<Chat.OnMessageSentListener | null>(null);
  const onMessageErrorRef = useRef<Chat.OnMessageErrorListener | null>(null);
  const activatedDialogsRef = useRef<{ [dialogId: string]: boolean }>({});
  const privateDialogsIdsRef = useRef<{ [userId: number | string]: string }>({});
  // internal hooks
  const chatBlockList = useBlockList(isConnected);
  const chatUsers = useUsers(currentUserId);
  useNetworkStatus(isConnected);
  const { _retrieveAndStoreUsers } = chatUsers;
  // global state
  const isOnline = useChatStore((state) => state.isOnline);

  const connect = async (credentials: Chat.ConnectionParams): Promise<boolean> => {
    setChatStatus(ChatStatus.CONNECTING);

    try {
      const _isConnected = await ConnectyCube.chat.connect(credentials);

      if (_isConnected) {
        setChatStatus(ChatStatus.CONNECTED);
        setIsConnected(_isConnected);
        setCurrentUserId(credentials.userId);
      }

      return _isConnected;
    } catch (error) {
      setChatStatus(ChatStatus.DISCONNECTED);
      console.error(`Failed to connect due to ${error}`);

      return false;
    }
  };

  const disconnect = async (status: ChatStatus = ChatStatus.DISCONNECTED): Promise<boolean> => {
    let disconnected = false;

    if (ConnectyCube.chat.isConnected) {
      disconnected = await ConnectyCube.chat.disconnect();

      setIsConnected(false);
      setCurrentUserId(undefined);
      setChatStatus(status);
      _resetDialogsAndMessagesProgress();
    }

    return disconnected;
  };

  const terminate = (status: ChatStatus = ChatStatus.DISCONNECTED): void => {
    ConnectyCube.chat.terminate();
    setChatStatus(status);
    _resetDialogsAndMessagesProgress();
    _markMessagesAsLostInStore();
  };

  const _resetDialogsAndMessagesProgress = () => {
    activatedDialogsRef.current = {};
    setTotalDialogReached(false);
    setTotalMessagesReached({});
  };

  const _establishConnection = async (online: boolean) => {
    if (online && chatStatusRef.current !== ChatStatus.ERROR) {
      if (chatStatusRef.current === ChatStatus.DISCONNECTED || chatStatusRef.current === ChatStatus.NOT_AUTHORIZED) {
        setChatStatus(ChatStatus.CONNECTING);
      }
    } else {
      try {
        await ConnectyCube.chat.pingWithTimeout(1000);
        setChatStatus(ChatStatus.CONNECTED);
      } catch (error) {
        terminate();
      }
    }
  };

  const createChat = async (userId: number, extensions?: { [key: string]: any }): Promise<Dialogs.Dialog> => {
    const params = { type: DialogType.PRIVATE, occupants_ids: [userId], extensions };
    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs((prevDialogs) => [dialog, ...prevDialogs.filter((d) => d._id !== dialog._id)]);
    setTotalMessagesReached((prevState) => ({ ...prevState, [dialog._id]: true }));

    privateDialogsIdsRef.current[userId] = dialog._id;

    _notifyUsers(DialogEventSignal.NEW_DIALOG, dialog._id, userId);
    _retrieveAndStoreUsers([userId, currentUserId as number]);

    return dialog;
  };

  const createGroupChat = async (
    usersIds: number[],
    name: string,
    photo?: string,
    extensions?: { [key: string]: any },
  ): Promise<Dialogs.Dialog> => {
    const params = { name, photo, type: DialogType.GROUP, occupants_ids: usersIds, extensions };
    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs((prevDialogs) => [dialog, ...prevDialogs.filter((d) => d._id !== dialog._id)]);
    setTotalMessagesReached((prevState) => ({ ...prevState, [dialog._id]: true }));

    usersIds.forEach((userId) => {
      _notifyUsers(DialogEventSignal.NEW_DIALOG, dialog._id, userId);
    });
    _retrieveAndStoreUsers([...usersIds, currentUserId as number]);

    return dialog;
  };

  const getDialogs = async (filters?: Dialogs.ListParams): Promise<Dialogs.Dialog[]> => {
    const params = { sort_desc: "date_sent", limit: 100, skip: 0, ...filters };
    const { items: fetchedDialogs, skip, limit, total_entries } = await ConnectyCube.chat.dialog.list(params);
    const reached = skip + limit >= total_entries;

    setTotalDialogReached(reached);
    setDialogs((prevDialogs) => {
      const allDialogs = [...prevDialogs, ...fetchedDialogs];
      const uniqueDialogs = Array.from(new Map(allDialogs.map((d) => [d._id, d])).values());
      return uniqueDialogs.sort((a, b) => getDialogTimestamp(b) - getDialogTimestamp(a));
    });

    const usersIds = fetchedDialogs.flatMap((dialog) => dialog.occupants_ids);
    const uniqueUsersIds = Array.from(new Set(usersIds));

    _retrieveAndStoreUsers(uniqueUsersIds);

    return fetchedDialogs;
  };

  const getNextDialogs = async (): Promise<Dialogs.Dialog[]> => {
    const skip = dialogsRef.current.length;

    return getDialogs({ skip });
  };

  const _listMessagesByDialogId = async (
    dialogId: string,
    listParams: Messages.ListParams = {},
  ): Promise<Messages.Message[]> => {
    const params = { chat_dialog_id: dialogId, sort_desc: "date_sent", limit: 100, skip: 0, ...listParams };

    try {
      const { items: fetchedMessages, skip, limit } = await ConnectyCube.chat.message.list(params);
      const existedMessages = messagesRef.current[dialogId] ?? [];
      const reached = skip + limit > fetchedMessages.length + existedMessages.length;

      setTotalMessagesReached((prevState) => ({ ...prevState, [dialogId]: reached }));

      return fetchedMessages
        .sort((a: Messages.Message, b: Messages.Message) => {
          return a._id.toString().localeCompare(b._id.toString()); // revers sort
        })
        .map((msg) => {
          const attachments = msg.attachments?.map((attachment) => ({
            ...attachment,
            url: ConnectyCube.storage.privateUrl(attachment.uid),
          }));
          return { ...msg, attachments, status: msg.read ? MessageStatus.READ : MessageStatus.SENT };
        });
    } catch (error: any) {
      if (error.code === 404) {
        return []; // dialog not found
      }
      throw error;
    }
  };

  const getMessages = async (dialogId: string): Promise<Messages.Message[]> => {
    try {
      const retrievedMessages = await _listMessagesByDialogId(dialogId);

      setMessages((prevMessages) => ({ ...prevMessages, [dialogId]: retrievedMessages }));

      return retrievedMessages;
    } catch (error: any) {
      throw error;
    }
  };

  const getNextMessages = async (dialogId: string): Promise<Messages.Message[]> => {
    const dialogMessages = messagesRef.current[dialogId] ?? [];
    const skip = dialogMessages.length;

    try {
      const retrievedMessages = await _listMessagesByDialogId(dialogId, { skip });
      const allDialogMessages = [...retrievedMessages, ...dialogMessages];

      setMessages((prevMessages) => ({ ...prevMessages, [dialogId]: allDialogMessages }));

      return allDialogMessages;
    } catch (error: any) {
      throw error;
    }
  };

  const selectDialog = async (dialog?: Dialogs.Dialog): Promise<void> => {
    setSelectedDialog(dialog);

    if (!dialog) return;

    // retrieve messages if chat is not activated yet
    if (!activatedDialogsRef.current[dialog._id]) {
      await getMessages(dialog._id);
      activatedDialogsRef.current[dialog._id] = true;
    }

    if (dialog.unread_messages_count > 0) {
      await markDialogAsRead(dialog).catch((_error) => {});
    }
  };

  const getDialogOpponentId = (dialog?: Dialogs.Dialog): number | undefined => {
    dialog ??= selectedDialog;

    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    if (dialog.type !== DialogType.PRIVATE) {
      return undefined;
    }

    const opponentId = dialog.occupants_ids.find((oid) => oid !== currentUserId);

    if (opponentId) {
      privateDialogsIdsRef.current[opponentId] = dialog._id;
    }

    return opponentId;
  };

  const _updateUnreadMessagesCount = () => {
    const count: ChatContextType["unreadMessagesCount"] = { total: 0 };

    dialogs.forEach(({ _id, unread_messages_count = 0 }: Dialogs.Dialog) => {
      if (_id !== selectedDialog?._id) {
        count[_id] = unread_messages_count;
        count.total += unread_messages_count;
      }
    });

    setUnreadMessagesCount(count);
  };

  const markDialogAsRead = async (dialog: Dialogs.Dialog): Promise<void> => {
    const params = { read: 1, chat_dialog_id: dialog._id };
    await ConnectyCube.chat.message.update("", params);

    setDialogs((prevDialogs) =>
      prevDialogs.map((d) => (d._id === dialog._id ? { ...d, unread_messages_count: 0 } : d)),
    );
  };

  const addUsersToGroupChat = async (usersIds: number[]): Promise<void> => {
    if (!selectedDialog) {
      throw new Error("No dialog selected");
    }

    const dialogId = selectedDialog._id;
    const toUpdateParams = { push_all: { occupants_ids: usersIds } };

    await ConnectyCube.chat.dialog.update(dialogId, toUpdateParams);

    selectedDialog.occupants_ids
      .filter((userId) => userId !== currentUserId)
      .forEach((userId) => {
        _notifyUsers(DialogEventSignal.ADD_PARTICIPANTS, dialogId, userId, {
          addedParticipantsIds: usersIds.join(),
        });
      });

    usersIds.forEach((userId) => {
      _notifyUsers(DialogEventSignal.ADDED_TO_DIALOG, dialogId, userId);
    });

    _retrieveAndStoreUsers(usersIds);

    const updatedDialog = {
      ...selectedDialog,
      occupants_ids: Array.from(new Set([...selectedDialog.occupants_ids, ...usersIds])),
    };

    setDialogs((prevDialogs) => prevDialogs.map((d) => (d._id === dialogId ? updatedDialog : d)));
    setSelectedDialog(updatedDialog);
  };

  const removeUsersFromGroupChat = async (usersIds: number[]): Promise<void> => {
    if (!selectedDialog) {
      throw new Error("No dialog selected");
    }

    const dialogId = selectedDialog._id;
    const toUpdateParams = { pull_all: { occupants_ids: usersIds } };

    await ConnectyCube.chat.dialog.update(dialogId, toUpdateParams);

    usersIds.forEach((userId) => {
      _notifyUsers(DialogEventSignal.REMOVED_FROM_DIALOG, dialogId, userId);
    });

    selectedDialog.occupants_ids
      .filter((userId) => {
        return !usersIds.includes(userId) && userId !== currentUserId;
      })
      .forEach((userId) => {
        _notifyUsers(DialogEventSignal.REMOVE_PARTICIPANTS, dialogId, userId, {
          removedParticipantsIds: usersIds.join(),
        });
      });

    const updatedDialog = {
      ...selectedDialog,
      occupants_ids: selectedDialog.occupants_ids.filter((userId) => !usersIds.includes(userId)),
    };

    setDialogs((prevDialogs) => prevDialogs.map((d) => (d._id === dialogId ? updatedDialog : d)));
    setSelectedDialog(updatedDialog);
  };

  const leaveGroupChat = async (): Promise<void> => {
    if (!selectedDialog) {
      throw new Error("No dialog selected");
    }

    await ConnectyCube.chat.dialog.delete(selectedDialog._id);

    selectedDialog.occupants_ids
      .filter((userId) => userId !== currentUserId)
      .forEach((userId) => {
        _notifyUsers(DialogEventSignal.REMOVED_FROM_DIALOG, selectedDialog._id, userId);
      });

    setDialogs(dialogs.filter((dialog) => dialog._id !== selectedDialog._id));
    setSelectedDialog(undefined);
  };

  const sendMessage = (body: string, dialog?: Dialogs.Dialog) => {
    dialog ??= selectedDialog;

    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    const opponentId = getDialogOpponentId(dialog);
    const messageId = _sendMessage(body, null, dialog, opponentId);

    _addMessageToStore(messageId, body, dialog._id, currentUserId as number, opponentId);
  };

  const sendMessageWithAttachment = async (files: File[], dialog?: Dialogs.Dialog): Promise<void> => {
    dialog ??= selectedDialog;

    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    const opponentId = getDialogOpponentId(dialog);
    const tempId = Date.now() + "";
    const attachments = files.map((file, index) => ({
      uid: `local-${tempId}-${index}`, // temporary uid
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    _addMessageToStore(tempId, "Attachment", dialog._id, currentUserId as number, opponentId, attachments, true);

    const uploadFilesPromises = files.map((file) => {
      const { name, type, size } = file;
      const fileParams = { file, name, type, size, public: false };
      return ConnectyCube.storage.createAndUpload(fileParams);
    });
    const uploadedFilesResults = await Promise.all(uploadFilesPromises);
    const uploadedAttachments = uploadedFilesResults.map(({ uid, content_type = "" }) => ({
      uid,
      type: content_type,
      url: ConnectyCube.storage.privateUrl(uid),
    }));
    const messageId = _sendMessage("Attachment", uploadedAttachments, dialog, opponentId);

    setMessages((prevMessages) => ({
      ...prevMessages,
      [dialog._id]: prevMessages[dialog._id].map((msg) =>
        msg._id === tempId
          ? {
              ...msg,
              _id: messageId,
              attachments,
              isLoading: false,
              status: chatStatusRef.current === ChatStatus.CONNECTED ? MessageStatus.WAIT : MessageStatus.LOST,
            }
          : msg,
      ),
    }));
  };

  const _sendMessage = (
    body: string,
    attachments: Messages.Attachment[] | null,
    dialog: Dialogs.Dialog,
    opponentId?: number,
  ): string => {
    const messageParams: Chat.MessageParams = {
      type: dialog.type === DialogType.PRIVATE ? ChatType.CHAT : ChatType.GROUPCHAT,
      body,
      extension: {
        save_to_history: 1,
        dialog_id: dialog._id,
      },
    };

    if (attachments) {
      messageParams.extension.attachments = attachments;
    }

    const messageId = ConnectyCube.chat.send(
      dialog.type === DialogType.PRIVATE ? (opponentId as number) : dialog._id,
      messageParams,
    );

    return messageId;
  };

  const _addMessageToStore = (
    messageId: string,
    body: string,
    dialogId: string,
    senderId: number,
    recipientId?: number,
    attachments?: Messages.Attachment[],
    isLoading?: boolean,
  ) => {
    const ts = Math.round(new Date().getTime() / 1000);

    setDialogs((prevDialogs) =>
      prevDialogs
        .map((dialog) =>
          dialog._id === dialogId
            ? {
                ...dialog,
                last_message: body,
                last_message_user_id: senderId,
                last_message_date_sent: ts,
              }
            : dialog,
        )
        .sort((a, b) => {
          const dateA = parseDate(a.last_message_date_sent) || (parseDate(a.created_at) as number);
          const dateB = parseDate(b.last_message_date_sent) || (parseDate(b.created_at) as number);
          return dateB - dateA;
        }),
    );

    setMessages((prevMessages) => ({
      ...prevMessages,
      [dialogId]: [
        ...(prevMessages[dialogId] || []),
        {
          _id: messageId,
          created_at: ts,
          updated_at: ts,
          chat_dialog_id: dialogId,
          message: body,
          sender_id: senderId,
          recipient_id: recipientId as any,
          date_sent: ts,
          read: 0,
          read_ids: [senderId],
          delivered_ids: [senderId],
          views_count: 0,
          attachments: attachments ? attachments : [],
          reactions: {} as any,
          isLoading,
          status: chatStatusRef.current === ChatStatus.CONNECTED ? MessageStatus.WAIT : MessageStatus.LOST,
        },
      ],
    }));
  };

  const _updateMessageStatusInStore = (status: MessageStatus, messageId: string, dialogId: string, userId?: number) => {
    setMessages((prevMessages) => ({
      ...prevMessages,
      [dialogId]:
        prevMessages[dialogId]?.map((message) =>
          message._id === messageId
            ? {
                ...message,
                read_ids: userId
                  ? message.read_ids
                    ? [...new Set([...message.read_ids, userId])]
                    : [userId]
                  : message.read_ids,
                read: status === MessageStatus.READ ? 1 : message.read,
                status:
                  status === MessageStatus.SENT && message.status === MessageStatus.LOST ? message.status : status,
              }
            : message,
        ) ?? [],
    }));
  };

  const _markMessagesAsLostInStore = () => {
    setMessages((prevMessages) =>
      Object.fromEntries(
        Object.entries(prevMessages).map(([dialogId, messages]) => [
          dialogId,
          messages.map((message) =>
            message.status === MessageStatus.WAIT ? { ...message, status: MessageStatus.LOST } : message,
          ),
        ]),
      ),
    );
  };

  const readMessage = (messageId: string, userId: number, dialogId: string) => {
    ConnectyCube.chat.sendReadStatus({ messageId, userId, dialogId });

    _updateMessageStatusInStore(MessageStatus.READ, messageId, dialogId, userId);

    setDialogs((prevDialogs) =>
      prevDialogs.map((dialog) =>
        dialog._id === dialogId
          ? {
              ...dialog,
              unread_messages_count: Math.max(0, dialog.unread_messages_count - 1),
            }
          : dialog,
      ),
    );
  };

  const _notifyUsers = (command: string, dialogId: string, userId: number, params: any = {}) => {
    const msg = { body: command, extension: { dialogId, ...params } };

    ConnectyCube.chat.sendSystemMessage(userId, msg);
  };

  const sendSignal = (userIdOrIds: number | number[], signal: string, params: any = {}) => {
    const receivers = Array.isArray(userIdOrIds) ? userIdOrIds : [userIdOrIds];
    const msg = { body: signal, extension: params };

    receivers.forEach((userId) => {
      ConnectyCube.chat.sendSystemMessage(userId, msg);
    });
  };

  const sendTypingStatus = (dialog?: Dialogs.Dialog) => {
    dialog ??= selectedDialog;

    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    ConnectyCube.chat.sendIsTypingStatus(
      dialog.type === DialogType.PRIVATE ? (getDialogOpponentId(dialog) as number) : dialog._id,
    );
  };

  const _updateTypingStatus = (dialogId: string, userId: number, isTyping: boolean) => {
    setTypingStatus((prevTypingStatus) => {
      const prevUsersIds = prevTypingStatus[dialogId];
      const nextUsersIds = prevUsersIds ? new Set<number>(prevUsersIds) : new Set<number>();

      isTyping ? nextUsersIds.add(userId) : nextUsersIds.delete(userId);

      return { ...prevTypingStatus, [dialogId]: [...nextUsersIds] };
    });
  };

  const _clearTypingStatus = (dialogId: string, userId: number) => {
    _updateTypingStatus(dialogId, userId, false);
    clearTimeout(typingTimers.current[dialogId]?.[userId]);
    delete typingTimers.current[dialogId]?.[userId];
  };

  const _getPrivateDialogIdByUserId = (userId: number): string | undefined => {
    let dialogId: string | undefined = privateDialogsIdsRef.current[userId];

    if (!dialogId) {
      const dialog = dialogsRef.current.find(
        (dialog) => dialog.type === DialogType.PRIVATE && getDialogOpponentId(dialog) === userId,
      );

      if (dialog) {
        dialogId = dialog._id;
        privateDialogsIdsRef.current[userId] = dialogId;
      }
    }

    return dialogId;
  };

  const lastMessageSentTimeString = (dialog: Dialogs.Dialog): string => {
    return formatDistanceToNow(
      dialog.last_message_date_sent ? (dialog.last_message_date_sent as number) * 1000 : (dialog.created_at as string),
      {
        addSuffix: true,
      },
    );
  };

  const messageSentTimeString = (message: Messages.Message): string => {
    return formatDistanceToNow((message.date_sent as number) * 1000, {
      addSuffix: true,
    });
  };

  const processOnMessage = (callbackFn: Chat.OnMessageListener | null) => {
    onMessageRef.current = callbackFn;
  };

  const processOnSignal = (callbackFn: Chat.OnMessageSystemListener | null) => {
    onSignalRef.current = callbackFn;
  };

  const processOnMessageError = (callbackFn: Chat.OnMessageErrorListener | null) => {
    onMessageErrorRef.current = callbackFn;
  };

  const processOnMessageSent = (callbackFn: Chat.OnMessageSentListener | null) => {
    onMessageSentRef.current = callbackFn;
  };

  const _processDisconnect = () => {
    if (chatStatusRef.current !== ChatStatus.CONNECTING) {
      setChatStatus(ChatStatus.DISCONNECTED);
      _resetDialogsAndMessagesProgress();
    }

    _markMessagesAsLostInStore();
  };

  const _processReconnect = () => {
    setChatStatus(ChatStatus.CONNECTED);
  };

  const _processConnectionError = async (
    error: {
      name?: string;
      text?: string;
      condition?: string;
      [key: string]: any;
    } = {},
  ) => {
    if (
      error?.condition === "not-authorized" ||
      error?.text === "Password not verified" ||
      error?.name === "SASLError"
    ) {
      const isDisconnected = await disconnect(ChatStatus.NOT_AUTHORIZED);

      if (!isDisconnected) {
        terminate(ChatStatus.NOT_AUTHORIZED);
      }
    } else {
      setChatStatus(ChatStatus.ERROR);
    }
  };

  const _processMessage = (userId: number, message: Chat.Message) => {
    if (onMessageRef.current) {
      onMessageRef.current(userId, message);
    }

    // TODO: handle multi-device & delivered private messages with delay (from offline)
    if (userId === currentUserIdRef.current || (message.delay && message.type === ChatType.CHAT)) {
      return;
    }

    const currentDialog = selectedDialogRef.current;
    const dialogId = message.dialog_id as string;
    const messageId = message.id;
    const body = message.body || "";
    const opponentId = message.type === ChatType.CHAT ? (currentUserIdRef.current as number) : undefined;

    const attachments =
      message.extension.attachments?.length > 0
        ? message.extension.attachments.map((attachment: Messages.Attachment) => ({
            ...attachment,
            url: ConnectyCube.storage.privateUrl(attachment.uid),
          }))
        : undefined;

    _addMessageToStore(messageId, body, dialogId, userId, opponentId, attachments);
    _clearTypingStatus(dialogId, userId);

    setDialogs((prevDialogs) =>
      prevDialogs.map((dialog) =>
        dialog._id === dialogId
          ? {
              ...dialog,
              unread_messages_count:
                !currentDialog || currentDialog._id !== message.dialog_id
                  ? (dialog.unread_messages_count || 0) + 1
                  : dialog.unread_messages_count,
              last_message: message.body,
              last_message_date_sent: parseInt(message.extension.date_sent),
            }
          : dialog,
      ),
    );
  };

  const _processErrorMessage = (messageId: string, error: { code: number; info: string }) => {
    if (onMessageErrorRef.current) {
      onMessageErrorRef.current(messageId, error);
    }
  };

  const _processSentMessage = (lost: Chat.MessageParams | null, sent: Chat.MessageParams | null) => {
    if (onMessageSentRef.current) {
      onMessageSentRef.current(lost, sent);
    }

    const nextStatus = sent ? MessageStatus.SENT : lost ? MessageStatus.LOST : undefined;
    const messageId = sent ? sent.id : lost ? lost.id : undefined;
    const dialogId = sent ? sent.extension.dialog_id : lost ? lost.extension.dialog_id : undefined;

    if (nextStatus && messageId && dialogId) {
      _updateMessageStatusInStore(nextStatus, messageId, dialogId);
    }
  };

  const _processSystemMessage = async (message: Chat.SystemMessage) => {
    const dialogId = message.extension.dialogId;
    const senderId = message.userId;

    if (onSignalRef.current) {
      onSignalRef.current(message);
    }

    // TODO: handle multi-device
    if (senderId === currentUserIdRef.current) return;

    switch (message.body) {
      case DialogEventSignal.NEW_DIALOG:
      case DialogEventSignal.ADDED_TO_DIALOG: {
        const result = await ConnectyCube.chat.dialog.list({ _id: dialogId });
        const dialog = result.items[0];

        _retrieveAndStoreUsers(dialog.occupants_ids);
        setDialogs((prevDialogs) => [dialog, ...prevDialogs.filter((d) => d._id !== dialog._id)]);

        break;
      }

      case DialogEventSignal.ADD_PARTICIPANTS: {
        const usersIds = message.extension.addedParticipantsIds.split(",").map(Number) as number[];

        _retrieveAndStoreUsers(usersIds);
        setDialogs((prevDialogs) =>
          prevDialogs.map((d) => {
            if (d._id === dialogId) {
              d.occupants_ids = Array.from(new Set([...d.occupants_ids, ...usersIds]));
            }
            return d;
          }),
        );

        break;
      }

      case DialogEventSignal.REMOVE_PARTICIPANTS: {
        const usersIds = message.extension.removedParticipantsIds.split(",").map(Number);

        setDialogs((prevDialogs) =>
          prevDialogs.map((d) => {
            if (d._id === dialogId) {
              d.occupants_ids = d.occupants_ids.filter((id) => !usersIds.includes(id));
            }
            return d;
          }),
        );

        break;
      }

      case DialogEventSignal.REMOVED_FROM_DIALOG: {
        setDialogs((prevDialogs) =>
          prevDialogs.map((d) => {
            if (d._id === dialogId && d.type !== DialogType.PRIVATE) {
              d.occupants_ids = d.occupants_ids.filter((id) => id !== senderId);
            }
            return d;
          }),
        );

        break;
      }
    }
  };

  const _processReadMessageStatus = (messageId: string, dialogId: string, userId: number) => {
    // TODO: handle multi-device
    if (userId === currentUserIdRef.current) return;

    _updateMessageStatusInStore(MessageStatus.READ, messageId, dialogId, userId);
  };

  const _processTypingMessageStatus = (isTyping: boolean, userId: number, dialogId: string | null) => {
    const _dialogId = dialogId || _getPrivateDialogIdByUserId(userId);

    // TODO: handle multi-device
    if (!_dialogId || !userId || userId === currentUserIdRef.current) return;

    _updateTypingStatus(_dialogId, userId, isTyping);

    if (!typingTimers.current[_dialogId]) {
      typingTimers.current[_dialogId] = {};
    }

    if (isTyping) {
      if (typingTimers.current[_dialogId][userId]) {
        clearTimeout(typingTimers.current[_dialogId][userId]);
        delete typingTimers.current[_dialogId][userId];
      }

      typingTimers.current[_dialogId][userId] = setTimeout(() => {
        _clearTypingStatus(_dialogId, userId);
      }, 6000);
    } else {
      _clearTypingStatus(_dialogId, userId);
    }
  };

  useEffect(() => {
    ConnectyCube.chat.addListener(ChatEvent.DISCONNECTED, _processDisconnect);
    ConnectyCube.chat.addListener(ChatEvent.RECONNECTED, _processReconnect);
    ConnectyCube.chat.addListener(ChatEvent.ERROR, _processConnectionError);
    ConnectyCube.chat.addListener(ChatEvent.MESSAGE, _processMessage);
    ConnectyCube.chat.addListener(ChatEvent.ERROR_MESSAGE, _processErrorMessage);
    ConnectyCube.chat.addListener(ChatEvent.SENT_MESSAGE, _processSentMessage);
    ConnectyCube.chat.addListener(ChatEvent.SYSTEM_MESSAGE, _processSystemMessage);
    ConnectyCube.chat.addListener(ChatEvent.READ_MESSAGE, _processReadMessageStatus);
    ConnectyCube.chat.addListener(ChatEvent.TYPING_MESSAGE, _processTypingMessageStatus);

    return () => {
      ConnectyCube.chat.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    _updateUnreadMessagesCount();
  }, [dialogs]);

  useEffect(() => {
    _establishConnection(isOnline);
  }, [isOnline]);

  return (
    <ChatContext.Provider
      value={{
        isOnline,
        isConnected,
        chatStatus,
        connect,
        disconnect,
        terminate,
        currentUserId,
        selectDialog,
        selectedDialog,
        getDialogOpponentId,
        unreadMessagesCount,
        getMessages,
        getNextMessages,
        totalMessagesReached,
        messages,
        sendSignal,
        sendMessage,
        dialogs,
        getDialogs,
        getNextDialogs,
        totalDialogReached,
        createChat,
        createGroupChat,
        sendTypingStatus,
        typingStatus,
        sendMessageWithAttachment,
        markDialogAsRead,
        removeUsersFromGroupChat,
        addUsersToGroupChat,
        leaveGroupChat,
        readMessage,
        lastMessageSentTimeString,
        messageSentTimeString,
        processOnSignal,
        processOnMessage,
        processOnMessageError,
        processOnMessageSent,
        ...chatBlockList,
        ...chatUsers.exports,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
