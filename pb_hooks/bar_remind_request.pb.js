/// <reference path="../pb_data/types.d.ts" />

/** Bar user: resend pending-request push to storage staff for own request ("Erinnern"). */
routerAdd(
	'POST',
	'/api/custom/bar/remind-request',
	(e) => {
		var n = require(__hooks + '/push_notify_helpers.js');
		var rate = require(__hooks + '/remind_rate_limit.js');

		try {
			var auth = e.auth;
			if (!auth) {
				throw e.unauthorizedError('Unauthorized', {});
			}
			if (auth.getString('role') !== 'bar') {
				throw e.forbiddenError('Forbidden', {});
			}

			var raw = '';
			try {
				raw = toString(e.request.body);
			} catch (_) {
				raw = '';
			}
			var body = {};
			try {
				body = raw ? JSON.parse(raw) : {};
			} catch (_) {
				body = {};
			}
			var rid = typeof body.requestId === 'string' ? body.requestId : '';
			if (!rid) {
				throw e.badRequestError('requestId required', {});
			}

			if (!rate.allow(rid, 10000)) {
				e.json(429, { message: 'Zu viele Erinnerungen, kurz warten.' });
				return;
			}

			var rec;
			try {
				rec = e.app.findRecordById('requests', rid);
			} catch (_) {
				throw e.notFoundError('Request not found', {});
			}

			if (rec.getString('status') !== 'pending') {
				throw e.badRequestError('Request is not pending', {});
			}

			var authBar = auth.getString('bar');
			if (!authBar || rec.getString('bar') !== authBar) {
				throw e.forbiddenError('Forbidden', {});
			}

			n.pushPendingRequestNotifyStorage(e.app, rec, { reminder: true });
			e.noContent(204);
		} catch (outer) {
			if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
				throw outer;
			}
			console.warn('bar_remind_request:', outer);
			throw e.internalServerError('Failed to send reminder', {});
		}
	},
	$apis.requireAuth('users')
);
