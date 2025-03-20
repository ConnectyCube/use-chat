# Use Chat

A React hook for state management in ConnectyCube-powered chat solutions.

This library provides a headless solution for managing chat functionality in ConnectyCube. Similar to how Formik simplifies form handling, this library streamlines the development of chat applications.

The core purpose is to handle essential chat features like state management, handling subsequent events and APIs properly etc, so the end user takes care about UI building only.

## Features

- Handle chats and messages states, including the currently active conversation
- Manage chat participants states
- Maintain typing indicators and users last activity.
- Support attachments download
- Message drafts
- Moderation via user reporting and block

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

For more complex example please check [React chat code sample](https://github.com/ConnectyCube/connectycube-web-samples/tree/master/chat-react)

## API

Check types for more API examples https://github.com/ConnectyCube/use-chat/blob/main/src/types/index.ts

## Documentation 

[https://developers.connectycube.com/js/use-chat](https://developers.connectycube.com/js/use-chat)

## Have an issue?

Join our [Discord](https://discord.com/invite/zqbBWNCCFJ) for quick answers to your questions

## Community

- [Blog](https://connectycube.com/blog)
- X (twitter)[@ConnectyCube](https://x.com/ConnectyCube)
- [Facebook](https://www.facebook.com/ConnectyCube)

**Want to support our team**:<br>
<a href="https://www.buymeacoffee.com/connectycube" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## License

[Apache 2.0](https://github.com/connectycube/use-chat/blob/main/LICENSE)
