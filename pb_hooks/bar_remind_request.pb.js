/// <reference path="../pb_data/types.d.ts" />

/** Bar user: Web Push to storage staff for own request ("Erinnern"). Allowed: pending or accepted. */
routerAdd(
	'POST',
	'/api/custom/bar/remind-request',
	(e) => {
		var n = require(__hooks + '/push_notify_helpers.js');
		var rate = require(__hooks + '/remind_rate_limit.js');
		var dbg = require(__hooks + '/push_notify_debug.js');

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

			dbg.pushNotifyDebugLog('bar_remind_enter', {
				requestId: rid,
				authUserId:
					typeof auth.getId === 'function' ? auth.getId() : typeof auth.id === 'string' ? auth.id : ''
			});

			var rec;
			try {
				rec = e.app.findRecordById('requests', rid);
			} catch (_) {
				throw e.notFoundError('Request not found', {});
			}

			var st = rec.getString('status');
			if (st !== 'pending' && st !== 'accepted') {
				throw e.badRequestError(
					'Erinnern ist nur für ausstehende oder übernommene Anfragen möglich.',
					{}
				);
			}

			var authBar = auth.getString('bar');
			if (!authBar || rec.getString('bar') !== authBar) {
				throw e.forbiddenError('Forbidden', {});
			}

			// Only throttle after authz checks so mistaken taps (wrong row, stale UI) do not burn the window.
			if (!rate.allow(rid, 10000)) {
				dbg.pushNotifyDebugLog('bar_remind_response', {
					requestId: rid,
					http: 429,
					message: 'rate_limit'
				});
				e.json(429, { message: 'Zu viele Erinnerungen, kurz warten.' });
				return;
			}

			dbg.pushNotifyDebugLog('bar_remind_push_start', {
				requestId: rid,
				status: rec.getString('status'),
				storageHub: rec.getString('storage')
			});

			n.pushPendingRequestNotifyStorage(e.app, rec, { reminder: true });

			dbg.pushNotifyDebugLog('bar_remind_response', {
				requestId: rid,
				http: 204,
				message: 'noContent_after_push_enqueue'
			});

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
