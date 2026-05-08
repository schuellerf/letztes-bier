import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type PocketBase from 'pocketbase';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

/** Subscribe for Web Push and upsert a row in `push_subscriptions` for the current auth user. */
export async function syncPushSubscriptionToPocketBase(pb: PocketBase): Promise<void> {
	if (!browser) return;

	const vapid = env.PUBLIC_VAPID_PUBLIC_KEY?.trim();
	if (!vapid) {
		console.warn('PUBLIC_VAPID_PUBLIC_KEY is not set; push subscription skipped');
		return;
	}
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		console.warn('Push messaging is not supported in this browser');
		return;
	}
	if (!pb.authStore.isValid || !pb.authStore.record?.id) return;

	const reg = await navigator.serviceWorker.ready;
	let sub = await reg.pushManager.getSubscription();
	if (!sub) {
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(vapid)
		});
	}

	const json = sub.toJSON();
	const endpoint = json.endpoint ?? '';
	const key = json.keys;
	const p256dh = key?.p256dh ?? '';
	const auth = key?.auth ?? '';
	if (!endpoint || !p256dh || !auth) {
		throw new Error('Incomplete push subscription');
	}

	const userAgent =
		typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : '';

	const filterExpr = `endpoint=${JSON.stringify(endpoint)}`;

	try {
		const existing = await pb.collection('push_subscriptions').getFirstListItem(filterExpr);
		if (existing.p256dh !== p256dh || existing.auth !== auth || existing.user_agent !== userAgent) {
			await pb.collection('push_subscriptions').update(existing.id, {
				p256dh,
				auth,
				user_agent: userAgent || null
			});
		}
	} catch {
		await pb.collection('push_subscriptions').create({
			user: pb.authStore.record.id,
			endpoint,
			p256dh,
			auth,
			user_agent: userAgent || null
		});
	}
}

/** Remove push subscription row and unsubscribe the browser endpoint (while still authenticated). */
export async function clearPushSubscriptionBestEffort(pb: PocketBase): Promise<void> {
	if (!browser || !('serviceWorker' in navigator)) return;

	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		const endpoint = sub?.endpoint;
		if (endpoint && pb.authStore.isValid) {
			try {
				const row = await pb
					.collection('push_subscriptions')
					.getFirstListItem(`endpoint=${JSON.stringify(endpoint)}`);
				await pb.collection('push_subscriptions').delete(row.id);
			} catch {
				/* no row */
			}
		}
		await sub?.unsubscribe();
	} catch {
		/* best-effort */
	}
}
