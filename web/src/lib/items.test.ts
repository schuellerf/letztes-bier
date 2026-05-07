import { describe, expect, it } from 'vitest';
import { normalizeItems, parseQuickItems } from './items';

describe('parseQuickItems', () => {
	it('returns trimmed non-empty strings', () => {
		expect(parseQuickItems(['  a ', 'b', '', 3])).toEqual(['a', 'b', '3']);
	});

	it('returns empty for non-array', () => {
		expect(parseQuickItems(null)).toEqual([]);
		expect(parseQuickItems({})).toEqual([]);
	});
});

describe('normalizeItems', () => {
	it('still merges labels', () => {
		expect(normalizeItems([{ label: 'x', qty: 1 }])).toEqual([{ label: 'x', qty: 1 }]);
	});
});
