<a name="v0.27.0"></a>

## v0.27.0

### Chores

- added new commands `npm run version:major`, `npm run version:minor`, and `npm run version:patch` to bump version in the `package.json`

### Code Refactoring

- the method sendMessage can add an extension object to a sending message as the third parameter. `sendMessage: (body: string, dialog?: Dialogs.Dialog, extension?: { [key: string]: any }) => void;`

### Features

- new method `generateTempMessageId` to create a custom/temporary identifier for a message
- add `addTempMessage` and `updateTempMessage` methods to create and update a temporary custom message in chat messages

<a name="0.26.2"></a>

## 0.26.2

<a name="0.26.1"></a>

## 0.26.1

<a name="0.26.0"></a>

## 0.26.0

<a name="0.25.0"></a>

## 0.25.0

<a name="0.24.0"></a>

## 0.24.0

<a name="0.23.2"></a>

## 0.23.2

<a name="0.23.1"></a>

## 0.23.1

<a name="0.23.0"></a>

## 0.23.0

<a name="0.22.0"></a>

## 0.22.0

<a name="0.21.0"></a>

## 0.21.0

<a name="0.20.0"></a>

## 0.20.0

<a name="0.19.0"></a>

## 0.19.0

<a name="0.18.0"></a>

## 0.18.0

<a name="0.17.0"></a>

## 0.17.0

### Reverts

- CHANGELOG.md
- added method to unselect Dialog - `unselectDialog()`
- fixed processOnMessage, processOnMessageError, and selectDialog param types
- updated import types from connectycube (>=4.2.1)

<a name="0.16.0"></a>

## 0.16.0

<a name="0.15.0"></a>

## 0.15.0

<a name="0.14.4"></a>

## 0.14.4

<a name="0.14.3"></a>

## 0.14.3

<a name="0.14.2"></a>

## 0.14.2

<a name="0.14.1"></a>

## 0.14.1

<a name="0.14.0"></a>

## 0.14.0

<a name="0.13.0"></a>

## 0.13.0

<a name="0.12.0"></a>

## 0.12.0

<a name="0.11.0"></a>

## 0.11.0

<a name="0.10.0"></a>

## 0.10.0
