import { randomUUID } from 'node:crypto';

/**
 * Calls this server's own REST API in-process (Fastify inject), signed in as
 * whoever `getToken` returns a token for. Using the real endpoints keeps every
 * permission check, validation and audit entry the app already has.
 */
export class InternalApi {
  constructor(
    private readonly fastify: any,
    private readonly host: string,
    // force = true asks for a fresh token after a 401
    private readonly getToken: (force: boolean) => Promise<string>,
  ) {}

  private async send(make: (token: string) => Promise<any>) {
    let res = await make(await this.getToken(false));
    if (res.statusCode === 401) res = await make(await this.getToken(true));
    return res;
  }

  call = async (path: string, body: Record<string, any> = {}) => {
    const res = await this.send((token) =>
      this.fastify.inject({
        method: 'POST',
        url: `/api${path}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          host: this.host,
        },
        payload: JSON.stringify(body),
      }),
    );

    let json: any = null;
    try {
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      /* not json */
    }

    if (res.statusCode >= 400) {
      const message = Array.isArray(json?.message) ? json.message.join('; ') : json?.message;
      throw new Error(message || `Request failed with status ${res.statusCode}`);
    }
    // the API wraps results as { data, success, status }
    return json && 'data' in json ? json.data : json;
  };

  /** Uploads a text file to a page the way the editor does (multipart to /files/upload). */
  upload = async (
    pageId: string,
    fileName: string,
    content: string,
    mime: string,
    attachmentId?: string,
  ) => {
    const boundary = `----internal${randomUUID()}`;
    const field = (name: string, value: string) =>
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    const payload = Buffer.concat([
      field('pageId', pageId),
      ...(attachmentId ? [field('attachmentId', attachmentId)] : []),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      Buffer.from(content, 'utf8'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await this.send((token) =>
      this.fastify.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
          host: this.host,
        },
        payload,
      }),
    );
    const json = res.body ? JSON.parse(res.body) : null;
    if (res.statusCode >= 400) throw new Error(json?.message || `Upload failed (${res.statusCode})`);
    return json && 'data' in json ? json.data : json;
  };

  download = async (src: string): Promise<string> => {
    const path = src.split('?')[0];
    const res = await this.send((token) =>
      this.fastify.inject({
        method: 'GET',
        url: path,
        headers: { authorization: `Bearer ${token}`, host: this.host },
      }),
    );
    if (res.statusCode >= 400) throw new Error(`Could not read the stored file (${res.statusCode})`);
    return res.body;
  };
}
