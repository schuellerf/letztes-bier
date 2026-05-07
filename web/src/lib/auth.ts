import type { RecordModel } from 'pocketbase';
import type { UserRole } from './types';

export function roleFromRecord(record: RecordModel | undefined | null): UserRole | null {
	if (!record) return null;
	const r = record.role as string | undefined;
	if (r === 'admin' || r === 'bar' || r === 'storage') return r;
	return null;
}

export function barIdFromRecord(record: RecordModel | undefined | null): string | null {
	if (!record) return null;
	const b = record.bar as string | undefined;
	return b && b.length > 0 ? b : null;
}
