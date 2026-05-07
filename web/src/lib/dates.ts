import type { StockRequestRecord } from './types';

/** PocketBase / SQLite may emit fractional seconds beyond 3 digits; many engines only parse ms. */
function truncateIsoFractionalSeconds(s: string): string {
	return s.replace(/(\.\d{3})\d+(?=Z|[+-]\d|$)/i, '$1');
}

/** Normalize PocketBase datetime strings (often `YYYY-MM-DD HH:mm:ss...`) for `Date`. */
export function parsePbDate(value: string | number | Date | undefined | null): Date | null {
	if (value == null) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (typeof value === 'number') {
		const ms = value < 1e12 ? value * 1000 : value;
		const d = new Date(ms);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	let t = String(value).trim();
	if (!t) return null;
	t = t.replace(/\s+(UTC|GMT)\s*$/i, 'Z');
	if (/^\d+$/.test(t)) {
		const n = Number(t);
		const ms = n < 1e12 ? n * 1000 : n;
		const d = new Date(ms);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	let s = t;
	if (!s.includes('T')) {
		s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
	}
	s = truncateIsoFractionalSeconds(s);
	let d = new Date(s);
	if (Number.isNaN(d.getTime()) && !t.includes('T')) {
		s = truncateIsoFractionalSeconds(t.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T'));
		d = new Date(s);
	}
	if (!Number.isNaN(d.getTime())) return d;

	const m = t.match(
		/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:\s*(Z|UTC|GMT))?\s*$/i
	);
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]) - 1;
	const day = Number(m[3]);
	const hh = Number(m[4]);
	const min = Number(m[5]);
	const sec = Number(m[6]);
	let ms = 0;
	if (m[7]) ms = Number(m[7].slice(0, 3).padEnd(3, '0'));
	const zulu = Boolean(m[8]);
	if (zulu) {
		d = new Date(Date.UTC(y, mo, day, hh, min, sec, ms));
	} else {
		d = new Date(y, mo, day, hh, min, sec, ms);
	}
	return Number.isNaN(d.getTime()) ? null : d;
}

export function formatPbDateTime(value: string | number | Date | undefined | null): string {
	const d = parsePbDate(value);
	return d ? d.toLocaleString() : '—';
}

/** Prefer system `created`, then `updated` if the API omitted or stripped `created`. */
const warnedUnparsedRequestIds = new Set<string>();

export function parseRequestTimestamp(r: StockRequestRecord): Date | null {
	const d = parsePbDate(r.created) ?? parsePbDate(r.updated);
	if (
		import.meta.env.DEV &&
		import.meta.env.MODE !== 'test' &&
		!d &&
		r.id &&
		!warnedUnparsedRequestIds.has(r.id)
	) {
		warnedUnparsedRequestIds.add(r.id);
		console.warn(
			'[letztes-bier] Requested time unparsed (shows "— ago"). Compare with Network → requests list JSON for this id.',
			{
				id: r.id,
				created: r.created,
				createdType: typeof r.created,
				updated: r.updated,
				updatedType: typeof r.updated
			}
		);
	}
	return d;
}

/** Elapsed since `from` as `HH:MM:SS` (hours unbounded; hours padded to at least 2 digits). */
export function elapsedHhMmSsSince(from: Date | null, nowMs: number): string {
	if (!from || Number.isNaN(from.getTime())) return '—';
	let sec = Math.floor((nowMs - from.getTime()) / 1000);
	if (sec < 0) sec = 0;
	const H = Math.floor(sec / 3600);
	const M = Math.floor((sec % 3600) / 60);
	const S = sec % 60;
	return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}`;
}
