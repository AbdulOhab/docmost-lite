import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 2000;
// the public Excalidraw library catalogue; nothing else is fetched server side
const ALLOWED_URL =
  /^https:\/\/libraries\.excalidraw\.com\/libraries\/[A-Za-z0-9._\-/]+\.excalidrawlib$/;

type LibraryItem = {
  id: string;
  status: 'published' | 'unpublished';
  elements: any[];
  created: number;
  name?: string;
};

/** Accepts both library file versions and returns v2 items. */
export function normaliseLibrary(file: any): LibraryItem[] {
  if (!file || typeof file !== 'object') {
    throw new BadRequestException('Not an Excalidraw library file');
  }

  let items: LibraryItem[];
  if (Array.isArray(file.libraryItems)) {
    // v2 items, or v1-style arrays of elements
    items = file.libraryItems.map((item: any) =>
      Array.isArray(item)
        ? toItem(item)
        : toItem(item?.elements, item?.name, item?.id),
    );
  } else if (Array.isArray(file.library)) {
    // v1: an array of arrays of elements
    items = file.library.map((elements: any) => toItem(elements));
  } else {
    throw new BadRequestException('No library items found in this file');
  }

  items = items.filter((i) => i.elements.length > 0);
  if (items.length === 0) {
    throw new BadRequestException('The library is empty');
  }
  if (items.length > MAX_ITEMS) {
    throw new BadRequestException(`A library can hold at most ${MAX_ITEMS} items`);
  }
  return items;
}

function toItem(elements: any, name?: string, id?: string): LibraryItem {
  const list = Array.isArray(elements) ? elements.filter((e) => e && typeof e === 'object' && typeof e.type === 'string') : [];
  return {
    id: typeof id === 'string' && id ? id : randomUUID(),
    status: 'published',
    elements: list,
    created: Date.now(),
    ...(typeof name === 'string' && name ? { name } : {}),
  };
}

const CATALOG_URL = 'https://libraries.excalidraw.com/libraries.json';
const CATALOG_TTL = 60 * 60 * 1000;

export type CatalogEntry = {
  name: string;
  description: string;
  author: string;
  source: string;
};

@Injectable()
export class DiagramLibraryService {
  private catalog: { at: number; entries: CatalogEntry[] } | null = null;

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private get db_(): any {
    return this.db as any;
  }

  /** The public Excalidraw library catalogue, cached for an hour. */
  async getCatalog(): Promise<CatalogEntry[]> {
    if (this.catalog && Date.now() - this.catalog.at < CATALOG_TTL) {
      return this.catalog.entries;
    }
    try {
      const res = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: any[] = await res.json();
      const entries = raw
        .filter((e) => typeof e?.source === 'string' && /^[A-Za-z0-9._\-/]+\.excalidrawlib$/.test(e.source))
        .map((e) => ({
          name: String(e.name ?? e.source),
          description: String(e.description ?? ''),
          author: String(e.authors?.[0]?.name ?? ''),
          source: e.source as string,
        }));
      this.catalog = { at: Date.now(), entries };
      return entries;
    } catch (err) {
      if (this.catalog) return this.catalog.entries;
      throw new BadRequestException(`Could not load the library catalogue: ${err?.['message'] ?? err}`);
    }
  }

  list(workspaceId: string) {
    return this.db_
      .selectFrom('diagramLibraries')
      .select(['id', 'name', 'source', 'itemCount', 'enabled', 'createdAt'])
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  /** Items of every enabled library, ready for Excalidraw's updateLibrary. */
  async enabledItems(workspaceId: string): Promise<LibraryItem[]> {
    const rows = await this.db_
      .selectFrom('diagramLibraries')
      .select('items')
      .where('workspaceId', '=', workspaceId)
      .where('enabled', '=', true)
      .execute();
    return rows.flatMap((r: any) => (r.items?.items ?? []) as LibraryItem[]);
  }

  async create(
    workspaceId: string,
    userId: string,
    name: string,
    file: any,
    source: string | null,
  ) {
    const items = normaliseLibrary(file);
    return this.db_
      .insertInto('diagramLibraries')
      .values({
        workspaceId,
        name,
        source,
        // stored as { items } because the driver turns a bare array into a pg array
        items: { items },
        itemCount: items.length,
        createdById: userId,
      })
      .returning(['id', 'name', 'source', 'itemCount', 'enabled', 'createdAt'])
      .executeTakeFirstOrThrow();
  }

  async install(workspaceId: string, userId: string, url: string, name?: string) {
    if (!ALLOWED_URL.test(url) || url.includes('..')) {
      throw new BadRequestException(
        'Only libraries.excalidraw.com library files can be installed from a URL',
      );
    }
    let text: string;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > MAX_BYTES) throw new Error('file is too large');
      text = await res.text();
      if (text.length > MAX_BYTES) throw new Error('file is too large');
    } catch (err) {
      throw new BadRequestException(`Could not download the library: ${err?.['message'] ?? err}`);
    }

    let file: any;
    try {
      file = JSON.parse(text);
    } catch {
      throw new BadRequestException('The downloaded file is not valid JSON');
    }
    const fallback = decodeURIComponent(url.split('/').pop() ?? 'library').replace(/\.excalidrawlib$/, '');
    return this.create(workspaceId, userId, name?.trim() || fallback, file, url);
  }

  async setEnabled(workspaceId: string, id: string, enabled: boolean) {
    const res = await this.db_
      .updateTable('diagramLibraries')
      .set({ enabled })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return Number(res.numUpdatedRows) > 0;
  }

  async remove(workspaceId: string, id: string) {
    const res = await this.db_
      .deleteFrom('diagramLibraries')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return Number(res.numDeletedRows) > 0;
  }
}
