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

/** Path from push `url` (e.g. "/storage") for matching an open tab. */
function targetPathname(pushUrl: string | undefined): string {
	const raw = (pushUrl || '/').trim() || '/';
	try {
		return new URL(raw, self.location.origin).pathname;
	} catch {
		return '/';
	}
}

function clientMatchesPushPath(clientUrl: string, path: string): boolean {
	if (path === '/') return false;
	let p: string;
	try {
		p = new URL(clientUrl).pathname;
	} catch {
		return false;
	}
	return p === path || p.startsWith(path + '/');
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
			const notifyUrl = data.url || '/';
			const options: NotificationOptions = {
				body: data.body,
				tag,
				data: { url: notifyUrl }
			};
			const path = targetPathname(notifyUrl);
			if (path !== '/') {
				const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
				const origin = self.location.origin;
				const visible = clients.filter(
					(c): c is WindowClient =>
						c.type === 'window' &&
						'visibilityState' in c &&
						c.visibilityState === 'visible' &&
						c.url.startsWith(origin) &&
						clientMatchesPushPath(c.url, path)
				);
				if (visible.length > 0) {
					await Promise.all(
						visible.map((c) =>
							c.postMessage({
								type: 'letztes-bier-push',
								payload: { ...data }
							})
						)
					);
					return;
				}
			}
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
