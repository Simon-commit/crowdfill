/** Typed request/response helper for talking to the service worker. */
import type { Reply, ReplyMap, Request } from '../shared/messages';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function send<T extends Request>(msg: T): Promise<ReplyMap[T['type']]> {
  const reply = (await chrome.runtime.sendMessage(msg)) as Reply<ReplyMap[T['type']]> | undefined;
  if (!reply) throw new ApiError('No response from the extension background. Try reloading the extension.');
  if (!reply.ok) throw new ApiError(reply.error, reply.code);
  return reply.data;
}

export async function getLocal<T>(key: string): Promise<T | undefined> {
  return (await chrome.storage.local.get(key))[key] as T | undefined;
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'form';
}
