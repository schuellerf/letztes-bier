import { ClientResponseError } from 'pocketbase';

/** PocketBase default when it won't expose the real parsing/rule error to the client. */
const PB_OPAQUE_MESSAGE = /^something went wrong while processing your request\.?$/i;

function isOpaquePbMessage(msg: string | undefined | null): boolean {
	if (!msg || !msg.trim()) return true;
	return PB_OPAQUE_MESSAGE.test(msg.trim());
}

/** Decode sort/filter from failed request URL for operators (never the opaque PB line alone). */
function apiQueryHints(url: string): string | null {
	try {
		const u = new URL(url, 'http://local');
		const sort = u.searchParams.get('sort');
		const filter = u.searchParams.get('filter');
		const bits: string[] = [];
		if (sort) bits.push(`sort=${sort}`);
		if (filter) bits.push(`filter=${filter}`);
		return bits.length > 0 ? bits.join('; ') : null;
	} catch {
		return null;
	}
}

function shortenPath(url: string, max = 120): string {
	if (!url) return '';
	try {
		const u = new URL(url, 'http://local');
		const s = u.pathname;
		return s.length > max ? `${s.slice(0, max)}…` : s;
	} catch {
		return url.length > max ? `${url.slice(0, max)}…` : url;
	}
}

function summarizeResponseData(data: Record<string, unknown> | null | undefined): string | null {
	if (!data || typeof data !== 'object') return null;
	const inner = data.data;
	if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
		const entries = Object.entries(inner as Record<string, { message?: string; code?: string }>);
		if (entries.length > 0) {
			return entries
				.map(([k, v]) => {
					const msg =
						v && typeof v === 'object' && 'message' in v ? String(v.message) : JSON.stringify(v);
					return `${k}: ${msg}`;
				})
				.join('; ');
		}
	}
	const msgField = data.message;
	if (typeof msgField === 'string' && !isOpaquePbMessage(msgField)) {
		return msgField;
	}
	return null;
}

function humanSummaryForStatus(status: number): string {
	if (status === 400) {
		return 'Invalid or unsupported API parameters (check sort/filter fields, or PocketBase Admin logs). This app lists by record id when sort on request time fields is rejected by the server.';
	}
	if (status === 403) return 'Not allowed for this account (API rules).';
	if (status === 404) return 'Record or route not found.';
	if (status >= 500) return 'Server error — check PocketBase logs.';
	return `Request failed (HTTP ${status}).`;
}

/** Human-readable line for UI; avoids echoing PocketBase opaque generic message. */
export function formatPbClientError(err: unknown): string {
	if (err instanceof ClientResponseError) {
		const status = err.status;
		const hints = err.url ? apiQueryHints(err.url) : null;
		const path = err.url ? shortenPath(err.url) : '';

		let headline: string;
		if (isOpaquePbMessage(err.message)) {
			headline =
				status > 0 ? humanSummaryForStatus(status) : 'Request failed (network or unknown error).';
		} else {
			headline = err.message.trim();
		}

		const parts: string[] = [headline];
		if (status > 0) parts.push(`HTTP ${status}`);
		if (hints) parts.push(hints);
		else if (path) parts.push(path);

		const extra = summarizeResponseData(err.response as Record<string, unknown>);
		if (extra && !isOpaquePbMessage(extra)) parts.push(extra);

		return parts.filter(Boolean).join(' — ');
	}
	if (err instanceof Error) {
		const m = err.message || String(err);
		return isOpaquePbMessage(m) ? 'Request failed.' : m;
	}
	return 'Request failed.';
}

/** Log structured details for debugging (DevTools). */
export function logPbError(context: string, err: unknown): void {
	if (err instanceof ClientResponseError) {
		console.error(`[${context}]`, {
			status: err.status,
			url: err.url,
			message: err.message,
			data: err.response,
			isAbort: err.isAbort
		});
		return;
	}
	console.error(`[${context}]`, err);
}

/** Use for connection.reconnecting: true only for network/abort/5xx, not app 4xx. */
export function pbErrorSuggestsOffline(err: unknown): boolean {
	if (!(err instanceof ClientResponseError)) return true;
	if (err.isAbort || err.status === 0) return true;
	if (err.status >= 500) return true;
	return false;
}
