import { Agent, fetch as undiciFetch } from 'undici';

export const REQUEST_TIMEOUT_MS = 90_000;

// Node's default tries each address for only 250ms, which fails on slow or lossy
// routes to the AI host. Be patient when connecting, and retry when the link drops.
const agent = new Agent({
  connect: { timeout: 20_000, autoSelectFamilyAttemptTimeout: 5_000 },
  headersTimeout: REQUEST_TIMEOUT_MS,
  bodyTimeout: REQUEST_TIMEOUT_MS,
});
const RETRYABLE = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ECONNREFUSED',
]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const patientFetch = (async (url: any, init: any) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await undiciFetch(url, { ...init, dispatcher: agent });
      if ([502, 503, 504].includes(res.status) && attempt < 3) {
        await wait(800 * attempt);
        continue;
      }
      return res as unknown as Response;
    } catch (err: any) {
      if (init?.signal?.aborted) throw err;
      const code = err?.cause?.code ?? err?.code;
      if (RETRYABLE.has(code) && attempt < 3) {
        await wait(800 * attempt);
        continue;
      }
      throw new Error(
        RETRYABLE.has(code)
          ? `Could not reach the AI service (${code}). Your connection to it is unreliable; try again.`
          : `Could not call the AI service: ${err?.message ?? err}`,
      );
    }
  }
}) as typeof fetch;
