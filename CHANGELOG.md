# Changelog

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
