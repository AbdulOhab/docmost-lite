import { Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { EnvironmentService } from '../integrations/environment/environment.service';
import { SessionService } from '../core/session/session.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { McpScope, McpToken } from './mcp.constants';
import { registerTools } from './mcp-tools';
import { randomUUID } from 'node:crypto';
import { McpTokenService } from './mcp-token.service';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private accessToken: string | null = null;

  constructor(
    private readonly env: EnvironmentService,
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly sessionService: SessionService,
    private readonly userRepo: UserRepo,
    private readonly tokenService: McpTokenService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  /** On when a token exists in .env or was created in Settings. */
  async isEnabled(): Promise<boolean> {
    if (this.env.getMcpTokens().length > 0) return true;
    return (await this.tokenService.anyActive()) === true;
  }

  private async authenticate(
    req: FastifyRequest,
  ): Promise<{ scopes: Set<McpScope> } | null> {
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!presented) return null;

    let match: McpToken | null = null;
    // compare against every token so timing does not reveal which one matched
    for (const candidate of this.env.getMcpTokens()) {
      if (safeEqual(candidate.token, presented)) match = candidate;
    }
    if (match) return { scopes: match.scopes };

    const scopes = await this.tokenService.findByToken(presented);
    return scopes ? { scopes } : null;
  }

  /** The tools act as the workspace owner, through the normal REST API. */
  private async sessionToken(force = false): Promise<string> {
    if (this.accessToken && !force) return this.accessToken;

    const owner = await this.db
      .selectFrom('users')
      .selectAll()
      .where('role', '=', 'owner')
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .executeTakeFirst();
    if (!owner) throw new Error('No owner account exists yet');

    this.accessToken = await this.sessionService.createSessionAndToken(owner as any);
    return this.accessToken;
  }

  private async callApi(path: string, body: Record<string, any> = {}) {
    const fastify: any = this.httpAdapterHost.httpAdapter.getInstance();
    const host = new URL(this.env.getAppUrl()).host;

    const send = async (token: string) =>
      fastify.inject({
        method: 'POST',
        url: `/api${path}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          host,
        },
        payload: JSON.stringify(body),
      });

    let res = await send(await this.sessionToken());
    if (res.statusCode === 401) res = await send(await this.sessionToken(true));

    let json: any = null;
    try {
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      /* not json */
    }

    if (res.statusCode >= 400) {
      const message = Array.isArray(json?.message)
        ? json.message.join('; ')
        : json?.message;
      throw new Error(message || `Request failed with status ${res.statusCode}`);
    }
    // the API wraps results as { data, success, status }
    return json && 'data' in json ? json.data : json;
  }

  /** Uploads a text file to a page the way the editor does (multipart to /files/upload). */
  private async uploadFile(
    pageId: string,
    fileName: string,
    content: string,
    mime: string,
    attachmentId?: string,
  ) {
    const fastify: any = this.httpAdapterHost.httpAdapter.getInstance();
    const host = new URL(this.env.getAppUrl()).host;
    const boundary = `----mcp${randomUUID()}`;
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

    const send = async (token: string) =>
      fastify.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
          host,
        },
        payload,
      });

    let res = await send(await this.sessionToken());
    if (res.statusCode === 401) res = await send(await this.sessionToken(true));
    const json = res.body ? JSON.parse(res.body) : null;
    if (res.statusCode >= 400) throw new Error(json?.message || `Upload failed (${res.statusCode})`);
    return json && 'data' in json ? json.data : json;
  }

  private async downloadFile(src: string): Promise<string> {
    const fastify: any = this.httpAdapterHost.httpAdapter.getInstance();
    const host = new URL(this.env.getAppUrl()).host;
    const path = src.split('?')[0];
    const get = async (token: string) =>
      fastify.inject({ method: 'GET', url: path, headers: { authorization: `Bearer ${token}`, host } });

    let res = await get(await this.sessionToken());
    if (res.statusCode === 401) res = await get(await this.sessionToken(true));
    if (res.statusCode >= 400) throw new Error(`Could not read the stored file (${res.statusCode})`);
    return res.body;
  }

  async handle(req: FastifyRequest, reply: FastifyReply) {
    const token = await this.authenticate(req);
    if (!token) {
      return reply
        .status(401)
        .header('www-authenticate', 'Bearer')
        .send({ error: 'unauthorized' });
    }

    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'docmost-lite', version: '1.0.0' });
        registerTools(server, (p, b) => this.callApi(p, b), token.scopes, {
          upload: (...a) => this.uploadFile(...a),
          download: (src) => this.downloadFile(src),
        });
        return server;
      },
      { responseMode: 'json', onerror: (e) => this.logger.warn(e.message) },
    );

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
    });

    const response = await handler.fetch(request, {
      parsedBody: req.body,
      authInfo: {
        token: 'redacted',
        clientId: 'docmost-mcp',
        scopes: [...token.scopes],
      },
    });

    response.headers.forEach((value, key) => reply.header(key, value));
    return reply
      .status(response.status)
      .send(Buffer.from(await response.arrayBuffer()));
  }
}
