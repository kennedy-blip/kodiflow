import { rm } from 'node:fs/promises';
// Never embed the downloadable APK within itself when syncing the web assets.
await rm('dist/kodiflow.apk', { force: true });
