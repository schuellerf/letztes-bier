/// <reference path="../pb_data/types.d.ts" />

/**
 * Verbose Web Push / Erinnern diagnostics (PocketBase stderr).
 * Enable: PUSH_NOTIFY_DEBUG=1
 */
var _pushNotifyDebug = null;
function pushNotifyDebugEnabled() {
	if (_pushNotifyDebug === null) {
		_pushNotifyDebug = String($os.getenv('PUSH_NOTIFY_DEBUG') || '').trim() === '1';
	}
	return _pushNotifyDebug;
}

function pushNotifyDebugLog(tag, details) {
	if (!pushNotifyDebugEnabled()) return;
	var msg = '[push_notify_debug][' + tag + ']';
	if (details !== undefined) {
		try {
			console.log(msg, typeof details === 'string' ? details : JSON.stringify(details));
		} catch (_) {
			console.log(msg, String(details));
		}
	} else {
		console.log(msg);
	}
}

/** Short fingerprint for logs (never log full push endpoint). */
function pushEndpointShort(endpoint) {
	var ep = typeof endpoint === 'string' ? endpoint : '';
	if (!ep) return '(empty)';
	if (ep.length <= 48) return ep.slice(0, 8) + '…len=' + ep.length;
	return ep.slice(0, 24) + '…' + ep.slice(-16) + ' (len=' + ep.length + ')';
}

module.exports = {
	pushNotifyDebugEnabled: pushNotifyDebugEnabled,
	pushNotifyDebugLog: pushNotifyDebugLog,
	pushEndpointShort: pushEndpointShort
};
