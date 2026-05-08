/// <reference path="../pb_data/types.d.ts" />

/** New pending request → notify storage staff for that hub. */
onRecordAfterCreateSuccess((e) => {
	var n = require(__hooks + '/push_notify_helpers.js');
	try {
		var rec = e.record;
		if (!rec) return;
		if (rec.getString('status') !== 'pending') return;

		var storageId = rec.getString('storage');
		if (!storageId) return;

		var staff;
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

		var barName = rec.getString('bar_name');
		var barNick = rec.getString('bar_device_nickname');
		var title = n.storageNotifyTitle(barName, barNick);
		var body = n.itemsAsNotificationBody(rec.get('items'));
		var payload = {
			title: title,
			body: body || undefined,
			url: '/storage',
			tag: 'request-' + rec.id
		};

		n.pushForUserIds(e.app, n.collectUserIdsFromRecords(staff), payload);
	} catch (err) {
		console.warn('push_notify: on create:', err);
	}
}, 'requests');

/** Pending → accepted: notify bar staff. */
onRecordAfterUpdateSuccess((e) => {
	var n = require(__hooks + '/push_notify_helpers.js');
	try {
		var rec = e.record;
		if (!rec) return;

		var prev;
		try {
			prev = rec.original();
		} catch (_) {
			return;
		}
		if (!prev) return;
		if (prev.getString('status') !== 'pending') return;
		if (rec.getString('status') !== 'accepted') return;

		var barId = rec.getString('bar');
		if (!barId) return;

		var staff;
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

		var who = (rec.getString('accepted_by_nickname') || '').trim() || 'Storage';
		var itemsPreview = n.summarizeItems(rec.get('items'));
		var payload = {
			title: 'Letztes Bier — übernommen (' + who + ')',
			body: itemsPreview || undefined,
			url: '/bar',
			tag: 'accepted-' + rec.id
		};

		n.pushForUserIds(e.app, n.collectUserIdsFromRecords(staff), payload);
	} catch (err) {
		console.warn('push_notify: on update:', err);
	}
}, 'requests');
