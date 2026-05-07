<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';

	const JOIN_BAR_KEY = 'stockreq_join_bar';

	onMount(() => {
		const u = get(page).url;
		const barId = u.searchParams.get('bar')?.trim();
		const role = u.searchParams.get('role')?.trim();
		if (barId) {
			sessionStorage.setItem(JOIN_BAR_KEY, barId);
		} else if (role) {
			sessionStorage.setItem('stockreq_join_role_hint', role);
		}
		goto('/bar', { replaceState: true });
	});
</script>

<p class="text-zinc-400">Redirecting…</p>
