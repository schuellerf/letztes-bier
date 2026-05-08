/// <reference path="../pb_data/types.d.ts" />

const RELAY_PUSH_URL = 'http://127.0.0.1:8787/v1/push';

function summarizeItems(items, maxLen) {
	maxLen = maxLen || 100;
	if (!Array.isArray(items)) return '';
	const parts = [];
	for (let i = 0; i < items.length; i++) {
		const x = items[i];
		if (x && typeof x === 'object' && 'label' in x && 'qty' in x) {
			parts.push(String(x.qty) + '× ' + String(x.label));
		}
	}
	const s = parts.join(', ');
	if (s.length <= maxLen) return s;
	return s.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function itemsAsNotificationBody(items, maxLen) {
	maxLen = maxLen || 3500;
	if (!Array.isArray(items)) return '';
	const lines = [];
	for (let i = 0; i < items.length; i++) {
		const x = items[i];
		if (x && typeof x === 'object' && 'label' in x && 'qty' in x) {
			lines.push(String(x.qty) + '× ' + String(x.label));
		}
	}
	let s = lines.join('\n');
	if (s.length > maxLen) s = s.slice(0, Math.max(0, maxLen - 1)) + '…';
	return s;
}

function storageNotifyTitle(barName, barNick) {
	const nick = (barNick && String(barNick).trim()) || '';
	const name = String(barName || '').trim() || 'Anfrage';
	return nick ? name + ' (' + nick + ')' : name;
}

function getInternalToken() {
	return String($os.getenv('PUSH_INTERNAL_TOKEN') || '').trim();
}

/** @param {core.Record} subRec */
function sendWebPush(subRec, payloadObj) {
	const token = getInternalToken();
	if (!token) {
		console.warn('push_notify: PUSH_INTERNAL_TOKEN is not set; skipping Web Push');
		return;
	}

	const endpoint = subRec.getString('endpoint');
	const p256dh = subRec.getString('p256dh');
	const auth = subRec.getString('auth');
	if (!endpoint || !p256dh || !auth) return;

	const payload = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);

	let res;
	try {
		res = $http.send({
			method: 'POST',
			url: RELAY_PUSH_URL,
			body: JSON.stringify({
				endpoint: endpoint,
				keys: { p256dh: p256dh, auth: auth },
				payload: payload
			}),
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer ' + token
			},
			timeout: 30
		});
	} catch (err) {
		console.warn('push_notify: relay request failed:', err);
		return;
	}

	if (res.statusCode < 200 || res.statusCode >= 300) {
		console.warn('push_notify: relay status', res.statusCode);
	}
}

function pushForUserIds(app, userIds, payloadObj) {
	if (!userIds || userIds.length === 0) return;

	for (let i = 0; i < userIds.length; i++) {
		const uid = userIds[i];
		if (!uid) continue;

		let subs;
		try {
			subs = app.findRecordsByFilter('push_subscriptions', 'subscriber = {:uid}', '', 50, 0, { uid: uid });
		} catch (err) {
			console.warn('push_notify: list subscriptions:', err);
			continue;
		}

		for (let j = 0; j < subs.length; j++) {
			const s = subs[j];
			if (s) sendWebPush(s, payloadObj);
		}
	}
}

function collectUserIdsFromRecords(records) {
	const out = [];
	for (let i = 0; i < records.length; i++) {
		const r = records[i];
		if (r && r.id) out.push(r.id);
	}
	return out;
}

/** New pending request → notify storage staff for that hub. */
onRecordAfterCreateSuccess((e) => {
	try {
		const rec = e.record;
		if (!rec) return;
		if (rec.getString('status') !== 'pending') return;

		const storageId = rec.getString('storage');
		if (!storageId) return;

		let staff;
		try {
			staff = e.app.findRecordsByFilter(
				'users',
				'role = "storage" && storage = {:sid}',
				'',
				500,
				0,
				{ sid: storageId }
			);
		} catch (err) {
			console.warn('push_notify: find storage users:', err);
			return;
		}

		const barName = rec.getString('bar_name');
		const barNick = rec.getString('bar_device_nickname');
		const title = storageNotifyTitle(barName, barNick);
		const body = itemsAsNotificationBody(rec.get('items'));
		const payload = {
			title: title,
			body: body || undefined,
			url: '/storage',
			tag: 'request-' + rec.id
		};

		pushForUserIds(e.app, collectUserIdsFromRecords(staff), payload);
	} catch (err) {
		console.warn('push_notify: on create:', err);
	}
}, 'requests');

/** Pending → accepted: notify bar staff. */
onRecordAfterUpdateSuccess((e) => {
	try {
		const rec = e.record;
		if (!rec) return;

		let prev;
		try {
			prev = rec.original();
		} catch (_) {
			return;
		}
		if (!prev) return;
		if (prev.getString('status') !== 'pending') return;
		if (rec.getString('status') !== 'accepted') return;

		const barId = rec.getString('bar');
		if (!barId) return;

		let staff;
		try {
			staff = e.app.findRecordsByFilter(
				'users',
				'role = "bar" && bar = {:bid}',
				'',
				500,
				0,
				{ bid: barId }
			);
		} catch (err) {
			console.warn('push_notify: find bar users:', err);
			return;
		}

		const who = (rec.getString('accepted_by_nickname') || '').trim() || 'Storage';
		const itemsPreview = summarizeItems(rec.get('items'));
		const payload = {
			title: 'Letztes Bier — übernommen (' + who + ')',
			body: itemsPreview || undefined,
			url: '/bar',
			tag: 'accepted-' + rec.id
		};

		pushForUserIds(e.app, collectUserIdsFromRecords(staff), payload);
	} catch (err) {
		console.warn('push_notify: on update:', err);
	}
}, 'requests');
