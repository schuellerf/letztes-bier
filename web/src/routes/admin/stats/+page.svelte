<script lang="ts">
	import { onMount } from 'svelte';
	import { pb, COLLECTIONS } from '$lib/pb_client';
	import { formatPbClientError, logPbError } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord } from '$lib/auth';
	import { parsePbDate } from '$lib/dates';
	import type { RecordModel } from 'pocketbase';
	import type { StockRequestRecord } from '$lib/types';

	let email = $state('');
	let password = $state('');
	let err = $state('');
	let loading = $state(false);
	let loaded = $state(false);

	let authValid = $state(false);
	let record = $state<RecordModel | null>(null);

	const role = $derived(roleFromRecord(record));

	let perBar = $state<Record<string, number>>({});
	let durationsPickMin = $state<number[]>([]);
	let durationsTotal = $state<number[]>([]);
	let peakHours = $state<number[]>(Array(24).fill(0));

	function syncAuth() {
		authValid = pb().authStore.isValid;
		record = pb().authStore.record;
	}

	function median(sorted: number[]) {
		if (sorted.length === 0) return null;
		const m = Math.floor(sorted.length / 2);
		if (sorted.length % 2) return sorted[m];
		return (sorted[m - 1] + sorted[m]) / 2;
	}

	function mean(arr: number[]) {
		if (!arr.length) return null;
		return arr.reduce((a, b) => a + b, 0) / arr.length;
	}

	async function login(e: Event) {
		e.preventDefault();
		err = '';
		loading = true;
		try {
			await pb().collection(COLLECTIONS.users).authWithPassword(email.trim(), password);
			syncAuth();
			await loadStats();
		} catch (e) {
			logPbError('admin.login', e);
			err = formatPbClientError(e);
		} finally {
			loading = false;
		}
	}

	async function loadStats() {
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'admin') return;
		err = '';
		try {
			const items = await pb()
				.collection(COLLECTIONS.requests)
				.getFullList<StockRequestRecord>({ perPage: 500, sort: '-id', requestKey: null });

			const barCounts: Record<string, number> = {};
			const pickMs: number[] = [];
			const totalMs: number[] = [];
			const hours = Array(24).fill(0);

			for (const r of items) {
				barCounts[r.bar_name] = (barCounts[r.bar_name] ?? 0) + 1;
				const cDate = parsePbDate(r.requested_at);
				if (!cDate) continue;
				const c = cDate.getTime();
				const h = cDate.getHours();
				hours[h]++;

				if (r.status === 'done' && r.accepted_at) {
					const a = parsePbDate(r.accepted_at);
					if (a) pickMs.push(a.getTime() - c);
				}
				if (r.status === 'done' && r.completed_at) {
					const d = parsePbDate(r.completed_at);
					if (d) totalMs.push(d.getTime() - c);
				}
			}

			pickMs.sort((a, b) => a - b);
			totalMs.sort((a, b) => a - b);
			perBar = barCounts;
			durationsPickMin = pickMs.map((ms) => ms / 60000);
			durationsTotal = totalMs.map((ms) => ms / 60000);
			peakHours = hours;
			loaded = true;
		} catch (e) {
			logPbError('admin.loadStats', e);
			err = formatPbClientError(e);
			loaded = false;
		}
	}

	onMount(() => {
		syncAuth();
		const off = pb().authStore.onChange(() => syncAuth(), true);
		void pb()
			.collection(COLLECTIONS.users)
			.authRefresh()
			.then(async () => {
				syncAuth();
				if (pb().authStore.isValid && roleFromRecord(pb().authStore.record) === 'admin') {
					await loadStats();
				}
			})
			.catch(() => {});

		return () => off();
	});

	const peakIdx = $derived(
		peakHours.length ? peakHours.indexOf(Math.max(...peakHours)) : 0
	);
</script>

<h1 class="mb-2 text-3xl font-bold text-amber-300">Admin statistics</h1>

{#if !authValid || role !== 'admin'}
	{#if authValid && role !== 'admin'}
		<WrongRoleHint expected="admin" current={role} />
	{/if}
	<form class="max-w-md space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/40 p-6" onsubmit={login}>
		<p class="text-zinc-400">Sign in with an <strong class="text-zinc-200">admin</strong> account.</p>
		<div>
			<label class="mb-1 block text-sm text-zinc-400" for="em">Email</label>
			<input
				id="em"
				class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-3 text-xl"
				autocomplete="username"
				bind:value={email}
			/>
		</div>
		<div>
			<label class="mb-1 block text-sm text-zinc-400" for="pw">Password</label>
			<input
				id="pw"
				type="password"
				class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-3 text-xl"
				autocomplete="current-password"
				bind:value={password}
			/>
		</div>
		{#if err}
			<p class="text-red-400">{err}</p>
		{/if}
		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-xl bg-amber-500 py-4 text-xl font-bold text-black disabled:opacity-50"
		>
			{loading ? '…' : 'Sign in'}
		</button>
	</form>
	<p class="mt-6 text-sm text-zinc-500">
		OAuth (e.g. Google) can be enabled in PocketBase Admin; this screen uses email/password for staff
		admins.
	</p>
{:else}
	<div class="mb-4 flex flex-wrap items-center gap-4">
		<button
			type="button"
			class="rounded-lg bg-zinc-800 px-4 py-2 text-zinc-200 hover:bg-zinc-700"
			onclick={() => void loadStats()}
		>
			Refresh
		</button>
	</div>

	{#if err}
		<p class="mb-4 text-red-400" role="alert">{err}</p>
	{/if}

	{#if loaded}
		<section class="mb-8">
			<h2 class="mb-2 text-xl font-semibold text-zinc-200">Requests per bar</h2>
			<ul class="space-y-1 text-zinc-300">
				{#each Object.entries(perBar).sort((a, b) => b[1] - a[1]) as [name, count]}
					<li class="flex justify-between border-b border-zinc-800 py-2">
						<span>{name}</span>
						<span class="font-mono text-amber-300">{count}</span>
					</li>
				{:else}
					<li>No data yet.</li>
				{/each}
			</ul>
		</section>

		<section class="mb-8">
			<h2 class="mb-2 text-xl font-semibold text-zinc-200">
				Fulfillment times (completed requests only, minutes)
			</h2>
			<p class="text-zinc-400">
				Until accepted: mean {mean(durationsPickMin)?.toFixed(1) ?? '—'}, median {median([...durationsPickMin])?.toFixed(1) ?? '—'}
			</p>
			<p class="text-zinc-400">
				Until done: mean {mean(durationsTotal)?.toFixed(1) ?? '—'}, median {median([...durationsTotal])?.toFixed(1) ?? '—'}
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-xl font-semibold text-zinc-200">Peak request hours (requested_at, local TZ)</h2>
			<p class="mb-2 text-zinc-500">Busiest hour: {peakIdx}:00 &ndash; {peakIdx + 1}:00</p>
			<div class="flex h-40 items-end gap-1">
				{#each peakHours as c, i}
					<div
						class="min-w-0 flex-1 rounded-t bg-amber-600/80"
						style:height="{Math.max(4, (c / (Math.max(1, ...peakHours) || 1)) * 100)}%"
						title="{i}:00 — {c} reqs"
					></div>
				{/each}
			</div>
		</section>
	{/if}
{/if}
