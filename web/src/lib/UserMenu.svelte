<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pb } from '$lib/pb_client';
	import { getDeviceNickname, setDeviceNickname } from '$lib/device_nickname';
	import { ensureNotifyPermission } from '$lib/notifications';
	import { runLogout } from '$lib/logout_hooks';

	const MENU_PATHS = new Set(['/bar', '/storage', '/admin/stats', '/admin/users']);

	let nickname = $state('');
	let open = $state(false);
	let notifyStatus = $state<NotificationPermission | 'unsupported'>('default');
	let authValid = $state(false);
	let userEmail = $state('');

	let rootEl = $state<HTMLDivElement | undefined>(undefined);

	function syncAuth() {
		authValid = pb().authStore.isValid;
		userEmail = String(pb().authStore.record?.email ?? '').trim();
	}

	const showMenu = $derived(authValid && MENU_PATHS.has(page.url.pathname));

	const notifyNotEnabled = $derived(notifyStatus !== 'granted');

	function close() {
		open = false;
	}

	async function enableNotify() {
		if (!('Notification' in window)) {
			notifyStatus = 'unsupported';
			return;
		}
		notifyStatus = await ensureNotifyPermission();
	}

	function handleSignOut() {
		close();
		runLogout();
		syncAuth();
	}

	onMount(() => {
		nickname = getDeviceNickname();
		if (!('Notification' in window)) notifyStatus = 'unsupported';
		else notifyStatus = Notification.permission;

		syncAuth();
		const offAuth = pb().authStore.onChange(() => syncAuth(), true);

		const onDocClick = (e: MouseEvent) => {
			if (!open) return;
			const t = e.target as Node;
			if (rootEl && !rootEl.contains(t)) close();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('click', onDocClick);
		document.addEventListener('keydown', onKey);

		return () => {
			offAuth();
			document.removeEventListener('click', onDocClick);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if showMenu}
	<div class="relative" bind:this={rootEl}>
		<button
			type="button"
			class="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-base text-zinc-200 hover:bg-zinc-700"
			aria-expanded={open}
			aria-haspopup="true"
			onclick={(e) => {
				e.stopPropagation();
				open = !open;
			}}
		>
			Account{#if notifyNotEnabled}&nbsp;⚠️{/if}
		</button>
		{#if open}
			<div
				class="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-zinc-600 bg-zinc-900 p-4 shadow-xl"
			>
				<label class="mb-1 block text-sm font-medium text-zinc-400" for="um-email">E-Mail</label>
				<input
					id="um-email"
					type="email"
					readonly
					tabindex="-1"
					value={userEmail}
					class="mb-4 w-full cursor-default rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-base text-zinc-300 read-only:opacity-90"
					autocomplete="off"
					aria-readonly="true"
				/>
				<label class="mb-1 block text-sm font-medium text-zinc-400" for="um-nick">Device nickname</label>
				<input
					id="um-nick"
					bind:value={nickname}
					class="mb-2 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-base text-zinc-100"
					placeholder="e.g. Anna iPad"
					autocomplete="off"
				/>
				<button
					type="button"
					class="mb-4 w-full rounded-lg bg-zinc-800 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
					onclick={() => setDeviceNickname(nickname)}
				>
					Save nickname
				</button>
				<div class="mb-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
					<button
						type="button"
						class="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-500"
						onclick={() => void enableNotify()}
					>
						Enable notifications
					</button>
					<span class="text-xs text-zinc-500">
						{#if notifyStatus === 'unsupported'}
							Not supported
						{:else if notifyStatus === 'denied'}
							Blocked in browser
						{:else if notifyStatus === 'granted'}
							On
						{:else}
							Not enabled&nbsp;⚠️
						{/if}
					</span>
				</div>
				<button
					type="button"
					class="w-full rounded-lg border border-zinc-600 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
					onclick={handleSignOut}
				>
					Sign out
				</button>
			</div>
		{/if}
	</div>
{/if}
