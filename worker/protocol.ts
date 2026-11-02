// The sync wire format, shared by the Room and the app. Every frame is a type byte, a number
// (a log sequence, a peer, or nothing), then a body the server cannot read: it is encrypted
// with a key that never leaves the devices.

export const PROTOCOL = 'gloss-sync-1';

export const T = {
  /** An encrypted Yjs update: client to room, and room to clients with its sequence. */
  update: 1,
  /** Encrypted presence: client to room, and room to clients with the sender's peer number. */
  presence: 2,
  /** An encrypted full state that replaces the log up to and including the given sequence. */
  compact: 3,
  /** The sequence the room gave the sender's last update. */
  ack: 4,
  /** The log has been sent; the number is how many updates follow the snapshot. */
  ready: 5,
  snapshot: 6,
  /** A peer disconnected. */
  leave: 7,
  /** The log was compacted up to the given sequence. */
  compacted: 8,
} as const;

const HEAD = 9;
export const MAX_FRAME = 8 << 20;
export const MAX_PRESENCE = 1024;
export const MAX_FILE = 64 << 20;

export function frame(type: number, n: number, body?: Uint8Array) {
  const out = new Uint8Array(HEAD + (body?.byteLength ?? 0));
  const view = new DataView(out.buffer);
  view.setUint8(0, type);
  view.setFloat64(1, n);
  if (body) out.set(body, HEAD);
  return out;
}

export function parse(data: ArrayBuffer) {
  if (data.byteLength < HEAD) return null;
  const view = new DataView(data);
  return { type: view.getUint8(0), n: view.getFloat64(1), body: new Uint8Array(data, HEAD) };
}

/** A room id is 128 random bits, an auth secret 256, both base64url; documents are UUIDs. */
export const route = (pathname: string) => /^\/api\/sync\/([\w-]{22})(?:\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.exec(pathname);
export const AUTH = /^[\w-]{43}$/;
