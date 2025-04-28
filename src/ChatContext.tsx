import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChatContextType, ChatProviderType, GroupChatEventType } from "./types";
import { Chat, ChatEvent, ChatType, Dialogs, DialogType, Messages } from "connectycube/types";

import ConnectyCube from "connectycube";
import useStateRef from "react-usestateref";
import { formatDistanceToNow } from "date-fns";
import { useBlockList, useUsers } from "./hooks";
import { parseDate } from "./helpers";

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
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<ChatContextType["unreadMessagesCount"]>({ total: 0 });
  const [messages, setMessages] = useState<{ [dialogId: string]: Messages.Message[] }>({});
  const [typingStatus, setTypingStatus] = useState<{ [dialogId: string]: number[] }>({});
  const [activatedDialogs, setActivatedDialogs] = useState<{ [dialogId: string]: boolean }>({});
  // refs
  const typingTimers = useRef<{ [dialogId: string]: { [userId: number | string]: NodeJS.Timeout } }>({});
  const onMessageRef = useRef<Chat.OnMessageListener | null>(null);
  const onSignalRef = useRef<Chat.OnMessageSystemListener | null>(null);
  const onMessageErrorRef = useRef<Chat.OnMessageErrorListener | null>(null);
  const privateDialogsIdsRef = useRef<{ [userId: number | string]: string }>({});
  // state refs
  const [dialogs, setDialogs, dialogsRef] = useStateRef<Dialogs.Dialog[]>([]);
  const [currentUserId, setCurrentUserId, currentUserIdRef] = useStateRef<number | undefined>();
  const [selectedDialog, setSelectedDialog, selectedDialogRef] = useStateRef<Dialogs.Dialog | undefined>();
  // internal hooks
  const chatBlockList = useBlockList(isConnected);
  const chatUsers = useUsers(currentUserId);
  const { _retrieveAndStoreUsers } = chatUsers;

  const connect = async (credentials: Chat.ConnectionParams) => {
    try {
      const _isConnected = await ConnectyCube.chat.connect(credentials);
      if (_isConnected) {
        setIsConnected(_isConnected);
        setCurrentUserId(credentials.userId);
      }
    } catch (error) {
      console.error(`Failed to connect due to ${error}`);
    }
  };

  const disconnect = () => {
    if (ConnectyCube.chat.isConnected) {
      ConnectyCube.chat.disconnect();
      setCurrentUserId(undefined);
      setIsConnected(false);
    }
  };

  const createChat = async (userId: number, extensions?: { [key: string]: any }): Promise<Dialogs.Dialog> => {
    const params = {
      type: DialogType.PRIVATE,
      occupants_ids: [userId],
      extensions,
    };
    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs((prevDialogs) => [dialog, ...prevDialogs.filter((d) => d._id !== dialog._id)]);

    privateDialogsIdsRef.current[userId] = dialog._id;

    _notifyUsers(GroupChatEventType.NEW_DIALOG, dialog._id, userId);
    _retrieveAndStoreUsers([userId, currentUserId as number]);

    return dialog;
  };

  const createGroupChat = async (
    usersIds: number[],
    name: string,
    photo?: string,
    extensions?: { [key: string]: any },
  ): Promise<Dialogs.Dialog> => {
    const params = {
      type: DialogType.GROUP,
      name,
      photo,
      occupants_ids: usersIds,
      extensions,
    };

    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs((prevDialogs) => [dialog, ...prevDialogs.filter((d) => d._id !== dialog._id)]);

    usersIds.forEach((userId) => {
      _notifyUsers(GroupChatEventType.NEW_DIALOG, dialog._id, userId);
    });
    _retrieveAndStoreUsers([...usersIds, currentUserId as number]);

    return dialog;
  };

  const getDialogs = async (filters?: Dialogs.ListParams): Promise<Dialogs.Dialog[]> => {
    // fetch chats
    const { items: fetchedDialogs } = await ConnectyCube.chat.dialog.list(filters);

    // store dialogs
    setDialogs((prevDialogs) => {
      const allDialogs = [...prevDialogs, ...fetchedDialogs];

      // Create a map keyed by dialog._id to eliminate duplicates
      const uniqueDialogsMap = new Map<string, Dialogs.Dialog>();
      allDialogs.forEach((dialog) => uniqueDialogsMap.set(dialog._id, dialog));

      // Convert the map values to an array and sort by the most recent message date
      const sortedDialogs = Array.from(uniqueDialogsMap.values()).sort((a, b) => {
        const dateA = parseDate(a.last_message_date_sent) || parseDate(a.created_at) || 0;
        const dateB = parseDate(b.last_message_date_sent) || parseDate(b.created_at) || 0;
        return dateB - dateA; // Sort in descending order (most recent first)
      });

      return sortedDialogs;
    });

    // store users
    const usersIds = Array.from(new Set(fetchedDialogs.flatMap((dialog) => dialog.occupants_ids)));
    _retrieveAndStoreUsers(usersIds);

    return fetchedDialogs;
  };

  const getMessages = async (dialogId: string): Promise<Messages.Message[]> => {
    const params = {
      chat_dialog_id: dialogId,
      sort_desc: "date_sent",
      limit: 100,
      skip: 0,
    };
    try {
      const result = await ConnectyCube.chat.message.list(params);
      // store messages
      const retrievedMessages = result.items
        .sort((a: Messages.Message, b: Messages.Message) => {
          return a._id.toString().localeCompare(b._id.toString()); // revers sort
        })
        .map((msg) => {
          const attachments = msg.attachments?.map((attachment) => ({
            ...attachment,
            url: ConnectyCube.storage.privateUrl(attachment.uid),
          }));
          return { ...msg, attachments };
        });
      setMessages((prevMessages) => ({ ...prevMessages, [dialogId]: retrievedMessages }));
      return retrievedMessages;
    } catch (error: any) {
      if (error.code === 404) {
        // dialog not found
        setMessages((prevMessages) => ({ ...prevMessages, [dialogId]: [] }));
        return [];
      }
      throw error;
    }
  };

  const selectDialog = async (dialog?: Dialogs.Dialog): Promise<void> => {
    setSelectedDialog(dialog);
    if (!dialog) {
      return;
    }

    // retrieve messages if chat is not activated yet
    if (!activatedDialogs[dialog._id]) {
      await getMessages(dialog._id);
      setActivatedDialogs({ ...activatedDialogs, [dialog._id]: true });
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
    const opponentId = dialog.occupants_ids.filter((oId) => {
      return oId !== currentUserId;
    })[0];

    privateDialogsIdsRef.current[opponentId] = dialog._id;

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
    // mark all messages as read
    const params = {
      read: 1,
      chat_dialog_id: dialog._id,
    };
    await ConnectyCube.chat.message.update("", params);

    setDialogs((prevDialogs) =>
      prevDialogs.map((d) => (d._id === dialog._id ? { ...d, unread_messages_count: 0 } : d)),
    );
  };

  const addUsersToGroupChat = async (usersIds: number[]): Promise<void> => {
    if (!selectedDialog) {
      throw new Error("No dialog selected");
    }

    // add users to group chat
    const dialogId = selectedDialog._id;
    const toUpdateParams = { push_all: { occupants_ids: usersIds } };
    await ConnectyCube.chat.dialog.update(dialogId, toUpdateParams);

    // notify existing participants with system message
    selectedDialog.occupants_ids
      .filter((userId) => userId !== currentUserId)
      .forEach((userId) => {
        _notifyUsers(GroupChatEventType.ADD_PARTICIPANTS, dialogId, userId, {
          addedParticipantsIds: usersIds.join(),
        });
      });

    usersIds.forEach((userId) => {
      _notifyUsers(GroupChatEventType.ADDED_TO_DIALOG, dialogId, userId);
    });

    // update store
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

    // remove users from group chat
    const dialogId = selectedDialog._id;
    const toUpdateParams = { pull_all: { occupants_ids: usersIds } };
    await ConnectyCube.chat.dialog.update(dialogId, toUpdateParams);

    // notify users that they are removed from the dialog
    usersIds.forEach((userId) => {
      _notifyUsers(GroupChatEventType.REMOVED_FROM_DIALOG, dialogId, userId);
    });

    selectedDialog.occupants_ids
      .filter((userId) => {
        return !usersIds.includes(userId) && userId !== currentUserId;
      })
      .forEach((userId) => {
        _notifyUsers(GroupChatEventType.REMOVE_PARTICIPANTS, dialogId, userId, {
          removedParticipantsIds: usersIds.join(),
        });
      });

    // update store
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

    // notify participants with system message
    selectedDialog.occupants_ids
      .filter((userId) => userId !== currentUserId)
      .forEach((userId) => {
        _notifyUsers(GroupChatEventType.REMOVED_FROM_DIALOG, selectedDialog._id, userId);
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

    // add message to store
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
      uid: `local-${tempId}-${index}`, // just for temporary
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    // add message to store
    _addMessageToStore(tempId, "Attachment", dialog._id, currentUserId as number, opponentId, attachments, true);

    // upload files to cloud
    const uploadFilesPromises = files.map((file) => {
      const fileParams = {
        file: file,
        name: file.name,
        type: file.type,
        size: file.size,
        public: false,
      };
      return ConnectyCube.storage.createAndUpload(fileParams);
    });

    const uploadedFilesResults = await Promise.all(uploadFilesPromises);
    const uploadedAttachments = uploadedFilesResults.map(({ uid, content_type }) => ({
      uid,
      type: content_type ?? "",
      url: ConnectyCube.storage.privateUrl(uid),
    }));

    // send
    const messageId = _sendMessage("Attachment", uploadedAttachments, dialog, opponentId);

    // update message in store
    setMessages((prevMessages) => ({
      ...prevMessages,
      [dialog._id]: prevMessages[dialog._id].map((msg) =>
        msg._id === tempId ? { ...msg, _id: messageId, attachments, isLoading: false } : msg,
      ),
    }));
  };

  const _sendMessage = (
    body: string,
    attachments: Messages.Attachment[] | null,
    dialog: Dialogs.Dialog,
    opponentId?: number,
  ): string => {
    // send message
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
        },
      ],
    }));
  };

  const readMessage = (messageId: string, userId: number, dialogId: string) => {
    ConnectyCube.chat.sendReadStatus({
      messageId,
      userId,
      dialogId,
    });

    setMessages((prevMessages) => ({
      ...prevMessages,
      [dialogId]: prevMessages[dialogId].map((message) =>
        message._id === messageId ? { ...message, read: 1 } : message,
      ),
    }));

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
    const msg = {
      body: command,
      extension: {
        dialogId,
        ...params,
      },
    };

    ConnectyCube.chat.sendSystemMessage(userId, msg);
  };

  const sendSignal = (userIdOrIds: number | number[], signal: string, params: any = {}) => {
    const receivers = Array.isArray(userIdOrIds) ? userIdOrIds : [userIdOrIds];
    const msg = {
      body: signal,
      extension: params,
    };

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

      if (isTyping) {
        nextUsersIds.add(userId);
      } else {
        nextUsersIds.delete(userId);
      }

      return { ...prevTypingStatus, [dialogId]: [...nextUsersIds] };
    });
  };

  const _clearTypingStatus = (dialogId: string, userId: number) => {
    _updateTypingStatus(dialogId, userId, false);
    clearTimeout(typingTimers.current[dialogId][userId]);
    delete typingTimers.current[dialogId][userId];
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

  // Internet listeners
  useEffect(() => {
    const abortController1 = new AbortController();
    const abortController2 = new AbortController();

    window.addEventListener(
      "online",
      () => {
        setIsOnline(true);
      },
      {
        signal: abortController1.signal,
      },
    );
    window.addEventListener(
      "offline",
      () => {
        setIsOnline(false);
        setActivatedDialogs({});
      },
      {
        signal: abortController2.signal,
      },
    );

    return () => {
      abortController1.abort();
      abortController2.abort();
    };
  }, []);

  const _processDisconnect = () => {
    setActivatedDialogs({});
  };

  const _processReconnect = () => {
    console.log("[useChat] Reconnected");
  };

  const _processMessage = (userId: number, message: Chat.Message) => {
    if (onMessageRef.current) {
      onMessageRef.current(userId, message);
    }

    // TODO: handle multi-device
    if (userId === currentUserIdRef.current) {
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

    // add message to store
    _addMessageToStore(messageId, body, dialogId, userId, opponentId, attachments);
    // clear typing status
    _clearTypingStatus(dialogId, userId);

    // updates chats store
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

  const _processSystemMessage = async (message: Chat.SystemMessage) => {
    const dialogId = message.extension.dialogId;
    const senderId = message.userId;

    if (onSignalRef.current) {
      onSignalRef.current(message);
    }

    // TODO: handle multi-device
    if (senderId === currentUserIdRef.current) {
      return;
    }

    switch (message.body) {
      // when someone created a new chat with you or added to chat
      case GroupChatEventType.NEW_DIALOG:
      case GroupChatEventType.ADDED_TO_DIALOG: {
        const result = await ConnectyCube.chat.dialog.list({
          _id: dialogId,
        });
        const dialog = result.items[0];

        _retrieveAndStoreUsers(dialog.occupants_ids);

        setDialogs((prevDialogs) => [dialog, ...prevDialogs.filter((d) => d._id !== dialog._id)]);

        break;
      }
      // when someone added new participants to the chat
      case GroupChatEventType.ADD_PARTICIPANTS: {
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
      // when someone removed participants from chat
      case GroupChatEventType.REMOVE_PARTICIPANTS: {
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
      // when other user left the chat
      case GroupChatEventType.REMOVED_FROM_DIALOG: {
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
    if (userId === currentUserIdRef.current) {
      return;
    }

    setMessages((prevMessages) => {
      (prevMessages[dialogId] || []).forEach((message) => {
        if (message._id === messageId && message.read === 0) {
          message.read = 1;
          message.read_ids?.push(userId);
        }
      });
      return prevMessages;
    });
  };

  const _processTypingMessageStatus = (isTyping: boolean, userId: number, dialogId: string | null) => {
    const _dialogId = dialogId || _getPrivateDialogIdByUserId(userId);

    // TODO: handle multi-device
    if (!_dialogId || !userId || userId === currentUserIdRef.current) {
      return;
    }

    _updateTypingStatus(_dialogId, userId, isTyping);

    if (!typingTimers.current[_dialogId]) {
      typingTimers.current[_dialogId] = {};
    }

    if (isTyping) {
      // clear previous and run new timer
      if (typingTimers.current[_dialogId]?.[userId]) {
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

  // Chat callbacks
  useEffect(() => {
    ConnectyCube.chat.addListener(ChatEvent.DISCONNECTED, _processDisconnect);
    ConnectyCube.chat.addListener(ChatEvent.RECONNECTED, _processReconnect);
    ConnectyCube.chat.addListener(ChatEvent.MESSAGE, _processMessage);
    ConnectyCube.chat.addListener(ChatEvent.ERROR_MESSAGE, _processErrorMessage);
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

  return (
    <ChatContext.Provider
      value={{
        isOnline,
        connect,
        isConnected,
        disconnect,
        currentUserId,
        selectDialog,
        selectedDialog,
        getDialogOpponentId,
        unreadMessagesCount,
        getMessages,
        messages,
        sendSignal,
        sendMessage,
        dialogs,
        getDialogs,
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
        ...chatBlockList,
        ...chatUsers.exports,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
