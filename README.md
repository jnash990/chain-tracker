# Faction Chain Consumption Tracker

A standalone web application for Torn City faction leadership to track chain performance: hits, respect, xanax usage, and faction points consumption.

- **Static site** – HTML, CSS, JavaScript only
- **IndexedDB** – Persistent local storage
- **Torn API v2** – No backend required
- **GitHub Pages** – Deploy as a static site

## Setup

1. Clone or download this repository
2. Serve the folder over HTTP (ES modules require it). For example:
   - `npx serve .` or `python -m http.server 8000`
3. Open `http://localhost:3000` (or your server URL)
4. Enter your Torn faction API key (chain + news permissions)
5. Track your chain

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose the `main` branch and `/ (root)` folder
5. Save; the site will be available at `https://<username>.github.io/<repo>/`

If the repo root is the site root, ensure `index.html` is at the root. Paths use relative URLs (`./js/app.js`, `./css/styles.css`) and work with GitHub Pages.

## API Key

Use a Torn faction API key with:
- Chain access
- Faction news (armory actions) access

The key is stored locally in IndexedDB and never sent to any server except Torn's API.

## Tech Stack

- TailwindCSS (CDN)
- Vanilla JavaScript (ES6 modules)
- IndexedDB
- Torn API v2

## Browser Support

Tested in Chrome and Edge. Requires ES6 modules and IndexedDB support.
