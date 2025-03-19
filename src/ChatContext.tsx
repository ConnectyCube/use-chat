import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChatContextType, ChatProviderType, GroupChatEventType } from "./types";
import { Chat, Dialogs, Messages } from "connectycube/types";
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
  const [isOnline, setIsOnline, _isOnlineRef] = useStateRef<boolean>(navigator.onLine);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUserId, setCurrentUserId, currentUserIdRef] = useStateRef<number | undefined>();
  const [dialogs, setDialogs, dialogsRef] = useStateRef<Dialogs.Dialog[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<ChatContextType["unreadMessagesCount"]>({ total: 0 });
  const [selectedDialog, setSelectedDialog] = useState<Dialogs.Dialog | undefined>();
  const [messages, setMessages, messagesRef] = useStateRef<{
    [dialogId: string]: Messages.Message[];
  }>({});
  const [typingStatus, setTypingStatus] = useState<{
    [dialogId: string]: { [userId: string]: boolean };
  }>({});
  const [activatedDialogs, setActivatedDialogs, _activatedDialogsRef] = useStateRef<{
    [dialogId: string]: boolean;
  }>({});
  const typingTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const onMessageRef = useRef<Chat.OnMessageListener | null>(null);
  const onMessageErrorRef = useRef<Chat.OnMessageErrorListener | null>(null);
  // internal hooks
  const blockList = useBlockList(isConnected);
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
      type: 3,
      occupants_ids: [userId],
      extensions,
    };
    const newDialog = await ConnectyCube.chat.dialog.create(params);

    const dialog = _findDialog(newDialog._id);
    if (!dialog) {
      setDialogs([newDialog, ...dialogs]);
      _notifyUsers(GroupChatEventType.NEW_DIALOG, newDialog._id, userId);
      _retrieveAndStoreUsers([userId, currentUserId as number]);
    }

    return newDialog;
  };

  const createGroupChat = async (
    usersIds: number[],
    name: string,
    photo?: string,
    extensions?: { [key: string]: any },
  ): Promise<Dialogs.Dialog> => {
    const params = {
      type: 2,
      name,
      photo,
      occupants_ids: usersIds,
      extensions,
    };

    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs([dialog, ...dialogs]);

    usersIds.forEach((userId) => {
      _notifyUsers(GroupChatEventType.NEW_DIALOG, dialog._id, userId);
    });

    _retrieveAndStoreUsers([...usersIds, currentUserId as number]);

    return dialog;
  };

  const getDialogs = async (filters?: Dialogs.ListParams): Promise<Dialogs.Dialog[]> => {
    // fetch chats
    const result = await ConnectyCube.chat.dialog.list(filters);

    // store dialogs
    setDialogs(() => {
      // Merge the two arrays
      const merged = [...dialogs, ...result.items];
      // Create a map keyed by dialog.id (replace 'id' with the unique key property of your dialogs)
      const uniqueDialogsMap = new Map();
      merged.forEach((dialog) => {
        uniqueDialogsMap.set(dialog._id, dialog);
      });
      // Convert the map values back to an array and sort it
      const uniqueDialogs = Array.from(uniqueDialogsMap.values()).sort((a, b) => {
        const dateA = parseDate(a.last_message_date_sent) || parseDate(a.created_at) || 0;
        const dateB = parseDate(b.last_message_date_sent) || parseDate(b.created_at) || 0;

        return dateB - dateA; // Sort in descending order (most recent first)
      });

      return uniqueDialogs;
    });

    // store users
    const usersIds = Array.from(new Set(result.items.flatMap((dialog) => dialog.occupants_ids)));
    _retrieveAndStoreUsers(usersIds);

    return result.items;
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
      setMessages({ ...messages, [dialogId]: retrievedMessages });
      return retrievedMessages;
    } catch (error: any) {
      if (error.code === 404) {
        // dialog not found
        setMessages({ ...messages, [dialogId]: [] });
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

    if (dialog.type !== 3) {
      return undefined;
    }
    const opponentId = dialog.occupants_ids.filter((oId) => {
      return oId !== currentUserId;
    })[0];

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

  const _findDialog = (dialogId: string): Dialogs.Dialog => {
    return dialogsRef.current.find((d) => d._id === dialogId) as Dialogs.Dialog;
  };

  const markDialogAsRead = async (dialog: Dialogs.Dialog): Promise<void> => {
    // mark all messages as read
    const params = {
      read: 1,
      chat_dialog_id: dialog._id,
    };
    await ConnectyCube.chat.message.update("", params);

    dialog.unread_messages_count = 0;
    setDialogs([...dialogs]);
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
    // notify new user with system message
    usersIds.forEach((userId) => {
      _notifyUsers(GroupChatEventType.ADDED_TO_DIALOG, dialogId, userId);
    });

    // update store
    _retrieveAndStoreUsers(usersIds);
    //
    const updatedDialog = _findDialog(selectedDialog._id);
    updatedDialog.occupants_ids = Array.from(new Set([...updatedDialog.occupants_ids, ...usersIds]));
    setSelectedDialog({ ...updatedDialog });
    setDialogs([...dialogs]);
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
    const updatedDialog = _findDialog(selectedDialog._id);
    updatedDialog.occupants_ids = updatedDialog.occupants_ids.filter((userId) => !usersIds.includes(userId));
    setSelectedDialog({ ...updatedDialog });
    setDialogs([...dialogs]);
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
      uid: `local:${tempId}#${index}`, // just for temporary
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

    // update message in store (update it and file url)
    const msg = messagesRef.current[dialog._id].find((msg) => msg._id === tempId) as Messages.Message;
    msg._id = messageId;
    msg.attachments = attachments;
    msg.isLoading = false;
    setMessages({ ...messagesRef.current });
  };

  const _sendMessage = (
    body: string,
    attachments: Messages.Attachment[] | null,
    dialog: Dialogs.Dialog,
    opponentId?: number,
  ): string => {
    // send message
    const messageParams: Chat.MessageParams = {
      type: dialog.type === 3 ? "chat" : "groupchat",
      body,
      extension: {
        save_to_history: 1,
        dialog_id: dialog._id,
      },
    };
    if (attachments) {
      messageParams.extension.attachments = attachments;
    }
    const messageId = ConnectyCube.chat.send(dialog.type === 3 ? (opponentId as number) : dialog._id, messageParams);

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

    // update dialog
    const dialog = _findDialog(dialogId);
    dialog.last_message = body;
    dialog.last_message_user_id = senderId;
    dialog.last_message_date_sent = ts;
    setDialogs(
      [...dialogsRef.current].sort((a, b) => {
        const dateA = parseDate(a.last_message_date_sent) || (parseDate(a.created_at) as number);
        const dateB = parseDate(b.last_message_date_sent) || (parseDate(b.created_at) as number);

        return dateB - dateA; // Sort in ascending order
      }),
    );

    setMessages({
      ...(messagesRef.current || {}),
      [dialog._id]: [
        ...(messagesRef.current[dialog._id] || {}),
        {
          _id: messageId,
          created_at: ts,
          updated_at: ts,
          chat_dialog_id: dialog._id,
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
    });
  };

  const readMessage = (messageId: string, userId: number, dialogId: string) => {
    ConnectyCube.chat.sendReadStatus({
      messageId,
      userId,
      dialogId,
    });

    // update store
    messages[dialogId].forEach((message) => {
      if (message._id === messageId) {
        message.read = 1;
        const dialog = _findDialog(dialogId);
        if (dialog) {
          dialog.unread_messages_count >= 1 ? dialog.unread_messages_count-- : 0;
        }

        setDialogs([...dialogs]);
      }
    });
    setMessages({ ...messages });
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

  const sendTypingStatus = (dialog?: Dialogs.Dialog) => {
    dialog ??= selectedDialog;
    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    ConnectyCube.chat.sendIsTypingStatus(dialog.type === 3 ? (getDialogOpponentId(dialog) as number) : dialog._id);
  };

  const _stopTyping = (userId: number, dialogId: string) => {
    setTypingStatus((prevTypingStatus) => ({
      ...prevTypingStatus,
      [dialogId]: { [userId]: false },
    }));

    clearTimeout(typingTimers.current[dialogId + userId]);
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

  const processOnMessage = (callbackFn: Chat.OnMessageListener) => {
    onMessageRef.current = callbackFn;
  };

  const processOnMessageError = (callbackFn: Chat.OnMessageErrorListener) => {
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

  // Chat callbacks
  useEffect(() => {
    ConnectyCube.chat.onDisconnectedListener = () => {
      setActivatedDialogs({});
    };

    // ConnectyCube.chat.onReconnectListener = () => {};

    ConnectyCube.chat.onMessageListener = (userId: number, message: Chat.Message) => {
      // TODO: handle multi-device
      if (userId === currentUserIdRef.current) {
        return;
      }

      const dialogId = message.dialog_id as string;
      const messageId = message.id;
      const body = message.body || "";
      const opponentId = message.type === "chat" ? (currentUserIdRef.current as number) : undefined;

      _stopTyping(userId, dialogId);

      const attachments =
        message.extension.attachments?.length > 0
          ? message.extension.attachments.map((attachment: Messages.Attachment) => ({
              ...attachment,
              url: ConnectyCube.storage.privateUrl(attachment.uid),
            }))
          : undefined;

      // add message to store
      _addMessageToStore(messageId, body, dialogId, userId, opponentId, attachments);

      // updates chats store
      setDialogs((prevDialogs) => {
        const dialog = _findDialog(dialogId);

        if (!selectedDialog || selectedDialog._id !== message.dialog_id) {
          dialog.unread_messages_count = (dialog.unread_messages_count || 0) + 1;
        }
        dialog.last_message = message.body;
        dialog.last_message_date_sent = parseInt(message.extension.date_sent);

        return [...prevDialogs];
      });

      if (onMessageRef.current) {
        onMessageRef.current(userId, message);
      }
    };

    ConnectyCube.chat.onMessageErrorListener = (messageId: string, error: { code: number; info: string }) => {
      if (onMessageErrorRef.current) {
        onMessageErrorRef.current(messageId, error);
      }
    };

    ConnectyCube.chat.onSystemMessageListener = async (message: Chat.SystemMessage) => {
      const dialogId = message.extension.dialogId;
      const senderId = message.userId;

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

          setDialogs((prevDialogs) => {
            return [dialog, ...prevDialogs];
          });

          break;
        }
        // when someone added new participants to the chat
        case GroupChatEventType.ADD_PARTICIPANTS: {
          const usersIds = message.extension.addedParticipantsIds.split(",").map(Number);
          _retrieveAndStoreUsers(usersIds);
          const dialog = _findDialog(dialogId);

          setDialogs((prevDialogs) => {
            dialog.occupants_ids = dialog.occupants_ids.concat(usersIds);
            return [dialog, ...prevDialogs];
          });
          break;
        }
        // when someone removed participants from chat
        case GroupChatEventType.REMOVE_PARTICIPANTS: {
          const usersIds = message.extension.removedParticipantsIds.split(",").map(Number);
          const dialog = _findDialog(dialogId);

          setDialogs((prevDialogs) => {
            dialog.occupants_ids = dialog.occupants_ids.filter((id) => {
              return !usersIds.includes(id);
            });
            return [dialog, ...prevDialogs];
          });
          break;
        }
        // when other user left the chat
        case GroupChatEventType.REMOVED_FROM_DIALOG: {
          const usersIds = [senderId];
          const dialog = _findDialog(dialogId);

          setDialogs((prevDialogs) => {
            dialog.occupants_ids = dialog.occupants_ids.filter((id) => {
              return !usersIds.includes(id);
            });
            return [dialog, ...prevDialogs];
          });
          break;
        }
      }
    };

    ConnectyCube.chat.onReadStatusListener = (messageId: string, dialogId: string, userId: number) => {
      // TODO: handle multi-device
      if (userId === currentUserIdRef.current) {
        return;
      }

      setMessages((prevMessages) => {
        prevMessages[dialogId].forEach((message) => {
          if (message._id === messageId && message.read === 0) {
            message.read = 1;
            message.read_ids?.push(userId);
          }
        });
        return prevMessages;
      });
    };

    ConnectyCube.chat.onMessageTypingListener = (isTyping: boolean, userId: number, dialogId: string) => {
      // TODO: handle multi-device
      if (userId === currentUserIdRef.current) {
        return;
      }

      setTypingStatus((prevTypingStatus) => ({
        ...prevTypingStatus,
        [dialogId]: { [userId]: isTyping },
      }));

      if (isTyping) {
        typingTimers.current[dialogId + userId] = setTimeout(() => {
          _stopTyping(userId, dialogId);
        }, 5000);
      } else {
        clearTimeout(typingTimers.current[dialogId + userId]);
      }
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
        processOnMessage,
        processOnMessageError,
        ...chatUsers,
        ...blockList,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
