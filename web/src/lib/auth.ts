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

/** PocketBase relation on synced records: plain id string, expanded `{ id }`, or single-element array. */
export function relationIdFromField(value: unknown): string | null {
	if (typeof value === 'string' && value.length > 0) return value;
	if (Array.isArray(value) && value.length > 0) return relationIdFromField(value[0]);
	if (value && typeof value === 'object' && 'id' in value) {
		const id = (value as { id: unknown }).id;
		if (typeof id === 'string' && id.length > 0) return id;
	}
	return null;
}

/** Dashboard path after auth, by app role on the users record. */
export function homePathForRole(role: UserRole | null): string {
	if (role === 'admin') return '/admin/users';
	if (role === 'bar') return '/bar';
	if (role === 'storage') return '/storage';
	return '/';
}
