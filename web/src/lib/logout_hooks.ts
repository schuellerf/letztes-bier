import { pb } from '$lib/pb_client';

const cleanups: (() => void)[] = [];

export function registerRealtimeCleanup(fn: () => void): () => void {
	cleanups.push(fn);
	return () => {
		const i = cleanups.indexOf(fn);
		if (i !== -1) cleanups.splice(i, 1);
	};
}

export function runLogout() {
	while (cleanups.length > 0) {
		const fn = cleanups.pop();
		try {
			fn?.();
		} catch {
			/* best-effort */
		}
	}
	pb().authStore.clear();
}
