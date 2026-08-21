import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { diffMenus, normalizeWebsiteMenu, StoredMenuItem, WebsiteMenuItem } from '@dishswipe/core';

export interface MenuProvider {
  fetchMenu(restaurant: RestaurantRecord): Promise<WebsiteMenuItem[]>;
}

export interface MenuSyncJobOptions {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  staleAfterHours?: number;
  menuProvider?: MenuProvider;
}

export interface RestaurantRecord {
  id: string;
  name: string;
  menu_url?: string | null;
  menu_source?: string | null;
  menu_last_sync_at?: string | null;
  menu_hidden?: boolean | null;
}

export interface MenuSyncSummary {
  restaurantId: string;
  restaurantName: string;
  added: number;
  updated: number;
  hidden: number;
  unchanged: number;
  menuUrl?: string | null;
  source?: string | null;
}

class HttpMenuProvider implements MenuProvider {
  async fetchMenu(restaurant: RestaurantRecord): Promise<WebsiteMenuItem[]> {
    if (!restaurant.menu_url) {
      return [];
    }

    try {
      const response = await fetch(restaurant.menu_url);
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        const json = (await response.json()) as WebsiteMenuItem[];
        return normalizeWebsiteMenu(json);
      }

      const text = await response.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      return normalizeWebsiteMenu(
        lines.map((line) => ({
          name: line,
          description: null,
          price: null,
          menu_section: null,
          source: restaurant.menu_url ?? restaurant.menu_source ?? null,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Failed to fetch menu, returning empty list', {
        menuUrl: restaurant.menu_url,
        error: message,
      });
      return [];
    }
  }
}

export class MenuSyncJob {
  private readonly supabase: SupabaseClient;
  private readonly staleAfterMs: number;
  private readonly provider: MenuProvider;

  constructor(options: MenuSyncJobOptions = {}) {
    const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
    const serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to run menu sync');
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey);
    this.staleAfterMs = (options.staleAfterHours ?? 12) * 60 * 60 * 1000;
    this.provider = options.menuProvider ?? new HttpMenuProvider();
  }

  private isStale(restaurant: RestaurantRecord): boolean {
    if (!restaurant.menu_last_sync_at) return true;
    const lastSync = new Date(restaurant.menu_last_sync_at).getTime();
    return Number.isNaN(lastSync) || Date.now() - lastSync > this.staleAfterMs;
  }

  private async fetchTrackedRestaurants(): Promise<RestaurantRecord[]> {
    const staleSince = new Date(Date.now() - this.staleAfterMs).toISOString();
    const { data, error } = await this.supabase
      .from('restaurants')
      .select('id, name, menu_url, menu_source, menu_last_sync_at, menu_hidden')
      .or(`menu_last_sync_at.is.null,menu_last_sync_at.lt.${staleSince}`)
      .or('menu_hidden.eq.false,menu_hidden.is.null');

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  private async fetchExistingMenuItems(restaurantId: string): Promise<StoredMenuItem[]> {
    const { data, error } = await this.supabase
      .from('dishes')
      .select(
        'id, name, description, price, menu_section, data_version, hidden, source, source_checked_at, last_sync_at, change_reason',
      )
      .eq('restaurant_id', restaurantId);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async syncRestaurant(restaurantId: string): Promise<MenuSyncSummary> {
    const { data: restaurant, error: fetchError } = await this.supabase
      .from('restaurants')
      .select('id, name, menu_url, menu_source, menu_last_sync_at, menu_hidden')
      .eq('id', restaurantId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const menuItems = await this.provider.fetchMenu(restaurant);
    const existing = await this.fetchExistingMenuItems(restaurant.id);

    const diff = diffMenus(existing, menuItems, {
      source: restaurant.menu_source ?? restaurant.menu_url ?? 'website',
    });

    if (diff.upserts.length > 0) {
      const upsertPayload = diff.upserts.map((item) => ({
        id: item.id,
        restaurant_id: restaurant.id,
        name: item.name,
        description: item.description,
        price: item.price,
        menu_section: item.menu_section,
        data_version: item.data_version,
        hidden: item.hidden,
        change_reason: item.change_reason,
        source: item.source,
        source_checked_at: item.source_checked_at,
        last_sync_at: item.last_synced_at,
        captured_at: item.last_synced_at,
      }));

      const { error: upsertError } = await this.supabase
        .from('dishes')
        .upsert(upsertPayload, { onConflict: 'restaurant_id,name' });

      if (upsertError) {
        throw upsertError;
      }
    }

    if (diff.hides.length > 0) {
      const { error: hideError } = await this.supabase
        .from('dishes')
        .update({
          hidden: true,
          change_reason: 'removed_from_source',
          source_checked_at: diff.hides[0].source_checked_at,
          last_sync_at: diff.hides[0].last_synced_at,
        })
        .in('id', diff.hides.map((item) => item.id));

      if (hideError) {
        throw hideError;
      }
    }

    const now = new Date().toISOString();
    const { error: restaurantUpdateError } = await this.supabase
      .from('restaurants')
      .update({
        menu_last_sync_at: now,
        menu_source: restaurant.menu_source ?? restaurant.menu_url ?? 'website',
        menu_change_reason: 'synced',
      })
      .eq('id', restaurant.id);

    if (restaurantUpdateError) {
      throw restaurantUpdateError;
    }

    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      added: diff.summary.added,
      updated: diff.summary.updated,
      hidden: diff.summary.hidden,
      unchanged: diff.summary.unchanged,
      menuUrl: restaurant.menu_url,
      source: restaurant.menu_source ?? restaurant.menu_url ?? 'website',
    };
  }

  async run(): Promise<MenuSyncSummary[]> {
    const restaurants = await this.fetchTrackedRestaurants();
    const results: MenuSyncSummary[] = [];

    for (const restaurant of restaurants) {
      if (!this.isStale(restaurant)) continue;
      const summary = await this.syncRestaurant(restaurant.id);
      results.push(summary);
    }

    return results;
  }
}
