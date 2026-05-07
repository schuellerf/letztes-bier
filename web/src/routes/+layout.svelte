<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { pb } from '$lib/pb_client';
	import { connection } from '$lib/connection.svelte';

	let { children } = $props();

	onMount(() => {
		let alive = true;
		async function ping() {
			if (!connection.online) {
				connection.reconnecting = true;
				return;
			}
			try {
				await pb().health.check();
				if (alive) connection.reconnecting = false;
			} catch {
				if (alive) connection.reconnecting = true;
			}
		}
		const t = setInterval(ping, 8000);
		ping();
		return () => {
			alive = false;
			clearInterval(t);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Stock Request</title>
</svelte:head>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
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
		<nav class="mx-auto flex max-w-3xl flex-wrap items-center gap-4 text-lg">
			<a class="font-semibold text-amber-400 hover:text-amber-300" href="/">Stock Request</a>
			<a class="text-zinc-400 hover:text-zinc-200" href="/join">Join</a>
			<a class="text-zinc-400 hover:text-zinc-200" href="/bar">Bar</a>
			<a class="text-zinc-400 hover:text-zinc-200" href="/storage">Storage</a>
			<a class="text-zinc-400 hover:text-zinc-200" href="/admin/stats">Stats</a>
		</nav>
	</header>
	<main class="mx-auto max-w-3xl px-4 py-6">
		{@render children()}
	</main>
</div>
