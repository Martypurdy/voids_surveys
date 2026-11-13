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

Each job has five sections, shown as tabs in this order: **Address, Property, Meters, Rooms,
Externals**. A tab turns **amber** when you open it and **green ✓** when you tap the
*Mark … complete* button at the bottom of that screen (which then moves you to the next
unfinished section). *Reopen section* undoes it. The job list shows a progress bar and
“n of 5 sections complete”.

1. **Jobs** – create, open, import a `.json` job file; ⋮ on a job gives PDF / backup / delete.
2. **Address** – enter the postcode at the top and tap *Look up*: the street, area, town and
   postcode are filled into a single address box with the cursor at the start, ready for the
   house number. Edit the box freely. The job title becomes the first line + postcode
   (e.g. “12 Bennett Road, LS6 3HN”). *Navigate* opens Google Maps directions; *View on Google
   Maps* shows the pin; *Use my location* stores the GPS position.
   Free postcode data has no house numbers, and a few postcodes (large sites, PO boxes) have no
   street – then the first line is left blank for you to fill in.
   **Surveyor** – pick from a list saved on this device; *+ Add* adds a name, *Remove* takes it
   off the list. The last surveyor picked is filled in automatically on new surveys.
3. **Property** – House / Flat / Bungalow / Maisonette / Bedsit / Other, style (houses and
   bungalows), floor level (flats), bedrooms, storeys; **property photo** (the first one is shown
   at the top of the PDF); **Works required** – tap to select (green): Fit key safe (on by
   default), Gain entry, Renew locks (pop-up: Front door pre-ticked, Back, Patio, Shed,
   Gate, Garage, Windows, Post box – pick any), Property clearance (pop-up: Full, Partial,
   Needle sweep, Environmental, Pest control, and by Operatives / Contractor), and **Key safe
   details** (location, masked code – *Show* to reveal, GPS pin, photos).
4. **Meters** – **Heating type** pop-up (Gas boiler, Electric heaters, Heat pump – pick any),
   then gas, electric and water meters, each with **meter location** and photos
   (*+ Add another meter* for extras).
5. **Rooms / Externals** – add from presets (Bedroom auto-numbers) or a custom name; each has
   condition (Good / Fair / Poor / N/A), notes and photos.

Surveys made with older versions keep any key register or meter readings they recorded; these
still appear in the PDF.

**Photos:** *Add photos* asks **Take photos** or **Upload from phone** (pick several at once).
**Take photos** opens the app’s own full-screen camera: tap the shutter as many times as you
like – there’s no review step after each shot – then tap **Done**. Zoom buttons **.5× / 1× / 2×**
are always shown:
- **.5×** zooms **out** to the wide lens – it never guesses:
  - phones whose browser offers zoom below 1× use that;
  - on iPhone it switches straight to the *Ultra Wide* lens;
  - otherwise (many Android phones don’t say which lens is which) the first tap runs a
    one-time **wide lens setup**: each rear lens is shown with *“Is this picture WIDER than
    normal?”* – tap **Yes** on the wide one and it’s remembered on that phone. Zoom (telephoto)
    lenses are never offered, and lenses that fail or show no picture are skipped;
  - if there’s no wide lens available to the browser, it offers *Use phone camera for .5×*
    and *Try lens setup again*.

  Zoom buttons are greyed out while a lens is switching, so repeated taps can’t jam it.
- **2×** uses real zoom where available, otherwise a digital crop (lower resolution).
- A torch button appears where supported. The first time, the browser asks for camera
  permission; if it’s refused, the phone’s own camera app is offered instead.
Photos are resized on the device to 1600 px JPEG.

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

- the postcode lookup, when you tap *Look up*: the postcode goes to api.postcodes.io, then the
  postcode's centre point goes to OpenStreetMap Nominatim to find the street name;
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
