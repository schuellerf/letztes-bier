import PocketBase from 'pocketbase';
import { browser } from '$app/environment';
import type { RecordModel } from 'pocketbase';
import type { StockRequestRecord } from './types';

export const COLLECTIONS = {
	requests: 'requests',
	bars: 'bars',
	storages: 'storages',
	users: 'users',
	auth_signals: 'auth_signals'
} as const;

let client: PocketBase | null = null;

export function getPbUrl(): string {
	const u = import.meta.env.PUBLIC_POCKETBASE_URL;
	if (!u && browser) {
		return `${window.location.protocol}//${window.location.host}`;
	}
	return u || '';
}

export function pb(): PocketBase {
	if (!browser) {
		throw new Error('PocketBase client is browser-only in this app');
	}
	if (!client) {
		client = new PocketBase(getPbUrl());
	}
	return client;
}

/** Ordered pending first (oldest first), then accepted (oldest first). */
export function sortRequestsForStorage(list: StockRequestRecord[]): StockRequestRecord[] {
	const pending = list.filter((r) => r.status === 'pending').sort(byRequestedAtAsc);
	const accepted = list.filter((r) => r.status === 'accepted').sort(byAcceptedAsc);
	const rest = list.filter((r) => r.status === 'done');
	return [...pending, ...accepted, ...rest];
}

function byRequestedAtAsc(a: StockRequestRecord, b: StockRequestRecord) {
	return (a.requested_at || '').localeCompare(b.requested_at || '');
}

function byAcceptedAsc(a: StockRequestRecord, b: StockRequestRecord) {
	const ac = a.accepted_at || a.requested_at || '';
	const bc = b.accepted_at || b.requested_at || '';
	return ac.localeCompare(bc);
}

export function nowIso(): string {
	return new Date().toISOString();
}

/** Pending, accepted, and done requests for one hub (storage hub list including history). */
export function storageOpenRequestsFilter(storageId: string): string {
	return pb().filter(
		'(status = {:p} || status = {:a} || status = {:d}) && storage.id ?= {:sid}',
		{
			p: 'pending',
			a: 'accepted',
			d: 'done',
			sid: storageId
		}
	);
}

/** Hub with lowest `hub_order` (then `id`); custom bar items route here. */
export function defaultStorageId(storages: RecordModel[]): string | null {
	if (storages.length === 0) return null;
	const sorted = [...storages].sort((a, b) => {
		const ha = a as { hub_order?: number };
		const hb = b as { hub_order?: number };
		const sa = typeof ha.hub_order === 'number' ? ha.hub_order : Number(ha.hub_order) || 0;
		const sb = typeof hb.hub_order === 'number' ? hb.hub_order : Number(hb.hub_order) || 0;
		if (sa !== sb) return sa - sb;
		return a.id.localeCompare(b.id);
	});
	return sorted[0]?.id ?? null;
}

/** Requests for one bar (bar dashboard list). Use relation id match for PocketBase compatibility. */
export function barRequestsFilter(barId: string): string {
	return pb().filter('bar.id ?= {:b}', { b: barId });
}
