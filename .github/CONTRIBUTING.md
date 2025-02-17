# Contributing

## Development

To set up the development environment:

### Clone the repository

```bash
git clone git@github.com:ConnectyCube/use-chat.git
cd use-chat
```

### Install dependencies

```bash
npm install
```

### Build lib

```bash
npm run build
```

## How to publish new version

1. Have Node20, do `npm i`
2. `npm run build`
3. update the library version in `package.json`
4. Login to npm `npm login`
5. publish library `npm publish --access public`
6. Verify that our library has been published successfully: `npm view @connectycube/use-chat`
7. `git tag 0.13.0`
8. `git push origin --tags`
9. Create release in GitHub https://github.com/ConnectyCube/use-chat/releases