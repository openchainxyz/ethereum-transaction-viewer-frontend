# ethereum-tracing-srv frontend
This is the frontend to the [Ethereum Transaction Viewer](https://tx.eth.samczsun.com/). By default, it's configured
to use the production backend.

TypeScript is disabled as the code is still kind of spaghetti and doesn't fully type-check. I'm not a frontend dev
so I doubt much of it is idiomatic either.

The main rendering logic is in [index.tsx](pages/index.tsx), which then
delegates out to the various components in [components/trace](components/trace). There's
a lot of duplicated code from rapidly prototyping a schema that works.

To bring up the frontend, just
```bash
pnpm install
pnpm run dev
```

To build an image, just
```bash
docker build .
```
# open repo in gitpod 

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/samczsun/ethereum-transaction-viewer-frontend)

- If button is not visible then click - [https://gitpod.io/#https://github.com/samczsun/ethereum-transaction-viewer-frontend](https://gitpod.io/#https://github.com/samczsun/ethereum-transaction-viewer-frontend)

- This will open this repository in a [Gitpod Instance](https://www.gitpod.io/) and 
  - Will build the repo 
  - Start and serve on port 3000 