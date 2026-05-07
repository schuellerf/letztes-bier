<script lang="ts">
	import type { UserRole } from '$lib/types';

	type Props = {
		expected: UserRole;
		current: UserRole | null;
	};

	let { expected, current }: Props = $props();

	const roleLabel = $derived(current ?? 'unknown');
	const expectedLabel = $derived(expected);
</script>

<div
	class="mb-4 rounded-lg border border-sky-800/60 bg-sky-950/40 px-4 py-3 text-sky-100"
	role="status"
>
	<p>
		You are signed in as <strong class="text-sky-200">{roleLabel}</strong>. This view needs a
		<strong class="text-sky-200">{expectedLabel}</strong> account. Open <strong>Account</strong> in the
		header, sign out, then sign in here.
	</p>
</div>
