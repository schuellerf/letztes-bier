<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { pb, getPbUrl } from '$lib/pb_client';
	import { connection } from '$lib/connection.svelte';
	import UserMenu from '$lib/UserMenu.svelte';

	let { children } = $props();

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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
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
		<nav class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 text-lg">
			<div class="flex flex-wrap items-center gap-4">
				<a class="font-semibold text-amber-400 hover:text-amber-300" href="/">Letztes Bier</a>
				<a class="text-zinc-400 hover:text-zinc-200" href="/bar">Bar</a>
				<a class="text-zinc-400 hover:text-zinc-200" href="/storage">Lager</a>
				<a class="text-zinc-400 hover:text-zinc-200" href="/admin/stats">Stats</a>
				<a class="text-zinc-400 hover:text-zinc-200" href="/admin/users">Users</a>
				<a class="text-zinc-400 hover:text-zinc-200" href="/_/">Admin</a>
			</div>
			<UserMenu />
		</nav>
	</header>
	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
		{@render children()}
	</main>
	<!--<footer class="border-t border-zinc-800 bg-zinc-900/60 px-4 py-3 text-center text-sm text-zinc-500">
		Server: <code class="text-zinc-400">{getPbUrl() || '(same origin)'}</code>
	</footer>-->
</div>
