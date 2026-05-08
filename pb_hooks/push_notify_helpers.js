/**
 * Shared push helpers for pb_hooks.
 * Load with require() inside each handler — PocketBase isolates handler scope.
 * @see https://pocketbase.io/docs/js-overview/#handlers-scope
 */

var dbg = require(__hooks + '/push_notify_debug.js');

var RELAY_PUSH_URL = 'http://127.0.0.1:8787/v1/push';

/** JSON field from PocketBase may be a string or non-array in hooks. */
function coerceItemsArray(raw) {
	if (Array.isArray(raw)) return raw;
	if (raw != null && typeof raw === 'string') {
		try {
			var p = JSON.parse(raw);
			return Array.isArray(p) ? p : [];
		} catch (_) {
			return [];
		}
	}
	return [];
}

function summarizeItems(items, maxLen) {
	maxLen = maxLen || 100;
	items = coerceItemsArray(items);
	if (items.length === 0) return '';
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
	items = coerceItemsArray(items);
	if (items.length === 0) return '';
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
		dbg.pushNotifyDebugLog('sendWebPush_skip', { reason: 'no_PUSH_INTERNAL_TOKEN' });
		return;
	}

	var endpoint = subRec.getString('endpoint');
	var p256dh = subRec.getString('p256dh');
	var auth = subRec.getString('auth');
	if (!endpoint || !p256dh || !auth) {
		console.warn(
			'push_notify: skip push — incomplete subscription row',
			typeof subRec.getId === 'function' ? subRec.getId() : subRec.id
		);
		dbg.pushNotifyDebugLog('sendWebPush_skip', {
			reason: 'incomplete_subscription',
			rowId: subRec.id,
			ep: dbg.pushEndpointShort(endpoint),
			hasP256: !!p256dh,
			hasAuth: !!auth
		});
		return;
	}

	var payload = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);

	dbg.pushNotifyDebugLog('sendWebPush_relay', {
		rowId: subRec.id,
		subscriberId: subRec.getString('subscriber'),
		ep: dbg.pushEndpointShort(endpoint),
		relay: RELAY_PUSH_URL,
		payloadChars: payload.length
	});

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
		dbg.pushNotifyDebugLog('sendWebPush_error', {
			ep: dbg.pushEndpointShort(endpoint),
			err: err != null ? String(err) : 'unknown'
		});
		return;
	}

	var code = res != null && typeof res.statusCode === 'number' ? res.statusCode : -1;
	var raw = '';
	try {
		if (res && res.raw != null) raw = String(res.raw);
		else if (res && res.body != null) raw = String(res.body);
	} catch (_) {}

	if (code >= 200 && code < 300) {
		dbg.pushNotifyDebugLog('sendWebPush_ok', { ep: dbg.pushEndpointShort(endpoint), statusCode: code });
		return;
	}

	console.warn('push_notify: relay status', code, raw ? raw.slice(0, 200) : '');
	dbg.pushNotifyDebugLog('sendWebPush_relay_fail', {
		ep: dbg.pushEndpointShort(endpoint),
		statusCode: code,
		bodyPreview: raw ? raw.slice(0, 500) : ''
	});
}

function pushForUserIds(app, userIds, payloadObj) {
	if (!userIds || userIds.length === 0) {
		dbg.pushNotifyDebugLog('pushForUserIds_skip', { reason: 'empty_userIds' });
		return;
	}

	dbg.pushNotifyDebugLog('pushForUserIds_start', {
		userCount: userIds.length,
		title: typeof payloadObj === 'object' && payloadObj.title ? payloadObj.title : '?'
	});

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
			dbg.pushNotifyDebugLog('pushForUserIds_list_err', {
				userId: uid,
				err: String(err)
			});
			continue;
		}

		dbg.pushNotifyDebugLog('pushForUserIds_subscriber', {
			userId: uid,
			subscriptionRows: subs ? subs.length : 0
		});

		if (!subs || subs.length === 0) {
			console.warn(
				'push_notify: no push_subscriptions for user — enable notifications on a storage device (' +
					String(uid).slice(0, 8) +
					'…)'
			);
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

/** Pending (new request) or bar reminder → Web Push for storage staff on that hub.
 * opts.reminder: Erinnern from bar (title/tag); allows status pending OR accepted.
 * Without reminder (create hook): only pending. */
function pushPendingRequestNotifyStorage(app, rec, opts) {
	opts = opts || {};
	var reminder = !!opts.reminder;
	if (!rec) {
		dbg.pushNotifyDebugLog('pushPending_skip', { reason: 'no_record' });
		return;
	}
	var st = rec.getString('status');
	if (reminder) {
		if (st !== 'pending' && st !== 'accepted') {
			dbg.pushNotifyDebugLog('pushPending_skip', { reason: 'bad_status_reminder', status: st, id: rec.id });
			return;
		}
	} else if (st !== 'pending') {
		dbg.pushNotifyDebugLog('pushPending_skip', { reason: 'not_pending', status: st, id: rec.id });
		return;
	}

	var storageId = rec.getString('storage');
	if (!storageId) {
		dbg.pushNotifyDebugLog('pushPending_skip', { reason: 'no_storage_field', id: rec.id });
		return;
	}

	var staff;
	try {
		staff = app.findRecordsByFilter(
			'users',
			'role = "storage" && storage = {:sid}',
			'',
			500,
			0,
			{ sid: storageId }
		);
	} catch (err) {
		console.warn('push_notify: find storage users:', err);
		dbg.pushNotifyDebugLog('pushPending_staff_err', { err: String(err), storageId: storageId.slice(0, 8) });
		return;
	}

	dbg.pushNotifyDebugLog('pushPending_staff', {
		storageId: storageId,
		storageStaffCount: staff ? staff.length : 0,
		reminder: reminder,
		requestId: rec.id,
		requestStatus: st
	});

	if (!staff || staff.length === 0) {
		console.warn(
			'push_notify: Erinnerung — no storage users for hub',
			storageId.slice(0, 12),
			'(assign role=storage users to this storage)'
		);
		return;
	}

	var barName = rec.getString('bar_name');
	var barNick = rec.getString('bar_device_nickname');
	var baseTitle = storageNotifyTitle(barName, barNick);
	var title = reminder ? 'Erinnerung · ' + baseTitle : baseTitle;
	var body = itemsAsNotificationBody(rec.get('items'));
	var payload = {
		title: title,
		body: body || undefined,
		url: '/storage',
		tag: reminder ? 'remind-' + rec.id + '-' + String(Date.now()) : 'request-' + rec.id
	};

	var userIdsForPush = collectUserIdsFromRecords(staff);
	dbg.pushNotifyDebugLog('pushPending_dispatch', {
		title: title,
		tag: payload.tag,
		bodyLen: body ? body.length : 0,
		targetUserIds: userIdsForPush.length
	});

	pushForUserIds(app, userIdsForPush, payload);
}

module.exports = {
	summarizeItems: summarizeItems,
	itemsAsNotificationBody: itemsAsNotificationBody,
	storageNotifyTitle: storageNotifyTitle,
	pushForUserIds: pushForUserIds,
	collectUserIdsFromRecords: collectUserIdsFromRecords,
	pushPendingRequestNotifyStorage: pushPendingRequestNotifyStorage
};
