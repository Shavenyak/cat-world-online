# Cat World Online

A browser multiplayer cat game where every player can explore a shared house-and-garden map, eat fish snacks, and collect gifts together.

## Features

- Walk and jump across a much wider map
- Start inside a cozy room and walk outside through the sun door into the garden
- Eat fish collectibles and pick up gift boxes that respawn for everyone
- Press `M` to meow so other players can see it in real time
- Join from multiple browser windows to test multiplayer locally

## Run locally

```bash
node server.js
```

Then open `http://localhost:3000`.

## Test

```bash
node --test --test-concurrency=1 --experimental-test-isolation=none
```

## Deploy as a real app

This project is a long-running Node server, so the cleanest hosting choices are Render, Railway, or Fly.io.

### Recommended: Render

1. Put the `cat-world` folder in its own GitHub repo.
2. Create a new Web Service on Render.
3. Use these settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: `24`
4. Deploy and open the generated HTTPS URL.

A ready Render config is included in `render.yaml`.

### About Netlify

Netlify is great for static sites, but this game currently depends on a persistent Node server that keeps shared multiplayer world state in memory. That means Netlify is not the best fit for the full app unless we refactor the backend into a different architecture such as serverless plus shared database/realtime storage.