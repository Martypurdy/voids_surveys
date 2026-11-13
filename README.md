# Void Surveys

A mobile-first, offline web app (PWA) for void property condition surveys in social housing.

- **No backend, no accounts.** Everything is stored on the device in IndexedDB.
- **Works offline** after the first visit (service worker).
- Plain HTML/CSS/JS ES modules – **no build step**.

## Run locally

```sh
npx serve .
```

Then open the URL it prints (usually <http://localhost:3000>).

Any static file server works (`python -m http.server` too). Camera capture, geolocation and
the service worker need a secure context: `localhost` counts, but to test on a phone over your
LAN you need HTTPS (e.g. deploy to GitHub Pages, or use a tunnelling tool).
