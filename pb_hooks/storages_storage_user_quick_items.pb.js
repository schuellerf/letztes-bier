/// <reference path="../pb_data/types.d.ts" />

/**
 * App `storage` role may only edit `quick_items` on their hub; `name` and `hub_order` stay admin-controlled.
 */
onRecordUpdateRequest(
	(e) => {
		const auth = e.auth;
		if (!auth || auth.getString('role') !== 'storage') {
			e.next();
			return;
		}
		if (e.hasSuperuserAuth()) {
			e.next();
			return;
		}
		const rec = e.record;
		if (!rec) {
			e.next();
			return;
		}
		const orig = rec.original();
		rec.set('name', orig.getString('name'));
		rec.set('hub_order', orig.getInt('hub_order'));
		e.next();
	},
	'storages'
);
