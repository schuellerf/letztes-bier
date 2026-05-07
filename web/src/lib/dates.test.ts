import { describe, expect, it } from 'vitest';
import {
	elapsedHhMmSsSince,
	formatPbDateTime,
	parsePbDate,
	parseRequestTimestamp
} from './dates';
import type { StockRequestRecord } from './types';

function mockRequest(
	partial: Pick<StockRequestRecord, 'id'> & Partial<StockRequestRecord>
): StockRequestRecord {
	return partial as StockRequestRecord;
}

describe('parsePbDate', () => {
	it('parses ISO with T and Z', () => {
		const d = parsePbDate('2026-05-07T10:16:11.840Z');
		expect(d).not.toBeNull();
		expect(d!.getUTCFullYear()).toBe(2026);
	});

	it('parses PocketBase space + Z', () => {
		const d = parsePbDate('2026-05-07 10:16:11.840Z');
		expect(d).not.toBeNull();
	});

	it('parses fractional seconds beyond ms', () => {
		const d = parsePbDate('2026-05-07 10:16:11.123456789Z');
		expect(d).not.toBeNull();
	});

	it('parses ISO with space before numeric offset (SQLite / driver style)', () => {
		expect(parsePbDate('2026-05-07T10:16:11.000 +00:00')).not.toBeNull();
		expect(parsePbDate('2026-05-07 10:16:11.000 +02:00')).not.toBeNull();
	});

	it('parses trailing space before Z', () => {
		const d = parsePbDate('2026-05-07T10:16:11.000 Z');
		expect(d).not.toBeNull();
	});

	it('returns null for empty and invalid', () => {
		expect(parsePbDate('')).toBeNull();
		expect(parsePbDate(undefined)).toBeNull();
		expect(parsePbDate('not-a-date')).toBeNull();
	});
});

describe('parseRequestTimestamp', () => {
	it('uses requested_at when valid', () => {
		const r = mockRequest({
			id: 'r1',
			requested_at: '2026-01-15T12:00:00.000Z'
		});
		const d = parseRequestTimestamp(r);
		expect(d).not.toBeNull();
		expect(d!.getUTCMonth()).toBe(0);
		expect(d!.getUTCDate()).toBe(15);
	});

	it('returns null when requested_at missing', () => {
		const r = mockRequest({ id: 'r2' });
		expect(parseRequestTimestamp(r)).toBeNull();
	});
});

describe('elapsedHhMmSsSince', () => {
	it('formats and returns — for null', () => {
		expect(elapsedHhMmSsSince(null, Date.now())).toBe('—');
		const d = new Date('2026-05-07T10:00:00.000Z');
		const s = elapsedHhMmSsSince(d, d.getTime() + 3661000);
		expect(s).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});

describe('formatPbDateTime', () => {
	it('returns em dash when unparseable', () => {
		expect(formatPbDateTime('')).toBe('—');
	});
});
