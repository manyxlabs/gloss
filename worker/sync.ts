import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { AUTH, frame, MAX_FILE, MAX_FRAME, MAX_PRESENCE, parse, PROTOCOL, route, T } from './protocol';

// A SQLite row holds at most 2 MB, so larger updates and snapshots are stored in parts.
const CHUNK = 1 << 20;

type Peer = { peer: number; presence?: ArrayBuffer };

/**
 * One shared project: a log of encrypted updates (with a snapshot replacing its start once a
 * client compacts it), relayed to every device connected to it. Nothing here can be decrypted.
 */
export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS log (seq INTEGER NOT NULL, part INTEGER NOT NULL, snapshot INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (seq, part))');
  }

  /**
   * The first secret presented claims the room; afterwards only the same secret is let in. It is
   * derived from the room key, which the server never sees and cannot work back to.
   */
  async authorize(auth: string) {
    if (!AUTH.test(auth)) return false;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth));
    // No await between reading and claiming, so two first visitors cannot both claim the room.
    const stored = this.ctx.storage.kv.get<ArrayBuffer>('auth');
    if (!stored) this.ctx.storage.kv.put('auth', hash);
    return !stored || crypto.subtle.timingSafeEqual(stored, hash);
  }

  async fetch(request: Request) {
    // Browsers cannot set headers on a WebSocket, so the secret travels as a second subprotocol.
    const offered =
      request.headers
        .get('Sec-WebSocket-Protocol')
        ?.split(',')
        .map((p) => p.trim()) ?? [];
    if (request.headers.get('Upgrade') !== 'websocket' || offered[0] !== PROTOCOL) return new Response('Expected a sync WebSocket', { status: 426 });
    if (!(await this.authorize(offered[1] ?? ''))) return new Response('Forbidden', { status: 403 });

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peer: crypto.getRandomValues(new Uint32Array(1))[0]! } satisfies Peer);

    const entries: { seq: number; snapshot: boolean; parts: ArrayBuffer[] }[] = [];
    for (const row of this.ctx.storage.sql.exec<{ seq: number; snapshot: number; data: ArrayBuffer }>('SELECT seq, snapshot, data FROM log ORDER BY seq, part')) {
      const last = entries.at(-1);
      if (last?.seq === row.seq) last.parts.push(row.data);
      else entries.push({ seq: row.seq, snapshot: !!row.snapshot, parts: [row.data] });
    }
    for (const e of entries) server.send(frame(e.snapshot ? T.snapshot : T.update, e.seq, join(e.parts)));
    server.send(frame(T.ready, entries.filter((e) => !e.snapshot).length));
    for (const other of this.ctx.getWebSockets()) {
      const { peer, presence } = other.deserializeAttachment() as Peer;
      if (other !== server && presence) server.send(frame(T.presence, peer, new Uint8Array(presence)));
    }
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': PROTOCOL } });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string') return ws.close(1003, 'Binary frames only');
    if (message.byteLength > MAX_FRAME) return ws.close(1009, 'Too large');
    const f = parse(message);
    if (!f) return ws.close(1002, 'Malformed frame');
    const kv = this.ctx.storage.kv;
    if (f.type === T.update) {
      const seq = (kv.get<number>('seq') ?? 0) + 1;
      this.ctx.storage.transactionSync(() => {
        this.store(seq, false, f.body);
        kv.put('seq', seq);
      });
      ws.send(frame(T.ack, seq));
      this.broadcast(frame(T.update, seq, f.body), ws);
    } else if (f.type === T.presence) {
      if (f.body.byteLength > MAX_PRESENCE) return ws.close(1009, 'Presence too large');
      const { peer } = ws.deserializeAttachment() as Peer;
      ws.serializeAttachment({ peer, presence: f.body.slice().buffer } satisfies Peer);
      this.broadcast(frame(T.presence, peer, f.body), ws);
    } else if (f.type === T.compact) {
      // A snapshot only moves forward and the updates after it stay, so two devices compacting at
      // once cannot lose anything: whichever lands second is either refused or covers more.
      const upTo = f.n;
      if (!Number.isInteger(upTo) || upTo <= (kv.get<number>('snapshot') ?? 0) || upTo > (kv.get<number>('seq') ?? 0)) return;
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec('DELETE FROM log WHERE seq <= ?', upTo);
        this.store(upTo, true, f.body);
        kv.put('snapshot', upTo);
      });
      this.broadcast(frame(T.compacted, upTo));
    } else ws.close(1002, 'Unknown frame');
  }

  webSocketClose(ws: WebSocket) {
    const { peer } = ws.deserializeAttachment() as Peer;
    this.broadcast(frame(T.leave, peer), ws);
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }

  private store(seq: number, snapshot: boolean, body: Uint8Array) {
    let part = 0;
    for (let at = 0; at === 0 || at < body.byteLength; at += CHUNK)
      this.ctx.storage.sql.exec('INSERT INTO log (seq, part, snapshot, data) VALUES (?, ?, ?, ?)', seq, part++, snapshot ? 1 : 0, body.slice(at, at + CHUNK).buffer);
  }

  private broadcast(data: Uint8Array, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        // A socket that is closing; it gets the whole log when it reconnects.
      }
    }
  }
}

function join(parts: ArrayBuffer[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), at);
    at += p.byteLength;
  }
  return out;
}

/** `/api/sync/<room>` is the room's WebSocket; `/api/sync/<room>/files/<doc>` holds each encrypted PDF. */
export async function handleSync(request: Request, env: Env): Promise<Response> {
  const match = route(new URL(request.url).pathname);
  if (!match) return new Response('Not found', { status: 404 });
  const [, roomId, docId] = match;
  const room = env.ROOMS.getByName(roomId!);
  if (!docId) return room.fetch(request);

  if (!(await room.authorize(request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''))) return new Response('Forbidden', { status: 403 });
  const key = `${roomId}/${docId}`;
  if (request.method === 'GET') {
    const file = await env.FILES.get(key);
    return file
      ? new Response(file.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size) } })
      : new Response('Not found', { status: 404 });
  }
  if (request.method === 'PUT') {
    const size = Number(request.headers.get('Content-Length'));
    if (!request.body || !Number.isSafeInteger(size) || size <= 0) return new Response('Length required', { status: 411 });
    if (size > MAX_FILE) return new Response('Too large', { status: 413 });
    // The stream fails if the body is longer or shorter than declared, so the limit holds.
    const { readable, writable } = new FixedLengthStream(size);
    await Promise.all([request.body.pipeTo(writable), env.FILES.put(key, readable)]);
    return new Response(null, { status: 204 });
  }
  if (request.method === 'DELETE') {
    await env.FILES.delete(key);
    return new Response(null, { status: 204 });
  }
  return new Response('Method not allowed', { status: 405 });
}
