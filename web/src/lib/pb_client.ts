import PocketBase from 'pocketbase';
import { browser } from '$app/environment';
import type { StockRequestRecord } from './types';

export const COLLECTIONS = {
	requests: 'requests',
	bars: 'bars',
	users: 'users'
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

/** Pending, accepted, and done requests (storage hub list including history). */
export function storageOpenRequestsFilter(): string {
	return pb().filter('(status = {:p} || status = {:a} || status = {:d})', {
		p: 'pending',
		a: 'accepted',
		d: 'done'
	});
}

/** Requests for one bar (bar dashboard list). Use relation id match for PocketBase compatibility. */
export function barRequestsFilter(barId: string): string {
	return pb().filter('bar.id ?= {:b}', { b: barId });
}
