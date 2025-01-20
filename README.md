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

  const handle = async () => {
    const chatCredentials = {
      userId: 22,
      password: "password",
    };
    await connect(chatCredentials);

    const userId = 208;
    await createChat(userId);

    sendMessage("Hi there", selectedDialog)
  };

  return (
    <div className="container">
      <button type="button" onClick={handle}>
        Connect & send message
      </button>
    </div>
  );
};

export default MyComponent;
```

## How to publish new version

1. `npm run rollup`
2. update the library version in `package.json`
3. Login to npm `npm login`
4. publish library `npm publish --access public`
5. Verify that our library has been published successfully: `npm view @connectycube/use-chat`

## Community and support

- [Blog](https://connectycube.com/blog)
- X (twitter)[@ConnectyCube](https://x.com/ConnectyCube)
- [Facebook](https://www.facebook.com/ConnectyCube)

## Website

[https://connectycube.com](https://connectycube.com)

## License

[Apache 2.0](https://github.com/connectycube/use-chat/blob/main/LICENSE)
