import { pb } from '$lib/pb_client';
import { clearPushSubscriptionBestEffort } from '$lib/push_subscription';

const cleanups: (() => void)[] = [];

export function registerRealtimeCleanup(fn: () => void): () => void {
	cleanups.push(fn);
	return () => {
		const i = cleanups.indexOf(fn);
		if (i !== -1) cleanups.splice(i, 1);
	};
}

export async function runLogout(): Promise<void> {
	while (cleanups.length > 0) {
		const fn = cleanups.pop();
		try {
			fn?.();
		} catch {
			/* best-effort */
		}
	}
	const client = pb();
	await clearPushSubscriptionBestEffort(client);
	client.authStore.clear();
}
