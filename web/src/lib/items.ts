import type { StockItem } from './types';

export function normalizeItems(raw: StockItem[]): StockItem[] {
	return raw
		.map((x) => ({
			label: String(x.label ?? '').trim(),
			qty: Math.max(1, Math.min(999, Number(x.qty) || 1))
		}))
		.filter((x) => x.label.length > 0);
}

export function summarizeItems(items: unknown, maxLen = 100): string {
	if (!Array.isArray(items)) return '';
	const parts: string[] = [];
	for (const x of items) {
		if (x && typeof x === 'object' && 'label' in x && 'qty' in x) {
			const o = x as { label: unknown; qty: unknown };
			parts.push(`${o.qty}× ${String(o.label)}`);
		}
	}
	const s = parts.join(', ');
	if (s.length <= maxLen) return s;
	return s.slice(0, Math.max(0, maxLen - 1)) + '…';
}

/** One line per item; cap length for Notification API limits. */
export function itemsAsNotificationBody(items: unknown, maxLen = 3500): string {
	if (!Array.isArray(items)) return '';
	const lines: string[] = [];
	for (const x of items) {
		if (x && typeof x === 'object' && 'label' in x && 'qty' in x) {
			const o = x as { label: unknown; qty: unknown };
			lines.push(`${o.qty}× ${String(o.label)}`);
		}
	}
	let s = lines.join('\n');
	if (s.length > maxLen) s = `${s.slice(0, Math.max(0, maxLen - 1))}…`;
	return s;
}
