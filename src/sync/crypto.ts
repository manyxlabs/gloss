// End-to-end encryption for sync. A room's secret is 256 random bits carried only in the share
// link's fragment, which browsers never send to a server. Two keys are derived from it: one
// encrypts everything, the other proves to the server that a device may use the room. The
// server keeps only a hash of the second and cannot work back to the first.

import { split } from '../i18n/langs';
import type { Project } from '../types';

const text = new TextEncoder();

// Byte by byte, as spreading a large array into one call overflows the stack.
export const b64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export type Binding = NonNullable<Project['sync']>;
export const newRoom = (): Binding => ({ room: b64(random(16)), key: b64(random(32)) });

/** A group of one person's screens on a project, named in the link that opens another. */
export const newScreens = () => b64(random(16));

const LINK = /^#\/join\/([\w-]{22})\.([\w-]{43})(?:\/screen\/([\w-]{22}))?$/;
/** This app's address, without a language's prefix, so whoever opens a link to it has it in their own language. */
export const appUrl = () => `${location.origin}${split(location.pathname).prefixed ? '/' : location.pathname}`;

export const shareLink = ({ room, key }: Binding, screen?: string) => `${appUrl()}#/join/${room}.${key}${screen ? `/screen/${screen}` : ''}`;
export const parseLink = (hash: string): (Binding & { screen?: string }) | null => {
  const m = LINK.exec(hash);
  return m ? { room: m[1]!, key: m[2]!, ...(m[3] ? { screen: m[3] } : {}) } : null;
};

export type Keys = { key: CryptoKey; auth: string };

export async function deriveKeys(secret: string): Promise<Keys> {
  const base = await crypto.subtle.importKey('raw', unb64(secret), 'HKDF', false, ['deriveKey', 'deriveBits']);
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: text.encode(info) });
  const [key, auth] = await Promise.all([
    crypto.subtle.deriveKey(params('gloss sync encryption'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.deriveBits(params('gloss sync room access'), base, 256),
  ]);
  return { key, auth: b64(new Uint8Array(auth)) };
}

// `context` is authenticated with the data, so the server cannot pass one kind of message off
// as another, or serve one document's file as another's.
export async function encrypt(key: CryptoKey, data: Uint8Array<ArrayBuffer>, context: string) {
  const iv = random(12);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: text.encode(context) }, key, data);
  const out = new Uint8Array(12 + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), 12);
  return out;
}

export async function decrypt(key: CryptoKey, data: Uint8Array, context: string) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: text.encode(context) }, key, data.slice(12)));
}
