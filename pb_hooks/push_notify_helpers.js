/**
 * Shared push helpers for pb_hooks.
 * Load with require() inside each handler — PocketBase isolates handler scope.
 * @see https://pocketbase.io/docs/js-overview/#handlers-scope
 */

var RELAY_PUSH_URL = 'http://127.0.0.1:8787/v1/push';

function summarizeItems(items, maxLen) {
	maxLen = maxLen || 100;
	if (!Array.isArray(items)) return '';
	var parts = [];
	for (var i = 0; i < items.length; i++) {
		var x = items[i];
		if (x && typeof x === 'object' && 'label' in x && 'qty' in x) {
			parts.push(String(x.qty) + '× ' + String(x.label));
		}
	}
	var s = parts.join(', ');
	if (s.length <= maxLen) return s;
	return s.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function itemsAsNotificationBody(items, maxLen) {
	maxLen = maxLen || 3500;
	if (!Array.isArray(items)) return '';
	var lines = [];
	for (var i = 0; i < items.length; i++) {
		var x = items[i];
		if (x && typeof x === 'object' && 'label' in x && 'qty' in x) {
			lines.push(String(x.qty) + '× ' + String(x.label));
		}
	}
	var s = lines.join('\n');
	if (s.length > maxLen) s = s.slice(0, Math.max(0, maxLen - 1)) + '…';
	return s;
}

function storageNotifyTitle(barName, barNick) {
	var nick = (barNick && String(barNick).trim()) || '';
	var name = String(barName || '').trim() || 'Anfrage';
	return nick ? name + ' (' + nick + ')' : name;
}

function getInternalToken() {
	return String($os.getenv('PUSH_INTERNAL_TOKEN') || '').trim();
}

function sendWebPush(subRec, payloadObj) {
	var token = getInternalToken();
	if (!token) {
		console.warn('push_notify: PUSH_INTERNAL_TOKEN is not set; skipping Web Push');
		return;
	}

	var endpoint = subRec.getString('endpoint');
	var p256dh = subRec.getString('p256dh');
	var auth = subRec.getString('auth');
	if (!endpoint || !p256dh || !auth) return;

	var payload = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);

	var res;
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

	for (var i = 0; i < userIds.length; i++) {
		var uid = userIds[i];
		if (!uid) continue;

		var subs;
		try {
			subs = app.findRecordsByFilter(
				'push_subscriptions',
				'subscriber = {:uid}',
				'',
				50,
				0,
				{ uid: uid }
			);
		} catch (err) {
			console.warn('push_notify: list subscriptions:', err);
			continue;
		}

		for (var j = 0; j < subs.length; j++) {
			var s = subs[j];
			if (s) sendWebPush(s, payloadObj);
		}
	}
}

function collectUserIdsFromRecords(records) {
	var out = [];
	for (var i = 0; i < records.length; i++) {
		var r = records[i];
		if (r && r.id) out.push(r.id);
	}
	return out;
}

module.exports = {
	summarizeItems: summarizeItems,
	itemsAsNotificationBody: itemsAsNotificationBody,
	storageNotifyTitle: storageNotifyTitle,
	pushForUserIds: pushForUserIds,
	collectUserIdsFromRecords: collectUserIdsFromRecords
};
