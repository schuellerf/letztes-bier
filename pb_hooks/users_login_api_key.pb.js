/// <reference path="../pb_data/types.d.ts" />

routerUse((e) => {
	var h = require(__hooks + '/login_api_key_helpers.js');
	try {
		h.rejectStaleUserJwtOrContinue(e);
	} catch (outer) {
		if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
			throw outer;
		}
		console.warn('login_api_key routerUse:', outer);
	}
	return e.next();
});

onRealtimeSubscribeRequest((e) => {
	var h = require(__hooks + '/login_api_key_helpers.js');
	try {
		if (!e.request || !e.request.url) {
			e.next();
			return;
		}
		h.rejectStaleUserJwtOrContinue(e);
	} catch (outer) {
		if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
			throw outer;
		}
		console.warn('login_api_key onRealtimeSubscribeRequest:', outer);
	}
	e.next();
});

routerAdd(
	'POST',
	'/api/custom/auth/login-with-api-key',
	(e) => {
		var h = require(__hooks + '/login_api_key_helpers.js');
		var rate = require(__hooks + '/login_api_key_rate_limit.js');
		var RATE_WINDOW_MS = 60000;
		var RATE_MAX = 40;
		try {
			var ip = '';
			try {
				ip = e.realIP();
			} catch (_) {
				ip = '';
			}
			if (!rate.allow(ip, RATE_WINDOW_MS, RATE_MAX)) {
				throw e.tooManyRequestsError('Too many attempts.', {});
			}

			var body = h.parseJsonBody(e);
			var identity = typeof body.identity === 'string' ? body.identity.trim() : '';
			var apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
			if (!identity || !apiKey || apiKey.length < h.LOGIN_KEY_MIN) {
				throw e.unauthorizedError('Invalid credentials.', {});
			}

			var rec;
			try {
				rec = e.app.findAuthRecordByEmail('users', identity);
			} catch (_) {
				throw e.unauthorizedError('Invalid credentials.', {});
			}
			if (!rec) {
				throw e.unauthorizedError('Invalid credentials.', {});
			}

			var stored = rec.getString('login_api_key');
			if (!stored || stored.length < h.LOGIN_KEY_MIN) {
				throw e.unauthorizedError('Invalid credentials.', {});
			}
			if (!h.keysEqual(apiKey, stored)) {
				throw e.unauthorizedError('Invalid credentials.', {});
			}

			$apis.recordAuthResponse(e, rec, '', {});
		} catch (outer) {
			if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
				throw outer;
			}
			console.warn('login_with_api_key:', outer);
			throw e.internalServerError('Authentication failed.', {});
		}
	}
);

routerAdd(
	'POST',
	'/api/custom/admin/ensure-user-login-api-key',
	(e) => {
		var h = require(__hooks + '/login_api_key_helpers.js');
		try {
			h.requireAdmin(e);

			var body = h.parseJsonBody(e);
			var userId = typeof body.userId === 'string' ? body.userId : '';
			if (!userId) {
				throw e.badRequestError('userId required', {});
			}

			var rec;
			try {
				rec = e.app.findRecordById('users', userId);
			} catch (_) {
				throw e.notFoundError('User not found', {});
			}

			var existing = rec.getString('login_api_key');
			if (!existing || existing.length < h.LOGIN_KEY_MIN) {
				rec.set('login_api_key', h.randomLoginApiKey());
				e.app.save(rec);
			}

			e.json(200, { apiKey: rec.getString('login_api_key') });
		} catch (outer) {
			if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
				throw outer;
			}
			console.warn('ensure_user_login_api_key:', outer);
			throw e.internalServerError('Failed.', {});
		}
	},
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/custom/admin/revoke-user-login-api-key',
	(e) => {
		var h = require(__hooks + '/login_api_key_helpers.js');
		try {
			h.requireAdmin(e);

			var body = h.parseJsonBody(e);
			var userId = typeof body.userId === 'string' ? body.userId : '';
			if (!userId) {
				throw e.badRequestError('userId required', {});
			}

			var rec;
			try {
				rec = e.app.findRecordById('users', userId);
			} catch (_) {
				throw e.notFoundError('User not found', {});
			}

			rec.set('token_invalid_before', new Date().toISOString());
			rec.set('login_api_key', h.randomLoginApiKey());
			e.app.save(rec);

			h.createAuthSignal(e.app, userId, 'logout');

			e.json(200, { apiKey: rec.getString('login_api_key') });
		} catch (outer) {
			if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
				throw outer;
			}
			console.warn('revoke_user_login_api_key:', outer);
			throw e.internalServerError('Failed.', {});
		}
	},
	$apis.requireAuth('users')
);
