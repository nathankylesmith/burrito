export interface WebsiteMenuItem {
  name: string;
  description?: string | null;
  price?: number | null;
  menu_section?: string | null;
  source?: string | null;
}

export interface StoredMenuItem extends WebsiteMenuItem {
  id?: string;
  data_version?: number | null;
  hidden?: boolean | null;
  source_checked_at?: string | Date | null;
  last_synced_at?: string | Date | null;
  change_reason?: string | null;
}

export interface UpsertMenuItem extends StoredMenuItem {
  data_version: number;
  hidden: boolean;
  change_reason: string | null;
  source_checked_at: string;
  last_synced_at: string;
}

export interface HideChange {
  id: string;
  change_reason: string;
  source_checked_at: string;
  last_synced_at: string;
}

export interface MenuDiffResult {
  upserts: UpsertMenuItem[];
  hides: HideChange[];
  summary: {
    added: number;
    updated: number;
    hidden: number;
    unchanged: number;
  };
}

export interface DiffOptions {
  source?: string | null;
  timestamp?: Date;
}

interface NormalizedMenuItem {
  key: string;
  record: StoredMenuItem;
}

function normalizeText(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeKey(item: WebsiteMenuItem | StoredMenuItem): string {
  const section = normalizeText(item.menu_section)?.toLowerCase() ?? '';
  const name = normalizeText(item.name)?.toLowerCase() ?? '';
  return `${section}|${name}`;
}

function normalizeIncoming(items: WebsiteMenuItem[]): NormalizedMenuItem[] {
  return items
    .map((item) => ({
      key: normalizeKey(item),
      record: {
        ...item,
        name: item.name.trim(),
        description: normalizeText(item.description),
        menu_section: normalizeText(item.menu_section),
        price: typeof item.price === 'number' ? item.price : null,
        source: item.source ?? null,
      },
    }))
    .filter((item) => Boolean(item.record.name));
}

function normalizeExisting(items: StoredMenuItem[]): Map<string, StoredMenuItem> {
  const map = new Map<string, StoredMenuItem>();
  for (const item of items) {
    const key = normalizeKey(item);
    if (!key) continue;
    map.set(key, {
      ...item,
      name: item.name.trim(),
      description: normalizeText(item.description),
      menu_section: normalizeText(item.menu_section),
      price: typeof item.price === 'number' ? item.price : null,
      source: item.source ?? null,
    });
  }
  return map;
}

function buildUpsert(
  base: StoredMenuItem,
  existing: StoredMenuItem | undefined,
  options: DiffOptions,
  reason: string,
  timestamp: string,
): UpsertMenuItem {
  const dataVersion = existing?.data_version ?? 0;
  const version = reason === 'updated_from_source' ? dataVersion + 1 : Math.max(dataVersion, 1);

  return {
    ...base,
    id: existing?.id,
    data_version: version,
    hidden: false,
    change_reason: reason,
    source: base.source ?? options.source ?? null,
    source_checked_at: timestamp,
    last_synced_at: timestamp,
  };
}

export function diffMenus(
  existingItems: StoredMenuItem[],
  websiteItems: WebsiteMenuItem[],
  options: DiffOptions = {},
): MenuDiffResult {
  const timestamp = (options.timestamp ?? new Date()).toISOString();
  const normalizedExisting = normalizeExisting(existingItems);
  const normalizedIncoming = normalizeIncoming(websiteItems);

  const upserts: UpsertMenuItem[] = [];
  const hides: HideChange[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  const seenKeys = new Set<string>();

  for (const incoming of normalizedIncoming) {
    const existing = normalizedExisting.get(incoming.key);
    seenKeys.add(incoming.key);

    if (!existing) {
      upserts.push(buildUpsert(incoming.record, undefined, options, 'new_item', timestamp));
      added += 1;
      continue;
    }

    const hasChanges =
      normalizeText(existing.description) !== normalizeText(incoming.record.description) ||
      normalizeText(existing.menu_section) !== normalizeText(incoming.record.menu_section) ||
      (existing.price ?? null) !== (incoming.record.price ?? null);

    if (hasChanges || existing.hidden) {
      upserts.push(buildUpsert(incoming.record, existing, options, 'updated_from_source', timestamp));
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  for (const [key, item] of normalizedExisting.entries()) {
    if (seenKeys.has(key)) continue;
    if (!item.id) continue;
    hides.push({
      id: item.id,
      change_reason: 'removed_from_source',
      source_checked_at: timestamp,
      last_synced_at: timestamp,
    });
  }

  return {
    upserts,
    hides,
    summary: {
      added,
      updated,
      hidden: hides.length,
      unchanged,
    },
  };
}

export function normalizeWebsiteMenu(menu: WebsiteMenuItem[]): WebsiteMenuItem[] {
  return normalizeIncoming(menu).map(({ record }) => record);
}
