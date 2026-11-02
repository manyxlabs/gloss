import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

/** Placeholder: built by the sync work. */
export class Room extends DurableObject<Env> {}

export async function handleSync(_request: Request, _env: Env): Promise<Response> {
  return new Response('Not implemented', { status: 501 });
}
