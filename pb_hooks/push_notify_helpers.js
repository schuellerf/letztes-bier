/**
 * Shared push helpers for pb_hooks.
 * Load with require() inside each handler — PocketBase isolates handler scope.
 * @see https://pocketbase.io/docs/js-overview/#handlers-scope
 */

var dbg = require(__hooks + '/push_notify_debug.js');

var RELAY_PUSH_URL = 'http://127.0.0.1:8787/v1/push';

/** Must stay below relay webPushMaxPlainPayload (1800) for RecordSize 2048 — hooks shrink JSON to fit. */
var WEB_PUSH_MAX_PAYLOAD_BYTES = 1800;

/** Soft cap on item lines (chars) before JSON fitting — aligns with smaller push record. */
var PUSH_ITEMS_BODY_MAX_CHARS = 500;

function utf8ByteLength(str) {
	if (!str) return 0;
	var n = 0;
	for (var i = 0; i < str.length; i++) {
		var c = str.charCodeAt(i);
		if (c < 0x80) n += 1;
		else if (c < 0x800) n += 2;
		else if (c >= 0xd800 && c <= 0xdbff) {
			n += 4;
			i++;
		} else n += 3;
	}
	return n;
}

/** Largest prefix of str whose UTF-8 length is <= maxBytes, plus … if truncated. */
function truncateUtf8(str, maxBytes) {
	if (!str || maxBytes <= 0) return '';
	if (utf8ByteLength(str) <= maxBytes) return str;
	var ell = '…';
	var ellB = utf8ByteLength(ell);
	var budget = Math.max(0, maxBytes - ellB);
	if (budget <= 0) return utf8ByteLength(ell) <= maxBytes ? ell : '';
	var lo = 0;
	var hi = str.length;
	var best = '';
	while (lo <= hi) {
		var mid = Math.floor((lo + hi) / 2);
		var slice = str.slice(0, mid);
		if (utf8ByteLength(slice) <= budget) {
			best = slice;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return best + ell;
}

/** Last resort: drop body, shrink tag/title until JSON fits (delivery over full context). */
function squeezePushPayload(o, max) {
	function sz() {
		return utf8ByteLength(JSON.stringify(o));
	}
	if (sz() <= max) return o;
	if (o.body) delete o.body;
	while (o.tag && sz() > max) {
		var tg = String(o.tag);
		if (utf8ByteLength(tg) <= 48) {
			delete o.tag;
		} else {
			o.tag = truncateUtf8(tg, Math.max(24, Math.floor(utf8ByteLength(tg) * 0.55)));
		}
	}
	while (o.url && sz() > max) {
		var u = String(o.url);
		if (utf8ByteLength(u) <= 24) break;
		o.url = truncateUtf8(u, Math.max(12, Math.floor(utf8ByteLength(u) * 0.5)));
	}
	while (sz() > max) {
		var tit = String(o.title || '');
		if (utf8ByteLength(tit) <= 24) {
			o.title = 'Nachricht';
			break;
		}
		o.title = truncateUtf8(tit, Math.max(20, Math.floor(utf8ByteLength(tit) * 0.65)));
	}
	if (sz() > max) o.title = 'Letztes Bier';
	if (sz() > max) {
		delete o.body;
		delete o.url;
		delete o.tag;
		o.title = 'Letztes Bier';
	}
	return o;
}

/** Shrink title/body/tag/url so the JSON we send fits Web Push limits. */
function fitWebPushPayloadObj(obj) {
	if (!obj || typeof obj !== 'object') return obj;
	var max = WEB_PUSH_MAX_PAYLOAD_BYTES;
	function jsonSize(x) {
		return utf8ByteLength(JSON.stringify(x));
	}
	var o = {};
	o.title = obj.title != null ? String(obj.title) : '';
	if (obj.body != null && String(obj.body).length > 0) o.body = String(obj.body);
	if (obj.url != null) o.url = String(obj.url);
	if (obj.tag != null) o.tag = String(obj.tag);

	if (jsonSize(o) <= max) return squeezePushPayload(o, max);

	var bodyStr = o.body ? String(o.body) : '';
	delete o.body;

	if (jsonSize(o) > max) {
		var room = Math.max(0, max - jsonSize({ title: '', url: o.url || '', tag: o.tag || '' }));
		o.title = truncateUtf8(o.title, room);
		if (jsonSize(o) > max) {
			room = Math.max(0, max - jsonSize({ title: o.title, url: o.url || '', tag: '' }));
			o.tag = truncateUtf8(o.tag || '', room);
		}
		if (jsonSize(o) > max) {
			room = Math.max(0, max - jsonSize({ title: o.title, tag: o.tag || '', url: '' }));
			o.url = truncateUtf8(o.url || '', room);
		}
	}

	if (!bodyStr) return squeezePushPayload(o, max);

	var lo = 0;
	var hi = utf8ByteLength(bodyStr) + 8;
	var bestBody = '';
	while (lo <= hi) {
		var mid = Math.floor((lo + hi) / 2);
		var piece = truncateUtf8(bodyStr, mid);
		var trial = { title: o.title };
		if (o.url) trial.url = o.url;
		if (o.tag) trial.tag = o.tag;
		trial.body = piece;
		if (jsonSize(trial) <= max) {
			bestBody = piece;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	if (bestBody) o.body = bestBody;
	return squeezePushPayload(o, max);
}

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

/** maxLen: optional character cap; omit for no pre-truncation (Web Push bytes capped in sendWebPush). */
function itemsAsNotificationBody(items, maxLen) {
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
	if (maxLen != null && maxLen > 0 && s.length > maxLen) {
		s = s.slice(0, Math.max(0, maxLen - 1)) + '…';
	}
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

	var toSend = payloadObj;
	if (typeof payloadObj === 'object' && payloadObj !== null) {
		toSend = fitWebPushPayloadObj(payloadObj);
	} else if (typeof payloadObj === 'string') {
		if (utf8ByteLength(payloadObj) > WEB_PUSH_MAX_PAYLOAD_BYTES) {
			toSend = truncateUtf8(payloadObj, WEB_PUSH_MAX_PAYLOAD_BYTES);
		}
	}
	var payload = typeof toSend === 'string' ? toSend : JSON.stringify(toSend);
	var payloadUtf8 = utf8ByteLength(payload);

	dbg.pushNotifyDebugLog('sendWebPush_relay', {
		rowId: subRec.id,
		subscriberId: subRec.getString('subscriber'),
		ep: dbg.pushEndpointShort(endpoint),
		relay: RELAY_PUSH_URL,
		payloadChars: payload.length,
		payloadUtf8Bytes: payloadUtf8
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
	var body = itemsAsNotificationBody(rec.get('items'), PUSH_ITEMS_BODY_MAX_CHARS);
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
