import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { MCP_SCOPES, McpScope } from './mcp.constants';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export type McpTokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: McpScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
};

@Injectable()
export class McpTokenService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  // tokens created in the UI; the table is not part of the generated db types
  private get table() {
    return (this.db as any).selectFrom('mcpTokens');
  }

  async anyActive(): Promise<boolean> {
    const row = await this.table
      .select('id')
      .where('revokedAt', 'is', null)
      .limit(1)
      .executeTakeFirst();
    return !!row;
  }

  async list(workspaceId: string): Promise<McpTokenRow[]> {
    return this.table
      .select(['id', 'name', 'tokenPrefix', 'scopes', 'createdAt', 'lastUsedAt'])
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  /** Returns the plain token once; it cannot be read back later. */
  async create(
    workspaceId: string,
    userId: string,
    name: string,
    scopes: McpScope[],
  ): Promise<{ token: string; row: McpTokenRow }> {
    const token = `dmcp_${randomBytes(32).toString('hex')}`;
    const row = await (this.db as any)
      .insertInto('mcpTokens')
      .values({
        workspaceId,
        name,
        tokenHash: hash(token),
        tokenPrefix: token.slice(0, 12),
        scopes: [...new Set(scopes)].filter((s) =>
          (MCP_SCOPES as readonly string[]).includes(s),
        ),
        createdById: userId,
      })
      .returning(['id', 'name', 'tokenPrefix', 'scopes', 'createdAt', 'lastUsedAt'])
      .executeTakeFirstOrThrow();
    return { token, row };
  }

  async revoke(workspaceId: string, id: string): Promise<boolean> {
    const res = await (this.db as any)
      .updateTable('mcpTokens')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    return Number(res.numUpdatedRows) > 0;
  }

  async findByToken(token: string): Promise<Set<McpScope> | null> {
    const row = await this.table
      .select(['id', 'scopes', 'lastUsedAt'])
      .where('tokenHash', '=', hash(token))
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;

    // record use, at most once a minute
    if (!row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > 60_000) {
      (this.db as any)
        .updateTable('mcpTokens')
        .set({ lastUsedAt: new Date() })
        .where('id', '=', row.id)
        .execute()
        .catch(() => {});
    }
    return new Set(row.scopes as McpScope[]);
  }
}
