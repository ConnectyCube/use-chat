# Use Chat

A React hook for state management in ConnectyCube-powered chat solutions.

This library provides a headless solution for managing chat functionality in ConnectyCube. Similar to how Formik simplifies form handling, this library streamlines the development of chat applications.

The core purpose is to handle essential chat features like state management, handling subsequent events and APIs properly etc, so the end user takes care about UI building only.

## Features

- Handle chat states, including the currently active conversation
- Handle chat messages state, store last 50 messages in memory for every chat
- Manage chat participants states
- Maintain typing indicators and users last activity.
- Support attachments download

## Installation

```
npm install @connectycube/use-chat
```

or

```
yarn add @connectycube/use-chat
```

## Usage

```ts
import { useChat } from "@connectycube/use-chat";

const MyComponent = () => {
  const { connect, createChat, sendMessage, selectedDialog } = useChat();

  const handleConnect = async () => {
    const chatCredentials = {
      userId: 22,
      password: "password",
    };
    await connect(chatCredentials);
  };

  const handleCreateChat = async () => {
    const userId = 456;
    const dialog = await createChat(userId);
    await selectDialog(dialog);
  };

  const handleSendMessage = async () => {
    // send message to selected dialog
    sendMessage("Hi there");
  };

  return (
    <div className="container">
      <button type="button" onClick={handleConnect}>
        Connect
      </button>
      <button type="button" onClick={handleCreateChat}>
        Create chat
      </button>
      <button type="button" onClick={handleSendMessage}>
        Send message
      </button>
    </div>
  );
};

export default MyComponent;
```

Check types for more API examples https://github.com/ConnectyCube/use-chat/blob/main/src/types/index.ts

## How to publish new version

1. Have Node20, do `npm i`
2. `npm run build`
3. update the library version in `package.json`
4. Login to npm `npm login`
5. publish library `npm publish --access public`
6. Verify that our library has been published successfully: `npm view @connectycube/use-chat`

## Community and support

- [Blog](https://connectycube.com/blog)
- X (twitter)[@ConnectyCube](https://x.com/ConnectyCube)
- [Facebook](https://www.facebook.com/ConnectyCube)

## Website

[https://connectycube.com](https://connectycube.com)

## License

[Apache 2.0](https://github.com/connectycube/use-chat/blob/main/LICENSE)
