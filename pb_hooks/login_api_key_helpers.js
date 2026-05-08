/**
 * Shared helpers for users_login_api_key.pb.js — PocketBase runs each router/hook callback
 * in isolation, so logic must live here (require) not as top-level functions in the .pb.js file.
 */

var LOGIN_KEY_MIN = 24;

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

function requireAdmin(e) {
	var auth = e.auth;
	if (!auth) {
		throw e.unauthorizedError('Unauthorized', {});
	}
	if (auth.getString('role') !== 'admin') {
		throw e.forbiddenError('Forbidden', {});
	}
}

/**
 * Reject users JWT if issued before token_invalid_before.
 */
function rejectStaleUserJwtOrContinue(e) {
	var path = e.request.url.path;
	if (!path || path.indexOf('/api/') !== 0) {
		return false;
	}
	var authHeader = e.request.header.get('Authorization');
	if (!authHeader || authHeader.indexOf('Bearer ') !== 0) {
		return false;
	}
	var token = authHeader.substring('Bearer '.length).trim();
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

module.exports = {
	LOGIN_KEY_MIN: LOGIN_KEY_MIN,
	parseJsonBody: parseJsonBody,
	randomLoginApiKey: randomLoginApiKey,
	keysEqual: keysEqual,
	createAuthSignal: createAuthSignal,
	requireAdmin: requireAdmin,
	rejectStaleUserJwtOrContinue: rejectStaleUserJwtOrContinue
};
