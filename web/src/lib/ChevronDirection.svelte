<script lang="ts">
	let {
		direction,
		class: className = ''
	}: {
		direction: 'up' | 'down' | 'left' | 'right';
		class?: string;
	} = $props();

	const d = $derived(
		(
			{
				up: 'M5 15l7-7 7 7',
				down: 'M19 9l-7 7-7-7',
				left: 'M15 19l-7-7 7-7',
				right: 'M9 5l7 7-7 7'
			} as const
		)[direction]
	);
</script>

<svg
	class={`h-5 w-5 shrink-0 text-current ${className}`}
	xmlns="http://www.w3.org/2000/svg"
	fill="none"
	viewBox="0 0 24 24"
	stroke-width="2"
	stroke="currentColor"
	aria-hidden="true"
>
	<path stroke-linecap="round" stroke-linejoin="round" d={d} />
</svg>
