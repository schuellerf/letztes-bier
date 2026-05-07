import { browser } from '$app/environment';

export const connection = $state({
	online: true,
	reconnecting: false
});

if (browser) {
	connection.online = navigator.onLine;
	window.addEventListener('online', () => {
		connection.online = true;
		connection.reconnecting = false;
	});
	window.addEventListener('offline', () => {
		connection.online = false;
		connection.reconnecting = true;
	});
}
