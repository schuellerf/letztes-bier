<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pb, COLLECTIONS } from '$lib/pb_client';
	import { formatPbClientError, logPbError } from '$lib/pb_errors';
	import { roleFromRecord, homePathForRole } from '$lib/auth';

	let err = $state('');
	let busy = $state(true);

	onMount(() => {
		const email = page.url.searchParams.get('email')?.trim() ?? '';
		const password = page.url.searchParams.get('password') ?? '';

		if (!email || !password) {
			err = 'Missing email or password in link.';
			busy = false;
			return;
		}

		void (async () => {
			try {
				await pb()
					.collection(COLLECTIONS.users)
					.authWithPassword(email, password, { expand: 'bar' });
				replacePathWithoutQuery();
				const role = roleFromRecord(pb().authStore.record);
				await goto(homePathForRole(role), { replaceState: true });
			} catch (e) {
				logPbError('quickLogin', e);
				err = formatPbClientError(e);
				replacePathWithoutQuery();
				busy = false;
			}
		})();
	});

	function replacePathWithoutQuery() {
		if (typeof window === 'undefined') return;
		const path = page.url.pathname;
		window.history.replaceState(window.history.state, '', path);
	}
</script>

<div class="mx-auto max-w-md rounded-xl border border-zinc-700 bg-zinc-900/40 p-6">
	<h1 class="mb-3 text-2xl font-bold text-amber-300">Signing in…</h1>
	{#if err}
		<p class="text-red-400" role="alert">{err}</p>
		<p class="mt-4 text-sm text-zinc-500">
			Use a valid quick-login link from the admin Users page, or sign in normally from Bar / Storage /
			Stats.
		</p>
	{:else if busy}
		<p class="text-zinc-400">Please wait.</p>
	{/if}
</div>
