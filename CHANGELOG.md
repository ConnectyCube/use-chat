# Changelog

## 0.11.0

### Features

- Introduced `isOnline` state
- When call `selectDialog`, the messages will be retrieved if chat is not activated yet

### Bug fixes

- In `selectDialog`, call `markDialogAsRead` only when `unread_messages_count > 0`
- current user id is missing in `users`

## 0.10.0

Initial release
