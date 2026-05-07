<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';

	const JOIN_BAR_KEY = 'letztesbier_join_bar';
	const JOIN_STORAGE_KEY = 'letztesbier_join_storage';

	onMount(() => {
		const u = get(page).url;
		const barId = u.searchParams.get('bar')?.trim();
		const storageId = u.searchParams.get('storage')?.trim();
		const role = u.searchParams.get('role')?.trim();
		if (barId) {
			sessionStorage.setItem(JOIN_BAR_KEY, barId);
			goto('/bar', { replaceState: true });
			return;
		}
		if (storageId) {
			sessionStorage.setItem(JOIN_STORAGE_KEY, storageId);
			goto('/storage', { replaceState: true });
			return;
		}
		if (role) {
			sessionStorage.setItem('letztesbier_join_role_hint', role);
		}
		goto('/bar', { replaceState: true });
	});
</script>

<p class="text-zinc-400">Redirecting…</p>
