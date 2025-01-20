/* eslint-disable */
import ConnectyCube from "connectycube";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ChatContextType,
  ChatProviderType,
  FileAttachment,
  GroupChatEventType,
} from "./types";
import { Chat, Dialogs, Messages, Users } from "connectycube/dist/types/types";

const ChatContext = createContext<ChatContextType | undefined>(undefined);
ChatContext.displayName = "ChatContext";

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChat must be within ChatProvider");
  }

  return context;
};

export const ChatProvider = ({
  children,
}: ChatProviderType): React.ReactElement => {
  const [currentUserId, setCurrentUserId] = useState<number | undefined>();
  const [dialogs, setDialogs] = useState<Dialogs.Dialog[]>([]);
  const [users, setUsers] = useState<{ [userId: number]: Users.User }>({});
  const [selectedDialog, setSelectedDialog] = useState<
    Dialogs.Dialog | undefined
  >();
  const [messages, setMessages] = useState<{
    [dialogId: string]: Messages.Message[];
  }>({});
  const [lastActivity, setLastActivity] = useState<{
    [userId: number]: string;
  }>({});
  const [typingStatus, setTypingStatus] = useState<{
    [dialogId: string]: { [userId: string]: boolean };
  }>({});
  const typingTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const connect = async (credentials: Chat.ConnectionParams) => {
    try {
      await ConnectyCube.chat.connect(credentials);
      setCurrentUserId(credentials.userId);
    } catch (error) {
      console.error(`Failed to connect due to ${error}`);
    }
  };

  const isConnected = () => {
    return ConnectyCube.chat.isConnected;
  };

  const disconnect = () => {
    if (ConnectyCube.chat.isConnected) {
      ConnectyCube.chat.disconnect();
      setCurrentUserId(undefined);
    }
  };

  const createChat = async (userId: number): Promise<Dialogs.Dialog> => {
    const params = {
      type: 3,
      occupants_ids: [userId],
    };
    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs([dialog, ...dialogs]);

    _notifyUsers(GroupChatEventType.NEW_DIALOG, dialog._id, userId);

    _retrieveAndStoreUsers([userId]);

    setSelectedDialog(dialog);

    return dialog;
  };

  const createGroupChat = async (
    usersIds: number[],
    chatName: string
  ): Promise<Dialogs.Dialog> => {
    const params = {
      type: 2,
      name: chatName,
      occupants_ids: usersIds,
    };

    const dialog = await ConnectyCube.chat.dialog.create(params);

    setDialogs([dialog, ...dialogs]);

    usersIds.forEach((userId) => {
      _notifyUsers(GroupChatEventType.NEW_DIALOG, dialog._id, userId);
    });

    _retrieveAndStoreUsers(usersIds);

    setSelectedDialog(dialog);

    return dialog;
  };

  const getDialogs = async (
    filters?: Dialogs.ListParams
  ): Promise<Dialogs.Dialog[]> => {
    // fetch chats
    const result = await ConnectyCube.chat.dialog.list(filters);

    // store dialogs
    setDialogs(result.items);

    // store users
    const usersIds = Array.from(
      new Set(result.items.flatMap((dialog) => dialog.occupants_ids))
    );
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
    const result = await ConnectyCube.chat.message.list(params);

    // store messages
    const retrievedMessages = result.items.map((msg) => {
      const attachmentsUrls = msg.attachments.map((attachment) => {
        const fileUrl = ConnectyCube.storage.privateUrl(attachment.uid);
        return fileUrl;
      });

      return { ...msg, attachmentsUrls };
    });
    setMessages({ ...messages, [dialogId]: retrievedMessages });

    return retrievedMessages;
  };

  const selectDialog = async (dialogId: string): Promise<void> => {
    const dialog = dialogs.find((d) => d._id === dialogId) as Dialogs.Dialog;

    setSelectedDialog(dialog);

    await getMessages(dialogId);

    await markDialogAsRead(dialog);
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
    selectedDialog.occupants_ids.forEach((userId) => {
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
    const updatedDialog = dialogs.find(
      (d) => d._id === selectedDialog._id
    ) as Dialogs.Dialog;
    updatedDialog.occupants_ids = Array.from(
      new Set([...updatedDialog.occupants_ids, ...usersIds])
    );
    setSelectedDialog({ ...updatedDialog });
    setDialogs([...dialogs]);
  };

  const removeUsersFromGroupChat = async (
    usersIds: number[]
  ): Promise<void> => {
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
        return !usersIds.includes(userId);
      })
      .forEach((userId) => {
        _notifyUsers(GroupChatEventType.REMOVE_PARTICIPANTS, dialogId, userId, {
          removedParticipantsIds: usersIds.join(),
        });
      });

    // update store
    const updatedDialog = dialogs.find(
      (d) => d._id === selectedDialog._id
    ) as Dialogs.Dialog;
    updatedDialog.occupants_ids = updatedDialog.occupants_ids.filter(
      (userId) => !usersIds.includes(userId)
    );
    setSelectedDialog({ ...updatedDialog });
    setDialogs([...dialogs]);
  };

  const leaveGroupChat = async (): Promise<void> => {
    if (!selectedDialog) {
      throw new Error("No dialog selected");
    }

    await ConnectyCube.chat.dialog.delete(selectedDialog._id);

    // notify participants with system message
    selectedDialog.occupants_ids.forEach((id) => {
      _notifyUsers(
        GroupChatEventType.REMOVED_FROM_DIALOG,
        selectedDialog._id,
        currentUserId as number
      );
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
    _sendMessage(body, null, dialog, opponentId);
  };

  const sendMessageWithAttachment = async (
    file: File,
    dialog?: Dialogs.Dialog
  ): Promise<void> => {
    dialog ??= selectedDialog;
    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    const opponentId = getDialogOpponentId(dialog);

    const tempId = Date.now() + "";

    // add message to store
    const localUrl = URL.createObjectURL(file);
    _addMessageToStore(
      tempId,
      "Attachment", //file.type,
      dialog._id,
      currentUserId as number,
      opponentId,
      localUrl,
      true
    );

    // upload file to cloud
    const fileParams = {
      name: file.name,
      file: file,
      type: file.type,
      size: file.size,
      public: false,
    };
    const result = await ConnectyCube.storage.createAndUpload(fileParams);

    // update message in store (reset loading state)
    (
      messages[dialog._id].find((msg) => msg._id === tempId) as Messages.Message
    ).isLoading = false;
    setMessages({ ...messages });

    // send
    const messageId = _sendMessage(
      file.type,
      { uid: result.uid as string, type: file.type },
      dialog,
      opponentId
    );

    const fileUrl = ConnectyCube.storage.privateUrl(result.uid);

    // update message in store (update it and file url)
    const msg = messages[dialog._id].find(
      (msg) => msg._id === tempId
    ) as Messages.Message;
    msg._id = messageId;
    msg.attachmentsUrls = [fileUrl];
    setMessages({ ...messages });

    // TODO: https://react.dev/reference/react/useState#updating-state-based-on-the-previous-state
  };

  const _sendMessage = (
    body: string,
    fileParams: FileAttachment | null,
    dialog: Dialogs.Dialog,
    opponentId?: number
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
    if (fileParams) {
      messageParams.extension.attachments = [
        { uid: fileParams.uid, type: fileParams.type },
      ];
    }
    const messageId = ConnectyCube.chat.send(
      dialog.type === 3 ? (opponentId as number) : dialog._id,
      messageParams
    );

    // add message to store
    _addMessageToStore(
      messageId,
      body,
      dialog._id,
      currentUserId as number,
      opponentId
    );

    return messageId;
  };

  const _addMessageToStore = (
    messageId: string,
    body: string,
    dialogId: string,
    senderId: number,
    recipientId?: number,
    fileUrl?: string,
    isLoading?: boolean
  ) => {
    const ts = Math.round(new Date().getTime() / 1000);

    // update dialog
    const dialog = dialogs.find((d) => d._id === dialogId) as Dialogs.Dialog;
    dialog.last_message = body;
    dialog.last_message_user_id = senderId;
    dialog.last_message_date_sent = ts;
    setDialogs([...dialogs]);

    setMessages({
      ...messages,
      [dialog._id]: [
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
          attachments: [],
          attachmentsUrls: fileUrl ? [fileUrl] : [],
          reactions: {} as any,
          isLoading,
        },
        ...messages[dialog._id],
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
        dialogs.find((dialog) => {
          if (dialog._id === dialogId) {
            dialog.unread_messages_count >= 1
              ? dialog.unread_messages_count--
              : 0;
          }
        });
        setDialogs([...dialogs]);
      }
    });
    setMessages({ ...messages });
  };

  const _retrieveAndStoreUsers = async (usersIds: number[]) => {
    const usersToFind: number[] = [];
    Object.keys(usersIds).forEach((userIdStr) => {
      const userId = Number(userIdStr);
      if (!users[userId]) {
        usersToFind.push(userId);
      }
    });
    if (usersToFind.length > 0) {
      const params = {
        limit: 100,
        id: { in: usersToFind },
      };
      const result = await ConnectyCube.users.getV2(params);

      const usersIdsMap = result.items.reduce<{ [key: number]: Users.User }>(
        (map, user) => {
          map[user.id] = user;
          return map;
        },
        {}
      );
      setUsers({ ...users, ...usersIdsMap });
    }
  };

  const _notifyUsers = (
    command: string,
    dialogId: string,
    userId: number,
    params: any = {}
  ) => {
    const msg = {
      body: command,
      extension: {
        dialogId,
        ...params,
      },
    };

    ConnectyCube.chat.sendSystemMessage(userId, msg);
  };

  const searchUsers = async (term: string): Promise<Users.User[]> => {
    const users: Users.User[] = [];

    const usersWithFullName = await ConnectyCube.users.getV2({
      full_name: { start_with: term },
      limit: 100,
    });
    users.push(...usersWithFullName.items);

    const usersWithLogin = await ConnectyCube.users.getV2({
      login: { start_with: term },
      limit: 100,
    });
    users.push(...usersWithLogin.items);

    // remove duplicates and current user for search
    return users
      .filter(
        (user, ind) => ind === users.findIndex((elem) => elem.id === user.id)
      )
      .filter((user) => user.id !== parseInt(localStorage.userId));
  };

  const sendTypingStatus = (dialog?: Dialogs.Dialog) => {
    dialog ??= selectedDialog;
    if (!dialog) {
      throw "No dialog provided. You need to provide a dialog via function argument or select a dialog via 'selectDialog'.";
    }

    ConnectyCube.chat.sendIsTypingStatus(
      dialog.type === 3 ? (getDialogOpponentId(dialog) as number) : dialog._id
    );
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
          status = `Last seen ${day}/${month
            .toString()
            .padStart(2, "0")}/${year}`;
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

  const _stopTyping = (userId: number, dialogId: string) => {
    setTypingStatus((prevTypingStatus) => ({
      ...prevTypingStatus,
      [dialogId]: { [userId]: false },
    }));

    clearTimeout(typingTimers.current[dialogId + userId]);
  };

  // setup callbacks once
  useEffect(() => {
    ConnectyCube.chat.onMessageListener = (
      userId: number,
      message: Chat.Message
    ) => {
      const dialogId = message.dialog_id as string;
      const messageId = message.id;
      const body = message.body || "";
      const opponentId =
        message.type === "chat" ? (currentUserId as number) : undefined;

      _stopTyping(userId, dialogId);

      // add message to store
      let fileUrl;
      if (message.extension.attachments?.length > 0) {
        const fileUID = message.extension.attachments[0].uid;
        fileUrl = ConnectyCube.storage.privateUrl(fileUID);
      }
      _addMessageToStore(
        messageId,
        body,
        dialogId,
        userId,
        opponentId,
        fileUrl
      );

      // updates chats store
      setDialogs((prevDialogs) => {
        const dialog = prevDialogs.find(
          (d) => d._id === dialogId
        ) as Dialogs.Dialog;

        if (!selectedDialog || selectedDialog._id !== message.dialog_id) {
          dialog.unread_messages_count =
            (dialog.unread_messages_count || 0) + 1;
        }
        dialog.last_message = message.body;
        dialog.last_message_date_sent = parseInt(message.extension.date_sent);

        return [...prevDialogs];
      });
    };

    ConnectyCube.chat.onSystemMessageListener = async (
      message: Chat.SystemMessage
    ) => {
      const dialogId = message.extension.dialogId;
      const senderId = message.userId;

      switch (message.body) {
        // when someone created a new chat with you or added to chat
        case GroupChatEventType.NEW_DIALOG:
        case GroupChatEventType.ADDED_TO_DIALOG: {
          const result = await ConnectyCube.chat.dialog.list({
            _id: dialogId,
          });
          const dialog = result.items[0];

          _retrieveAndStoreUsers(
            dialog.occupants_ids.filter((id) => id !== currentUserId)
          );

          setDialogs((prevDialogs) => {
            return [dialog, ...prevDialogs];
          });

          break;
        }
        // when someone added new participants to the chat
        case GroupChatEventType.ADD_PARTICIPANTS: {
          const usersIds = message.extension.addedParticipantsIds
            .split(",")
            .map(Number);
          _retrieveAndStoreUsers(usersIds);

          const dialog = dialogs.find(
            (d) => d._id === dialogId
          ) as Dialogs.Dialog;
          setDialogs((prevDialogs) => {
            dialog.occupants_ids = dialog.occupants_ids.concat(usersIds);
            return [dialog, ...prevDialogs];
          });
          break;
        }
        // when someone removed participants from chat
        case GroupChatEventType.REMOVE_PARTICIPANTS: {
          const usersIds = message.extension.removedParticipantsIds
            .split(",")
            .map(Number);

          const dialog = dialogs.find(
            (d) => d._id === dialogId
          ) as Dialogs.Dialog;
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

          const dialog = dialogs.find(
            (d) => d._id === dialogId
          ) as Dialogs.Dialog;
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

    ConnectyCube.chat.onReadStatusListener = (
      messageId: string,
      dialogId: string,
      userId: number
    ) => {
      if (userId === currentUserId) {
        return;
      }

      setMessages((prevMessages) => {
        prevMessages[dialogId].forEach((message) => {
          if (message._id === messageId && message.read === 0) {
            message.read = 1;
            message.read_ids.push(userId);
          }
        });
        return prevMessages;
      });
    };

    ConnectyCube.chat.onMessageTypingListener = (
      isTyping: boolean,
      userId: number,
      dialogId: string
    ) => {
      if (userId === currentUserId) {
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

  return (
    <ChatContext.Provider
      value={{
        connect,
        isConnected,
        disconnect,
        currentUserId,
        getDialogs,
        dialogs,
        selectDialog,
        selectedDialog,
        getDialogOpponentId,
        getMessages,
        messages,
        sendMessage,
        createGroupChat,
        createChat,
        markDialogAsRead,
        users,
        searchUsers,
        sendTypingStatus,
        typingStatus,
        sendMessageWithAttachment,
        lastActivity,
        getLastActivity,
        removeUsersFromGroupChat,
        addUsersToGroupChat,
        leaveGroupChat,
        readMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
