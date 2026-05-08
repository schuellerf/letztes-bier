import type PocketBase from 'pocketbase';
import { COLLECTIONS } from '$lib/pb_client';
import { registerRealtimeCleanup, runLogout } from '$lib/logout_hooks';

let stopAuthSignals: (() => void) | null = null;

function detachAuthSignals(): void {
	try {
		stopAuthSignals?.();
	} catch {
		/* ignore */
	}
	stopAuthSignals = null;
}

/** Subscribe to auth_signals; on logout/reauth for this user, clear PocketBase auth and realtime. Safe to call again (replaces prior subscription). */
export function bindAuthSignalsLogout(pb: PocketBase): void {
	detachAuthSignals();

	const uid = pb.authStore.record?.id;
	if (!uid) return;

	void (async () => {
		let unsub: (() => void) | null = null;
		try {
			unsub = await pb.collection(COLLECTIONS.auth_signals).subscribe('*', (ev) => {
				if (ev.action !== 'create' || !ev.record) return;
				const row = ev.record as { user?: unknown; action?: unknown };
				const target =
					typeof row.user === 'string'
						? row.user
						: row.user && typeof row.user === 'object' && 'id' in row.user
							? String((row.user as { id: string }).id)
							: '';
				if (target !== uid) return;
				const action = typeof row.action === 'string' ? row.action : '';
				if (action === 'logout' || action === 'reauth') {
					void runLogout();
				}
			});
		} catch {
			return;
		}

		stopAuthSignals = () => {
			try {
				unsub?.();
			} catch {
				/* ignore */
			}
			unsub = null;
		};

		registerRealtimeCleanup(() => {
			detachAuthSignals();
		});
	})();
}
