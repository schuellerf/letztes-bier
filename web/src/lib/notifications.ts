import { browser } from '$app/environment';

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

export function notifyNewPendingRequest(
	recordId: string,
	barName: string,
	barNick?: string
) {
	const nick = barNick?.trim();
	const who = nick ? `${barName} (${nick})` : barName;
	notifyOnce(
		'storage-new',
		recordId,
		'create',
		'Letztes Bier — neue Anfrage',
		who
	);
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
