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
