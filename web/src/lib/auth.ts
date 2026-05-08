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

export function storageIdFromRecord(record: RecordModel | undefined | null): string | null {
	if (!record) return null;
	const s = record.storage as string | undefined;
	return s && s.length > 0 ? s : null;
}

/** Dashboard path after auth, by app role on the users record. */
export function homePathForRole(role: UserRole | null): string {
	if (role === 'admin') return '/admin/users';
	if (role === 'bar') return '/bar';
	if (role === 'storage') return '/storage';
	return '/';
}
