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
	const options: NotificationOptions = {
		body,
		tag,
		data: { url },
		silent: false
	};

	if ('serviceWorker' in navigator) {
		const reg = await navigator.serviceWorker.getRegistration();
		if (reg?.active) {
			try {
				await reg.showNotification(title, options);
				return;
			} catch {
				/* page Notification fallback */
			}
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

/** Local confirmation after server accepted a push reminder to storage. */
export function notifyRemindSentBar(): void {
	if (!browser || Notification.permission !== 'granted') return;
	void showLocalNotification(
		'Erinnerung gesendet',
		'Das Lager wurde per Push benachrichtigt.',
		'bar-remind-sent',
		'/bar'
	).catch(() => {});
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
