# Changelog

## 0.26.1

### Bug fixes

- The `totalMessagesReached` state defines is determined correctly

## 0.26.0

### Updated

- Uses `connectycube@4.6.0`

### Misc

- Added the `terminate` method to stop the chat connection, with the ability to reconnect
- The _"SASLError: not-authorized"_ error tries to disconnect or terminate the chat connection
- Added the `getNextDialogs` method to fetch the next batch of dialogs
- Implemented the `totalDialogReached` (`boolean`) state to indicate whether all dialogs have been fetched
- Implemented the `totalMessagesReached` (`{ [dialogId: string]: boolean }`) state to indicate whether all messages for a dialog have been fetched

## 0.25.0

### Updated

- Uses `connectycube@4.5.0`

## 0.24.0

### Features

- Added method `getNextMessages` to get the next batch of messages for the dialog
- Implemented new statuses "not-authorized" and "error" for `chatStatus` state

## 0.23.2

### Misc

- use `connectycube@4.4.0`
- types

## 0.23.1

### Misc

- Methods `fetchUserById` and `getAndStoreUsers` also update existed `onlineUsers` state
- Private messages from offline (delayed) will be ignored. These messages will be available in `processOnMessage`'s callback to process.

## 0.23.0

### Misc

- Extended message statuses "wait", "sent", "read" and "lost"
- Internal chat connection manager

### Features

- Implemented `chatStatus` state with "disconnected", "connecting" and "connected" statuses
- Implemented `processOnMessageSent` function to handle actions triggered by lost/sent message

## 0.22.0

### Bug fixes

- do not crash when stop typing on received message for non existent chat

## 0.21.0

### Features

- Implemented `fetchUserById` method to retrieve and update a user in the store by their ID.
- Implemented `getAndStoreUsers` method to retrieve users using [params](https://developers.connectycube.com/server/users#retrieve-users-v2) and store them in the state of the **useChat** hook.
- Implemented `sendSignal` method to send a system message as a custom signal.
- Implemented `processOnSignal` function to handle actions triggered by incoming signals from other users.

## 0.20.0

### Updated

- Refactored typing statuses, so the `typingStatus` state is an array with currently typing users for each dialogId as key

## 0.19.0

### Features

- Implemented `getOnlineUsersCount` function to get the total count of online users
- `onlineUsers` and `onlineUsersCount` properties to get the state of online users
- Implemented `subscribeToUserLastActivityStatus(userId)` and `unsubscribeFromUserLastActivityStatus(userId)` functions to start/stop listening to user last activity status
- `lastActivity` property to get the state users last activity

### Updated

- The function `listOnlineUsers` has been renamed to `listOnlineUsersWithParams` to reflect pagination parameters, such as `limit` and `offset`
- The function `listOnlineUsers` can now handle multiple requests under the hood to retrieve all online users

## 0.18.0

### Bug fixes

- users, dialogs and messages state management were refactored to prevent duplicates.

### Misc

- Added support for node 22;
- Upgraded `connectycube` >=4.2.2 to use import types and enums from "connectycube/types";

## 0.17.0

### Misc

- Optimize Block users API

## 0.16.0

### Features

- Implemented `processOnMessageError` function to process needed actions on error message;
- Allow to pass `photo` and `extensions` in `createChat` and `createGroupChat`.

### Bug fixes

- Block users API.

## 0.15.0

### Features

- Implemented Block users API

## 0.14.4

### Bug fixes

- `listOnlineUsers` to store retrieved users in `users`

## 0.14.3

### Bug fixes

- `getMessages` to handle properly non existent chat case

### Misc

- Run `npm run version` to fetch the `package.json` version to the latest one from `CHANGELOG.md`;

## 0.14.2

### Bug fixes

- Fixes for automated releases.

## 0.14.1

### Bug fixes

- Attachment type is `undefined` when using `sendMessageWithAttachment`.

## 0.14.0

### Features

- `sendMessageWithAttachment` now sends an array of attachments. Retrieve the attachment URL from `message.attachments[index].url` instead of `message.fileUrl[0]`;

### Bug fixes

- Chats duplication in `getDialogs`.

## 0.13.0

### Features

- Introduced `unreadMessagesCount` object to retrieve total unread messages count (`unreadMessagesCount.total`) or by dialog ID (`unreadMessagesCount[dialog._id]`);
- Added `processOnMessage` function to process needed actions on any incoming messages from other users.

```typescript
const { processOnMessage } = useChat();

processOnMessage((userId: number, message: Chat.Message): void => {
  playIncomingSound(); // for example
});
```

## 0.12.0

### Features

- Added `listOnlineUsers` function to get a list of current online users.

```typescript
/**
 * Retrieves online users no more frequently than once per minute with the same parameters
 * Use the 'force' option to bypass this limitation if necessary
 **/
listOnlineUsers(params?: {limit?: number, offset?: number}, force?: boolean): Promise<User[]>;
```

### Bug fixes

- current user id is missing in `users` when someone created a chat with you;

## 0.11.0

### Features

- Introduced `isOnline` state;
- When call `selectDialog`, the messages will be retrieved if chat is not activated yet;

### Bug fixes

- In `selectDialog`, call `markDialogAsRead` only when `unread_messages_count > 0`;
- current user id is missing in `users`;
- fix crash when add message to store.

## 0.10.0

Initial release.
