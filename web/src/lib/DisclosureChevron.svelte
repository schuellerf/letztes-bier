<script lang="ts">
	/** When true, shows chevron-down (expanded); when false, chevron-right (collapsed). */
	let { open = false, class: className = '' }: { open?: boolean; class?: string } = $props();
</script>

{#if open}
	<svg
		class={`h-5 w-5 shrink-0 text-current ${className}`}
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="2"
		stroke="currentColor"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
	</svg>
{:else}
	<svg
		class={`h-5 w-5 shrink-0 text-current ${className}`}
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="2"
		stroke="currentColor"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
	</svg>
{/if}
