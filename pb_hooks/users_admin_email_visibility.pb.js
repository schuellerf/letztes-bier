/// <reference path="../pb_data/types.d.ts" />

/**
 * Include `email` in users list/view JSON for app admins (custom `role` field).
 * Without this, PocketBase omits email unless the row owner requests it, `emailVisibility`
 * is true, or the caller is a PocketBase superuser — so quick-login URL generation had no address.
 */
onRecordsListRequest(
	(e) => {
		const auth = e.auth;
		if (!auth || auth.getString('role') !== 'admin') {
			e.next();
			return;
		}
		for (const r of e.records ?? []) {
			if (r) r.ignoreEmailVisibility(true);
		}
		e.next();
	},
	'users'
);

onRecordViewRequest(
	(e) => {
		const auth = e.auth;
		if (!auth || auth.getString('role') !== 'admin') {
			e.next();
			return;
		}
		if (e.record) e.record.ignoreEmailVisibility(true);
		e.next();
	},
	'users'
);
