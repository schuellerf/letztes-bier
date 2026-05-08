/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
import { version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

type PushPayload = {
	title?: string;
	body?: string;
	url?: string;
	tag?: string;
};

function parsePushPayload(raw: string): PushPayload {
	try {
		return JSON.parse(raw) as PushPayload;
	} catch {
		return {};
	}
}

self.addEventListener('push', (event: PushEvent) => {
	event.waitUntil(
		(async () => {
			let data: PushPayload = {};
			try {
				const text = event.data ? await event.data.text() : '';
				if (text) data = parsePushPayload(text);
			} catch {
				/* use defaults */
			}
			const title = data.title?.trim() || 'Letztes Bier';
			const tag = data.tag?.trim() || `letztes-bier-${version}`;
			const options: NotificationOptions = {
				body: data.body,
				tag,
				data: { url: data.url || '/' }
			};
			await self.registration.showNotification(title, options);
		})()
	);
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
	event.notification.close();
	const raw = event.notification.data as { url?: string } | undefined;
	const path = typeof raw?.url === 'string' && raw.url.length > 0 ? raw.url : '/';
	const targetUrl = new URL(path, self.location.origin).href;

	event.waitUntil(
		(async () => {
			const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const sameOrigin = all.filter((c) => c.url.startsWith(self.location.origin));
			const ordered = [
				...sameOrigin.filter((c) => 'visibilityState' in c && c.visibilityState === 'visible'),
				...sameOrigin.filter((c) => !('visibilityState' in c && c.visibilityState === 'visible'))
			];

			for (const client of ordered) {
				if ('navigate' in client && typeof client.navigate === 'function') {
					try {
						await client.navigate(targetUrl);
					} catch {
						/* still try to focus this window */
					}
				}
				try {
					await client.focus();
					return;
				} catch {
					/* try next */
				}
			}

			try {
				await self.clients.openWindow(targetUrl);
			} catch {
				/* */
			}
		})()
	);
});
