import { RadionError } from "../errors.js";
import { isBrowser } from "./auth.js";

/**
 * Append `compress=zlib` to a WebSocket URL's query string, preserving any
 * existing query. Tells the server to send frames as zlib-compressed binary.
 */
export const buildCompressQueryUrl = (url: string): string => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}compress=zlib`;
};

const inflateInBrowser = async (data: Uint8Array): Promise<string> => {
  // Copy into a plain ArrayBuffer so the bytes satisfy `BlobPart`.
  const inflated = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return await new Response(inflated).text();
};

const inflateInNode = async (data: Uint8Array): Promise<string> => {
  const { inflateSync } = await import("node:zlib");
  return inflateSync(data).toString("utf-8");
};

/**
 * Inflate a zlib (RFC 1950, header included) frame into UTF-8 text.
 *
 * Uses the native `DecompressionStream` in a browser and `node:zlib` under
 * Node. The `node:zlib` import is lazy so it never enters a browser bundle.
 *
 * Throws a {@link RadionError} when the bytes are not valid zlib data, so the
 * caller can surface it instead of dropping the frame.
 */
export const inflateFrame = async (data: Uint8Array): Promise<string> => {
  try {
    return isBrowser()
      ? await inflateInBrowser(data)
      : await inflateInNode(data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RadionError(`failed to inflate compressed frame: ${reason}`);
  }
};
