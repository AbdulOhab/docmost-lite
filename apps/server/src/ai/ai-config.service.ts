import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EnvironmentService } from '../integrations/environment/environment.service';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../integrations/encryption/encryption.service';
import { patientFetch } from './patient-fetch';

export const ENV_PROVIDER_ID = 'env';

export type ModelEntry = { id: string; label?: string };

export type AiSettings = {
  defaultModel?: string; // "<providerId>::<model>"
  instructions: string;
  temperature: number;
  maxSteps: number;
};

export const DEFAULT_SETTINGS: AiSettings = {
  instructions: '',
  temperature: 0.3,
  maxSteps: 8,
};

export type ResolvedModel = {
  ref: string;
  modelId: string;
  providerName: string;
  baseUrl: string;
  apiKey?: string;
};

const refOf = (providerId: string, modelId: string) => `${providerId}::${modelId}`;

/** http(s) only; the address is entered by an admin and called with their key. */
export function cleanBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('The base URL is not a valid address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('The base URL must start with http:// or https://');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Put the API key in the key field, not in the URL');
  }
  return url.toString().replace(/\/+$/, '');
}

@Injectable()
export class AiConfigService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly env: EnvironmentService,
    private readonly encryption: EncryptionService,
  ) {}

  private get q(): any {
    return this.db as any;
  }

  private envProvider() {
    const { apiKey, baseUrl, models } = this.env.getAiConfig();
    if (!apiKey || !models.length) return null;
    return {
      id: ENV_PROVIDER_ID,
      name: 'From .env',
      baseUrl,
      apiKey,
      models: models.map((id) => ({ id })) as ModelEntry[],
      enabled: true,
      source: 'env' as const,
    };
  }

  private async rows(workspaceId: string) {
    return this.q
      .selectFrom('aiProviders')
      .select(['id', 'name', 'baseUrl', 'apiKey', 'models', 'enabled', 'createdAt'])
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  private decrypt(stored: string | null): string | undefined {
    if (!stored) return undefined;
    try {
      return this.encryption.decrypt(stored, EncryptionPurpose.AI_API_KEYS);
    } catch {
      return undefined; // e.g. APP_SECRET changed: the key must be entered again
    }
  }

  /** Providers for the settings page. Keys are never returned, only the last 4 characters. */
  async providersForAdmin(workspaceId: string) {
    const list: any[] = (await this.rows(workspaceId)).map((r: any) => {
      const key = this.decrypt(r.apiKey);
      return {
        id: r.id,
        name: r.name,
        baseUrl: r.baseUrl,
        models: r.models?.models ?? [],
        enabled: r.enabled,
        source: 'db',
        hasKey: !!r.apiKey,
        keyUnreadable: !!r.apiKey && !key,
        keyHint: key ? `…${key.slice(-4)}` : null,
      };
    });
    const env = this.envProvider();
    if (env) {
      list.unshift({
        id: env.id,
        name: env.name,
        baseUrl: env.baseUrl,
        models: env.models,
        enabled: true,
        source: 'env',
        hasKey: true,
        keyUnreadable: false,
        keyHint: `…${env.apiKey.slice(-4)}`,
      });
    }
    return list;
  }

  /** Every model a user can pick, from enabled providers. */
  async availableModels(workspaceId: string) {
    const providers = await this.providersForAdminLite(workspaceId);
    return providers.flatMap((p) =>
      p.models.map((m: ModelEntry) => ({
        ref: refOf(p.id, m.id),
        label: m.label || m.id,
        provider: p.name,
      })),
    );
  }

  private async providersForAdminLite(workspaceId: string) {
    const rows: any[] = (await this.rows(workspaceId))
      .filter((r: any) => r.enabled)
      .map((r: any) => ({ id: r.id, name: r.name, models: r.models?.models ?? [] }));
    const env = this.envProvider();
    if (env) rows.unshift({ id: env.id, name: env.name, models: env.models });
    return rows;
  }

  async getSettings(workspaceId: string): Promise<AiSettings> {
    const row = await this.q
      .selectFrom('aiSettings')
      .select('data')
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return { ...DEFAULT_SETTINGS, ...(row?.data ?? {}) };
  }

  async saveSettings(workspaceId: string, input: Partial<AiSettings>) {
    const data: AiSettings = {
      defaultModel: input.defaultModel || undefined,
      instructions: (input.instructions ?? '').slice(0, 4000),
      temperature: Math.min(2, Math.max(0, Number(input.temperature ?? DEFAULT_SETTINGS.temperature))),
      maxSteps: Math.min(15, Math.max(1, Math.round(Number(input.maxSteps ?? DEFAULT_SETTINGS.maxSteps)))),
    };
    await this.q
      .insertInto('aiSettings')
      .values({ workspaceId, data, updatedAt: new Date() })
      .onConflict((oc: any) => oc.column('workspaceId').doUpdateSet({ data, updatedAt: new Date() }))
      .execute();
    return data;
  }

  async saveProvider(
    workspaceId: string,
    input: { id?: string; name: string; baseUrl: string; apiKey?: string; models: ModelEntry[]; enabled?: boolean },
  ) {
    const baseUrl = cleanBaseUrl(input.baseUrl);
    const models = this.cleanModels(input.models);
    const values: Record<string, any> = {
      name: input.name.trim(),
      baseUrl,
      models: { models },
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    };
    // a blank key on edit keeps the stored one
    if (input.apiKey) {
      values.apiKey = this.encryption.encrypt(input.apiKey.trim(), EncryptionPurpose.AI_API_KEYS);
    }

    if (input.id) {
      const res = await this.q
        .updateTable('aiProviders')
        .set(values)
        .where('id', '=', input.id)
        .where('workspaceId', '=', workspaceId)
        .executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw new BadRequestException('Provider not found');
      return input.id;
    }
    const row = await this.q
      .insertInto('aiProviders')
      .values({ workspaceId, ...values })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id as string;
  }

  private cleanModels(models: ModelEntry[]): ModelEntry[] {
    const seen = new Set<string>();
    const out: ModelEntry[] = [];
    for (const m of models ?? []) {
      const id = String(m?.id ?? '').trim();
      if (!id || seen.has(id) || id.includes('::')) continue;
      seen.add(id);
      out.push({ id, ...(m.label?.trim() ? { label: m.label.trim().slice(0, 60) } : {}) });
    }
    if (!out.length) throw new BadRequestException('Add at least one model name');
    return out.slice(0, 50);
  }

  async setEnabled(workspaceId: string, id: string, enabled: boolean) {
    await this.q
      .updateTable('aiProviders')
      .set({ enabled })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async deleteProvider(workspaceId: string, id: string) {
    await this.q
      .deleteFrom('aiProviders')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  /** The provider and model a chat request asked for, or the default, or the first one. */
  async resolve(workspaceId: string, requested?: string): Promise<ResolvedModel | null> {
    const [available, settings] = await Promise.all([
      this.availableModels(workspaceId),
      this.getSettings(workspaceId),
    ]);
    const ref =
      [requested, settings.defaultModel].find((r) => r && available.some((m) => m.ref === r)) ??
      available[0]?.ref;
    if (!ref) return null;

    const [providerId, ...rest] = ref.split('::');
    const modelId = rest.join('::');
    if (providerId === ENV_PROVIDER_ID) {
      const env = this.envProvider();
      return env && { ref, modelId, providerName: env.name, baseUrl: env.baseUrl, apiKey: env.apiKey };
    }
    const row = (await this.rows(workspaceId)).find((r: any) => r.id === providerId && r.enabled);
    if (!row) return null;
    return { ref, modelId, providerName: row.name, baseUrl: row.baseUrl, apiKey: this.decrypt(row.apiKey) };
  }

  /** Credentials for the test and model-list calls: typed in the form, or the stored ones. */
  private async credentials(
    workspaceId: string,
    input: { id?: string; baseUrl?: string; apiKey?: string },
  ): Promise<{ baseUrl: string; apiKey?: string }> {
    let apiKey = input.apiKey?.trim() || undefined;
    let baseUrl = input.baseUrl;
    if (input.id && (!apiKey || !baseUrl)) {
      if (input.id === ENV_PROVIDER_ID) {
        const env = this.envProvider();
        if (env) {
          apiKey ??= env.apiKey;
          baseUrl ??= env.baseUrl;
        }
      } else {
        const row = (await this.rows(workspaceId)).find((r: any) => r.id === input.id);
        if (row) {
          apiKey ??= this.decrypt(row.apiKey);
          baseUrl ??= row.baseUrl;
        }
      }
    }
    if (!baseUrl) throw new BadRequestException('Enter the base URL');
    return { baseUrl: cleanBaseUrl(baseUrl), apiKey };
  }

  async testConnection(
    workspaceId: string,
    input: { id?: string; baseUrl?: string; apiKey?: string; model: string },
  ) {
    const { baseUrl, apiKey } = await this.credentials(workspaceId, input);
    const started = Date.now();
    try {
      const res = await patientFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: input.model,
          messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
          max_tokens: 16,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* reported below */
      }
      const ms = Date.now() - started;
      if (!res.ok) {
        return { ok: false, ms, error: json?.error?.message || json?.msg || `HTTP ${res.status}` };
      }
      const reply = json?.choices?.[0]?.message?.content;
      return { ok: true, ms, reply: typeof reply === 'string' ? reply.slice(0, 80) : '' };
    } catch (err: any) {
      return { ok: false, ms: Date.now() - started, error: err?.message ?? String(err) };
    }
  }

  /** Asks the provider for its model names (GET /models), so they need not be typed. */
  async fetchModels(workspaceId: string, input: { id?: string; baseUrl?: string; apiKey?: string }) {
    const { baseUrl, apiKey } = await this.credentials(workspaceId, input);
    try {
      const res = await patientFetch(`${baseUrl}/models`, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { ok: false, error: `The provider answered HTTP ${res.status}`, models: [] };
      const json: any = await res.json();
      const list: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      const models = list
        .map((m) => (typeof m === 'string' ? m : m?.id))
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 200);
      return { ok: true, models };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), models: [] };
    }
  }
}
