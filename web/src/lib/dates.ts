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
		s = s.replace(/^(\d{4}-\d{2}-\d{2})[ T]/, '$1T');
	}
	s = truncateIsoFractionalSeconds(s);
	let d = new Date(s);
	if (Number.isNaN(d.getTime()) && !t.includes('T')) {
		s = truncateIsoFractionalSeconds(t.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T'));
		d = new Date(s);
	}
	return Number.isNaN(d.getTime()) ? null : d;
}

export function formatPbDateTime(value: string | number | Date | undefined | null): string {
	const d = parsePbDate(value);
	return d ? d.toLocaleString() : '—';
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
