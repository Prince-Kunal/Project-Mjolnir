// This device's Web Push subscription (section 10). Notifications go to every device a user turns
// them on for; the server decides what to send and when.
import { supabase } from './supabase.ts';

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState =
  | 'unsupported' // no service worker or Push API
  | 'needs_install' // iOS: Web Push works only from the Home Screen app
  | 'not_configured' // this build has no VAPID key
  | 'denied'
  | 'off'
  | 'on';

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function standalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return isIos() && !standalone() ? 'needs_install' : 'unsupported';
  if (!PUBLIC_KEY) return 'not_configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

/** Asks for permission, subscribes this device and saves it. */
export async function enablePush(): Promise<void> {
  if (!PUBLIC_KEY) throw new Error('Notifications are not set up for this build.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(PUBLIC_KEY),
    }));
  await save(sub);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Re-saves this device's subscription after sign-in, in case the browser rotated it. */
export async function refreshPush(): Promise<void> {
  if ((await pushState()) !== 'on') return;
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (sub) await save(sub);
}

export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('send_test_push');
  if (error) throw new Error(error.message);
}
