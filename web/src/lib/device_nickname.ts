import { browser } from '$app/environment';

const KEY = 'letztesbier_device_nickname';

export function getDeviceNickname(): string {
	if (!browser) return '';
	return localStorage.getItem(KEY)?.trim() || '';
}

export function setDeviceNickname(name: string) {
	if (!browser) return;
	const t = name.trim();
	if (t) localStorage.setItem(KEY, t);
	else localStorage.removeItem(KEY);
}
