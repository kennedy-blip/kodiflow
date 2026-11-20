# KodiFlow

An offline-first rental, water-meter and maintenance prototype built with React, Dexie and Capacitor. New installations start with **demo data**, not real tenant records. Data lives in the browser or Android WebView on that device; there is no sync between devices. Back it up regularly from Settings.

## Run and deploy

```sh
npm ci
npm run dev
npm run build
npm test
```

Deploy the repository to Vercel as a Vite application. The generated service worker caches the application shell after the first online visit; records are stored in IndexedDB. Browser storage can be evicted or cleared, so exports are important.

## Android

The Capacitor Android project is included. With Java and the Android SDK installed:

```sh
npm ci
npm run cap:apk
```

This builds `android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds are not production-signed. For distribution, open `npm run cap:open` in Android Studio and generate a signed release APK, then copy that binary to `public/kodiflow.apk` and redeploy. The GitHub Actions workflow builds a debug APK, validates it and publishes it to this working branch as `public/kodiflow.apk` for the website to serve. This is a test build, not a production-signed release. A fresh debug signing key may be used on each build, so upgrades over an earlier build may require uninstalling it first; uninstalling can erase local app data.

## Important limitations

The role switcher is a local UI mode, not authentication or a security boundary. Anyone with access to the device can switch roles or inspect IndexedDB. Do not use this prototype for sensitive data or real multi-user access until authentication, server-side authorization, secure storage and sync are implemented. Rent and occupancy changes are effective for the whole month in which they are saved. Older records created before billing history was introduced are assumed to have the terms they had when the first change was recorded. Changes within the same month replace that month's terms. Use **Change tenancy** in the unit drawer when a tenant moves in or out. The current ledger must first be settled to zero, including any credit. The app archives that ledger and carries the meter reading into a fresh one; archived records are included in JSON backups. Both tenancies may be charged a full month when turnover occurs, so check the agreement and reconcile manually. Repairs remain with the unit. Historical tenant changes made before this feature cannot be reconstructed; tenant name corrections and opening arrears are not historically versioned. This is not an accounting-grade ledger. The invoice print button opens the browser's normal print dialog. Test backup and restore before relying on stored data.

Backups contain private tenant and financial information in unencrypted JSON. Restore replaces all local records after confirmation; invalid backups are rejected before the database is changed. Meter readings must continue from the last recorded value; meter replacement or rollover requires manual correction outside this prototype.

The Android workflow builds on a GitHub-hosted runner and also uploads a debug APK as a workflow artifact. Production releases require a stable, securely held signing key and a deliberate release process. The Capacitor sync script removes the downloadable APK from the native app assets to avoid embedding the APK inside itself.
