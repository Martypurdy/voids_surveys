# Void Surveys

A mobile-first, offline web app (PWA) for void property condition surveys in social housing.

- **No backend, no accounts.** Everything is stored on the device in IndexedDB.
- **Works offline** after the first visit (service worker).
- Plain HTML/CSS/JS ES modules – **no build step**, nothing to install.

## Run locally

```sh
npx serve .
```

Then open the URL it prints (usually <http://localhost:3000>).

Any static file server works (e.g. `python -m http.server`). Camera, geolocation and the service
worker need a secure context: `localhost` counts, but to test on a phone you need HTTPS – the
easiest way is GitHub Pages (below).

**Developing with the service worker:** files are served cache-first, so after editing code
either tick *Update on reload* in DevTools → Application → Service workers, or bump `VERSION`
in `sw.js`.

## Deploy (GitHub Pages)

Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`. All paths are relative, so it
works under `https://<user>.github.io/voids_surveys/`.

When you change any file, **bump `VERSION` in `sw.js`** (and add new files to `ASSETS`).
Open devices will show “A new version is available – Reload”.

## Using it

1. **Jobs** – create, open, import a `.json` job file; ⋮ on a job gives PDF / backup / delete.
2. **Address** – manual entry; *Look up* fills town and map location from api.postcodes.io;
   *Navigate* opens Google Maps directions; *Use my location* stores the GPS position.
3. **Rooms / Externals** – add from presets (Bedroom auto-numbers) or a custom name; each has
   condition (Good / Fair / Poor / N/A), notes and photos.
4. **Keys** – key set, quantity, received from, issued to, date, photos.
5. **Key safe** – location, masked code (*Show* to reveal), GPS pin, photos.
6. **Meters** – gas, electric, water (add more if needed): type (Credit / Prepayment / Smart),
   supply status (On / Off / Capped / Not found), credit/debt balance for prepayment, serial,
   reading, date, location, photos.

**Photos:** *+ Add photos* lets iOS offer Take Photo / Photo Library; the camera button opens
the rear camera directly. Photos are resized on the device to 1600 px JPEG.

## Exports & backups

- **PDF report** – summary, every section, photos (re-encoded at 1024 px to keep size down).
- **Backup file (.json)** – the whole job with photos as base64. Import it on any device.
  Importing a job that already exists offers *Replace* or *Keep both*.
- The **key safe code is left out of both** unless you tick *Include key safe code*.
- On phones the file opens the share sheet (save to Files, email, etc.); on desktop it downloads.

### Back up regularly

Browsers can clear site data – notably iOS Safari for web apps that aren’t added to the Home
Screen and haven’t been used for a while. To reduce the risk:

- **Add the app to your Home Screen** (Share → Add to Home Screen on iOS).
- The app requests persistent storage when you create a job.
- Jobs show **“Not backed up since …”** when no `.json` backup was made in the last 7 days
  (a PDF doesn’t count, since it can’t be re-imported).

## Privacy

Survey data never leaves the device unless you export it. The only network requests are:

- the postcode lookup (sends just the postcode to api.postcodes.io, when you tap *Look up*);
- Google Maps, opened in a new tab when you tap *Navigate* or *view map*.

## Project layout

```
index.html, manifest.webmanifest, sw.js   app shell, PWA manifest, offline cache
css/app.css                               styles (light/dark)
icons/                                    app icons
vendor/                                   idb-keyval, jsPDF (pinned, see VERSIONS.md)
js/app.js                                 routes, service worker registration
js/router.js                              hash router
js/db.js                                  IndexedDB: jobs + photos stores, autosave
js/model.js                               job model, presets, helpers
js/ui.js                                  DOM helpers, fields, dialogs, toasts
js/geo.js                                 GPS, postcodes.io, Maps links
js/photos.js                              capture, compression, photo widget
js/views/                                 one module per screen
js/export/                                PDF, JSON backup/import, share/download
```
