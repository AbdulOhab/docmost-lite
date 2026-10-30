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
import { McpTokenService } from './mcp-token.service';
import { InternalApi } from './internal-api';

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

  private internalApi() {
    return new InternalApi(
      this.httpAdapterHost.httpAdapter.getInstance(),
      new URL(this.env.getAppUrl()).host,
      (force) => this.sessionToken(force),
    );
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
        const api = this.internalApi();
        registerTools(server, api.call, token.scopes, {
          upload: api.upload,
          download: api.download,
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
