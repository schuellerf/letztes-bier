/// <reference path="../pb_data/types.d.ts" />

/** New pending request → notify storage staff for that hub.
 * Use collection-scoped hook: onRecordAfterCreateSuccess on `requests` cancels
 * clients' realtime connections (PB 0.37.x); onCollectionAfterCreateSuccess does not.
 */
onCollectionAfterCreateSuccess((e) => {
	var n = require(__hooks + '/push_notify_helpers.js');
	try {
		n.pushPendingRequestNotifyStorage(e.app, e.record, { reminder: false });
	} catch (err) {
		console.warn('push_notify: on create:', err);
	}
}, 'requests');

/** Pending → accepted: notify bar staff. */
onCollectionAfterUpdateSuccess((e) => {
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
