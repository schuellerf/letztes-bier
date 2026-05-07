import { browser } from '$app/environment';
import { itemsAsNotificationBody } from '$lib/items';

const seenKeys = new Set<string>();

function key(kind: string, id: string, extra = '') {
	return `${kind}:${id}:${extra}`;
}

export async function ensureNotifyPermission(): Promise<NotificationPermission> {
	if (!browser || !('Notification' in window)) return 'denied';
	if (Notification.permission === 'granted') return 'granted';
	if (Notification.permission === 'denied') return 'denied';
	return await Notification.requestPermission();
}

export function notifyOnce(
	kind: string,
	recordId: string,
	transition: string,
	title: string,
	body?: string
) {
	if (!browser || Notification.permission !== 'granted') return;
	const k = key(kind, recordId, transition);
	if (seenKeys.has(k)) return;
	seenKeys.add(k);
	try {
		new Notification(title, { body, silent: false });
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
	notifyOnce('storage-new', recordId, 'create', title, body || undefined);
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
	notifyOnce('storage-new', recordId, transition, title, body || undefined);
}

export function notifyRequestAccepted(
	recordId: string,
	acceptNick?: string,
	itemsPreview?: string
) {
	const who = acceptNick?.trim() || 'Storage';
	notifyOnce(
		'bar-accepted',
		recordId,
		'accepted',
		`Letztes Bier — übernommen (${who})`,
		itemsPreview
	);
}
