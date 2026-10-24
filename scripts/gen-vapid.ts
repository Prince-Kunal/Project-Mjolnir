// Prints a new VAPID key pair for Web Push (section 10):
//   VAPID_KEYS            Edge Function secret (private; never commit)
//   VITE_VAPID_PUBLIC_KEY the web app's applicationServerKey (public)
// Changing keys invalidates every saved subscription, so generate once per environment.
import { exportApplicationServerKey, exportVapidKeys, generateVapidKeys } from '@negrel/webpush';

const keys = await generateVapidKeys({ extractable: true });
console.log(`VAPID_KEYS='${JSON.stringify(await exportVapidKeys(keys, {}))}'`);
console.log(`VITE_VAPID_PUBLIC_KEY=${await exportApplicationServerKey(keys, {})}`);
