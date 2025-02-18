# Changelog

## 0.14.3

### Features

- Run `npm run version` to fetch the `package.json` version to the latest one from `CHANGELOG.md`.

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
