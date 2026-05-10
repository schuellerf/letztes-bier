<script lang="ts">
	import './layout.css';
	import appleTouchIcon from '$lib/assets/apple-touch-icon.png';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import type { RecordModel } from 'pocketbase';
	import { pb } from '$lib/pb_client';
	import { connection } from '$lib/connection.svelte';
	import { homePathForRole, roleFromRecord } from '$lib/auth';
	import UserMenu from '$lib/UserMenu.svelte';
	import ChevronDirection from '$lib/ChevronDirection.svelte';

	let { children } = $props();

	let authValid = $state(false);
	let authRecord = $state<RecordModel | null>(null);
	let navDrawerOpen = $state(false);

	const titleHref = $derived(
		authValid ? homePathForRole(roleFromRecord(authRecord)) : '/'
	);

	onMount(() => {
		let alive = true;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const HEALTHY_MS = 20_000;
		const UNHEALTHY_MS = 1_000;

		function nextDelayMs() {
			return !connection.online || connection.reconnecting ? UNHEALTHY_MS : HEALTHY_MS;
		}

		function scheduleLoop() {
			if (timer !== undefined) clearTimeout(timer);
			if (!alive) return;
			timer = setTimeout(runLoop, nextDelayMs());
		}

		async function runLoop() {
			if (!alive) return;
			if (!connection.online) {
				connection.reconnecting = true;
				scheduleLoop();
				return;
			}
			try {
				await pb().health.check();
				if (alive) connection.reconnecting = false;
			} catch {
				if (alive) connection.reconnecting = true;
			}
			scheduleLoop();
		}

		async function pingSoon() {
			if (!alive) return;
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
			if (!connection.online) {
				connection.reconnecting = true;
				timer = setTimeout(runLoop, UNHEALTHY_MS);
				return;
			}
			try {
				await pb().health.check();
				if (alive) connection.reconnecting = false;
			} catch {
				if (alive) connection.reconnecting = true;
			}
			timer = setTimeout(runLoop, nextDelayMs());
		}

		void pingSoon();

		const onVisible = () => {
			if (document.visibilityState === 'visible') void pingSoon();
		};
		window.addEventListener('online', pingSoon);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			alive = false;
			if (timer !== undefined) clearTimeout(timer);
			window.removeEventListener('online', pingSoon);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	onMount(() => {
		let prevValid = false;
		function syncLayoutAuth() {
			const v = pb().authStore.isValid;
			if (v && !prevValid) navDrawerOpen = false;
			prevValid = v;
			authValid = v;
			authRecord = pb().authStore.record ?? null;
		}
		syncLayoutAuth();
		const off = pb().authStore.onChange(() => syncLayoutAuth(), true);
		return () => off();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
	<title>Letztes Bier</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
	{#if !connection.online || connection.reconnecting}
		<div
			class="border-b border-amber-600/40 bg-amber-950/90 px-4 py-3 text-center text-lg text-amber-100"
			role="status"
		>
			{#if !connection.online}
				You are offline. Requests may not sync.
			{:else}
				Reconnecting to server…
			{/if}
		</div>
	{/if}
	<header class="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 backdrop-blur">
		<nav
			class="mx-auto flex max-w-3xl flex-col gap-3 text-lg"
			aria-label="Hauptnavigation"
		>
			{#if authValid}
				<div class="flex w-full flex-wrap items-center justify-between gap-2">
					<a
						class="flex items-center gap-2 font-semibold text-amber-400 hover:text-amber-300"
						href={titleHref}
					>
						<img
							src={favicon}
							alt=""
							class="h-7 w-7 shrink-0"
							width="28"
							height="28"
						/>
						Letztes Bier
					</a>
					<button
						type="button"
						class="flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center border-0 bg-transparent p-1 text-zinc-200 hover:opacity-80"
						aria-expanded={navDrawerOpen}
						aria-controls="site-nav-drawer"
						onclick={() => {
							navDrawerOpen = !navDrawerOpen;
						}}
					>
						<span class="sr-only">
							{navDrawerOpen ? 'Menü ausblenden' : 'Menü anzeigen'}
						</span>
						<ChevronDirection direction={navDrawerOpen ? 'down' : 'left'} />
					</button>
				</div>
				{#if navDrawerOpen}
					<div
						id="site-nav-drawer"
						class="flex flex-col gap-3 border-t border-zinc-800 pt-3 md:flex-row md:flex-wrap md:items-start md:justify-between"
					>
						<div class="flex flex-wrap items-center gap-4">
							<a class="text-zinc-400 hover:text-zinc-200" href="/bar">Bar</a>
							<a class="text-zinc-400 hover:text-zinc-200" href="/storage">Lager</a>
							<a class="text-zinc-400 hover:text-zinc-200" href="/admin/stats">Stats</a>
							<a class="text-zinc-400 hover:text-zinc-200" href="/admin/users">Users</a>
							<a class="text-zinc-400 hover:text-zinc-200" href="/_/">Admin</a>
						</div>
						<UserMenu />
					</div>
				{/if}
			{:else}
				<div
					class="flex w-full flex-wrap items-center justify-between gap-4 md:flex-nowrap"
				>
					<div class="flex flex-wrap items-center gap-4">
						<a
							class="flex items-center gap-2 font-semibold text-amber-400 hover:text-amber-300"
							href="/"
						>
							<img
								src={favicon}
								alt=""
								class="h-7 w-7 shrink-0"
								width="28"
								height="28"
							/>
							Letztes Bier
						</a>
						<a class="text-zinc-400 hover:text-zinc-200" href="/bar">Bar</a>
						<a class="text-zinc-400 hover:text-zinc-200" href="/storage">Lager</a>
						<a class="text-zinc-400 hover:text-zinc-200" href="/admin/stats">Stats</a>
						<a class="text-zinc-400 hover:text-zinc-200" href="/admin/users">Users</a>
						<a class="text-zinc-400 hover:text-zinc-200" href="/_/">Admin</a>
					</div>
					<UserMenu />
				</div>
			{/if}
		</nav>
	</header>
	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
		{@render children()}
	</main>
</div>
