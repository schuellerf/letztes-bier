/// <reference path="../pb_data/types.d.ts" />

var rate = require(__hooks + '/login_api_key_rate_limit.js');

var LOGIN_KEY_MIN = 24;
var RATE_WINDOW_MS = 60000;
var RATE_MAX = 40;

function parseJsonBody(e) {
	var raw = '';
	try {
		raw = toString(e.request.body);
	} catch (_) {
		raw = '';
	}
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch (_) {
		return {};
	}
}

function randomLoginApiKey() {
	return $security.randomString(48);
}

function keysEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a.length !== b.length) return false;
	var ok = 0;
	for (var i = 0; i < a.length; i++) {
		ok |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return ok === 0;
}

function createAuthSignal(app, userId, action) {
	var col = app.findCollectionByNameOrId('auth_signals');
	var rec = new Record(col);
	rec.set('user', userId);
	rec.set('action', action);
	app.save(rec);
}

/**
 * Reject @request.auth users JWT if issued before token_invalid_before.
 * @returns {boolean} true if handled (caller should not continue), false to call e.next()
 */
function rejectStaleUserJwtOrContinue(e) {
	var path = e.request.url.path;
	if (!path || path.indexOf('/api/') !== 0) {
		return false;
	}
	var h = e.request.header.get('Authorization');
	if (!h || h.indexOf('Bearer ') !== 0) {
		return false;
	}
	var token = h.substring('Bearer '.length).trim();
	if (!token) {
		return false;
	}
	var authRec;
	try {
		authRec = e.app.findAuthRecordByToken(token, 'auth');
	} catch (_) {
		return false;
	}
	if (!authRec) {
		return false;
	}
	var coll = authRec.collection();
	if (!coll || coll.name !== 'users') {
		return false;
	}
	var rawCut = authRec.get('token_invalid_before');
	if (!rawCut) {
		return false;
	}
	var cutMs = new Date(String(rawCut)).getTime();
	if (isNaN(cutMs)) {
		return false;
	}
	var claims;
	try {
		claims = $security.parseUnverifiedJWT(token);
	} catch (_) {
		return false;
	}
	var iat = claims.iat;
	if (iat === undefined || iat === null) {
		return false;
	}
	var iatSec = typeof iat === 'number' ? iat : Number(iat);
	if (isNaN(iatSec)) {
		return false;
	}
	var iatMs = iatSec * 1000;
	if (iatMs < cutMs) {
		throw e.unauthorizedError('Session invalidated.', {});
	}
	return false;
}

routerUse((e) => {
	try {
		rejectStaleUserJwtOrContinue(e);
	} catch (outer) {
		if (outer != null && typeof outer === 'object' && typeof outer.status === 'number') {
			throw outer;
		}
		console.warn('login_api_key routerUse:', outer);
	}
	return e.next();
});

onRealtimeSubscribeRequest((e) => {
	try {
		if (!e.request || !e.request.url) {
			e.next();
			return;
		}
		rejectStaleUserJwtOrContinue(e);
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

			var body = parseJsonBody(e);
			var identity = typeof body.identity === 'string' ? body.identity.trim() : '';
			var apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
			if (!identity || !apiKey || apiKey.length < LOGIN_KEY_MIN) {
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
			if (!stored || stored.length < LOGIN_KEY_MIN) {
				throw e.unauthorizedError('Invalid credentials.', {});
			}
			if (!keysEqual(apiKey, stored)) {
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

function requireAdmin(e) {
	var auth = e.auth;
	if (!auth) {
		throw e.unauthorizedError('Unauthorized', {});
	}
	if (auth.getString('role') !== 'admin') {
		throw e.forbiddenError('Forbidden', {});
	}
}

routerAdd(
	'POST',
	'/api/custom/admin/ensure-user-login-api-key',
	(e) => {
		try {
			requireAdmin(e);

			var body = parseJsonBody(e);
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
			if (!existing || existing.length < LOGIN_KEY_MIN) {
				rec.set('login_api_key', randomLoginApiKey());
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
		try {
			requireAdmin(e);

			var body = parseJsonBody(e);
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
			rec.set('login_api_key', randomLoginApiKey());
			e.app.save(rec);

			createAuthSignal(e.app, userId, 'logout');

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
