import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert';
import {
  base64UrlToBytes,
  bytesToBase64,
  decryptToken,
  encryptToken,
  importTokenKey,
  pkceChallenge,
  randomToken,
} from './crypto.ts';

const KEY = bytesToBase64(new Uint8Array(32).fill(7));

Deno.test('encrypts and decrypts a token', async () => {
  const key = await importTokenKey(KEY);
  const sealed = await encryptToken(key, '1//refresh-token');
  assertNotEquals(sealed, '1//refresh-token');
  assertEquals(await decryptToken(key, sealed), '1//refresh-token');
});

Deno.test('uses a fresh IV each time', async () => {
  const key = await importTokenKey(KEY);
  assertNotEquals(await encryptToken(key, 'same'), await encryptToken(key, 'same'));
});

Deno.test('rejects a tampered payload', async () => {
  const key = await importTokenKey(KEY);
  const sealed = await encryptToken(key, 'secret');
  const last = sealed.at(-2) === 'A' ? 'B' : 'A';
  await assertRejects(() => decryptToken(key, sealed.slice(0, -2) + last + sealed.at(-1)));
});

Deno.test('rejects the wrong key', async () => {
  const sealed = await encryptToken(await importTokenKey(KEY), 'secret');
  const other = await importTokenKey(bytesToBase64(new Uint8Array(32).fill(9)));
  await assertRejects(() => decryptToken(other, sealed));
});

Deno.test('requires a 32-byte key', async () => {
  await assertRejects(() => importTokenKey(bytesToBase64(new Uint8Array(16))));
});

Deno.test('randomToken is URL-safe with the requested entropy', () => {
  const t = randomToken(48);
  assertMatch(t, /^[A-Za-z0-9_-]+$/);
  assertEquals(base64UrlToBytes(t).length, 48);
});

Deno.test('pkceChallenge matches the RFC 7636 example', async () => {
  assertEquals(
    await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});
