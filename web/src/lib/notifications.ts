import { browser } from '$app/environment';
import { itemsAsNotificationBody } from '$lib/items';

const seenKeys = new Set<string>();

function key(kind: string, id: string, extra = '') {
	return `${kind}:${id}:${extra}`;
}

type LocalNotifyMeta = { tag: string; url: string };

async function showLocalNotification(
	title: string,
	body: string | undefined,
	tag: string,
	url: string
): Promise<void> {
	if (!browser) return;
	if ('serviceWorker' in navigator) {
		try {
			const reg = await navigator.serviceWorker.ready;
			await reg.showNotification(title, {
				body,
				tag,
				data: { url },
				silent: false
			});
			return;
		} catch {
			/* fallback below */
		}
	}
	new Notification(title, { body, silent: false });
}

export async function ensureNotifyPermission(): Promise<NotificationPermission> {
	if (!browser || !('Notification' in window)) return 'denied';
	if (Notification.permission === 'granted') return 'granted';
	if (Notification.permission === 'denied') return 'denied';
	return await Notification.requestPermission();
}

export async function notifyOnce(
	kind: string,
	recordId: string,
	transition: string,
	title: string,
	body: string | undefined,
	meta: LocalNotifyMeta
): Promise<void> {
	if (!browser || Notification.permission !== 'granted') return;
	const k = key(kind, recordId, transition);
	if (seenKeys.has(k)) return;
	seenKeys.add(k);
	try {
		await showLocalNotification(title, body, meta.tag, meta.url);
	} catch {
		seenKeys.delete(k);
	}
}

function storageNotifyTitle(barName: string, barNick?: string): string {
	const nick = barNick?.trim();
	return nick ? `${barName} (${nick})` : barName;
}

export function notifyNewPendingRequest(
	recordId: string,
	barName: string,
	barNick?: string,
	items?: unknown
) {
	const title = storageNotifyTitle(barName, barNick);
	const body = itemsAsNotificationBody(items);
	void notifyOnce('storage-new', recordId, 'create', title, body || undefined, {
		tag: `request-${recordId}`,
		url: '/storage'
	}).catch(() => {});
}

/** Manual repeat: new transition each time so it always shows. */
export function notifyPendingReminder(
	recordId: string,
	barName: string,
	barNick?: string,
	items?: unknown
) {
	if (!browser || Notification.permission !== 'granted') return;
	const title = storageNotifyTitle(barName, barNick);
	const body = itemsAsNotificationBody(items);
	const transition = `remind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	void notifyOnce('storage-new', recordId, transition, title, body || undefined, {
		tag: `remind-${recordId}-${transition}`,
		url: '/storage'
	}).catch(() => {});
}

export function notifyRequestAccepted(recordId: string, acceptNick?: string, itemsPreview?: string) {
	const who = acceptNick?.trim() || 'Storage';
	void notifyOnce(
		'bar-accepted',
		recordId,
		'accepted',
		`Letztes Bier — übernommen (${who})`,
		itemsPreview,
		{
			tag: `accepted-${recordId}`,
			url: '/bar'
		}
	).catch(() => {});
}
