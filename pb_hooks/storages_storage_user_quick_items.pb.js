/// <reference path="../pb_data/types.d.ts" />

/**
 * App `storage` role may only edit `quick_items` on their hub; `name` and `sort` stay admin-controlled.
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
		rec.set('sort', orig.getFloat('sort'));
		e.next();
	},
	'storages'
);
