<script lang="ts">
	import { onMount } from 'svelte';
	import { pb, COLLECTIONS, nowIso, sortRequestsForStorage, storageOpenRequestsFilter } from '$lib/pb_client';
	import { formatPbClientError, logPbError, pbErrorSuggestsOffline } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord } from '$lib/auth';
	import { getDeviceNickname } from '$lib/device_nickname';
	import { notifyNewPendingRequest } from '$lib/notifications';
	import { summarizeItems } from '$lib/items';
	import { formatPbDateTime, elapsedHhMmSsSince, parsePbDate } from '$lib/dates';
	import { registerRealtimeCleanup } from '$lib/logout_hooks';
	import type { RecordModel } from 'pocketbase';
	import type { StockRequestRecord } from '$lib/types';
	import { connection } from '$lib/connection.svelte';

	let email = $state('');
	let password = $state('');
	let err = $state('');
	let loading = $state(false);
	let listError = $state('');
	let requests = $state<StockRequestRecord[]>([]);
	let busyId = $state<string | null>(null);

	let authValid = $state(false);
	let record = $state<RecordModel | null>(null);
	let unsub: null | (() => void) = null;
	let nowMs = $state(Date.now());

	const role = $derived(roleFromRecord(record));

	function syncAuth() {
		authValid = pb().authStore.isValid;
		record = pb().authStore.record;
	}

	async function refreshList() {
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'storage') return;
		listError = '';
		try {
			const list = await pb()
				.collection(COLLECTIONS.requests)
				.getFullList<StockRequestRecord>({
					requestKey: null,
					// Client reorders by `created`; server may reject sort=created.
					sort: 'id',
					filter: storageOpenRequestsFilter(),
					perPage: 500,
					fields: [
						'id',
						'created',
						'updated',
						'bar',
						'bar_name',
						'items',
						'status',
						'accepted_at',
						'completed_at',
						'bar_device_nickname',
						'accepted_by_nickname'
					].join(',')
				});
			requests = sortRequestsForStorage(list);
			connection.reconnecting = false;
		} catch (e) {
			logPbError('storage.refreshList', e);
			listError = formatPbClientError(e);
			if (pbErrorSuggestsOffline(e)) connection.reconnecting = true;
		}
	}

	async function login(e: Event) {
		e.preventDefault();
		err = '';
		loading = true;
		try {
			await pb().collection(COLLECTIONS.users).authWithPassword(email.trim(), password);
			syncAuth();
			await bindRealtime();
			await refreshList();
		} catch (e) {
			logPbError('storage.login', e);
			err = formatPbClientError(e);
		} finally {
			loading = false;
		}
	}

	async function acceptRequest(r: StockRequestRecord) {
		if (r.status !== 'pending') return;
		const nick = getDeviceNickname();
		busyId = r.id;
		try {
			await pb().collection(COLLECTIONS.requests).update(r.id, {
				status: 'accepted',
				accepted_at: nowIso(),
				accepted_by_nickname: nick || ''
			});
			await refreshList();
		} catch (e) {
			logPbError('storage.acceptRequest', e);
			err = formatPbClientError(e);
		} finally {
			busyId = null;
		}
	}

	async function doneRequest(r: StockRequestRecord) {
		if (r.status !== 'accepted') return;
		busyId = r.id;
		try {
			await pb().collection(COLLECTIONS.requests).update(r.id, {
				status: 'done',
				completed_at: nowIso()
			});
			await refreshList();
		} catch (e) {
			logPbError('storage.doneRequest', e);
			err = formatPbClientError(e);
		} finally {
			busyId = null;
		}
	}

	async function bindRealtime() {
		if (unsub) {
			unsub();
			unsub = null;
		}
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'storage') return;
		unsub = await pb()
			.collection(COLLECTIONS.requests)
			.subscribe<StockRequestRecord>('*', (ev) => {
				void refreshList();
				if (ev.action === 'create') {
					const r = ev.record;
					if (r.status === 'pending') {
						notifyNewPendingRequest(r.id, r.bar_name, r.bar_device_nickname, r.items);
					}
				}
			});
	}

	onMount(() => {
		const clock = setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		const removeCleanup = registerRealtimeCleanup(() => {
			if (unsub) {
				unsub();
				unsub = null;
			}
		});

		syncAuth();
		const unsubAuth = pb().authStore.onChange(() => {
			syncAuth();
			if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'storage') {
				if (unsub) {
					unsub();
					unsub = null;
				}
				requests = [];
				listError = '';
			}
		}, true);

		void pb()
			.collection(COLLECTIONS.users)
			.authRefresh()
			.then(async () => {
				syncAuth();
				if (pb().authStore.isValid && roleFromRecord(pb().authStore.record) === 'storage') {
					await refreshList();
					await bindRealtime();
				}
			})
			.catch(() => {});

		return () => {
			clearInterval(clock);
			removeCleanup();
			unsubAuth();
			if (unsub) unsub();
		};
	});

	const pending = $derived(requests.filter((r) => r.status === 'pending'));
	const accepted = $derived(requests.filter((r) => r.status === 'accepted'));
</script>

<h1 class="mb-2 text-3xl font-bold text-amber-300">Storage hub</h1>

{#if !authValid || role !== 'storage'}
	{#if authValid && role !== 'storage'}
		<WrongRoleHint expected="storage" current={role} />
	{/if}
	<form class="max-w-md space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/40 p-6" onsubmit={login}>
		<p class="text-zinc-400">Sign in with a <strong class="text-zinc-200">storage</strong> account.</p>
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
{:else}
	{#if listError}
		<div
			class="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-200"
			role="alert"
		>
			{listError}
		</div>
	{/if}

	{#if err}
		<p class="mb-4 text-red-400">{err}</p>
	{/if}

	<section class="mb-10">
		<h2 class="mb-3 text-2xl font-semibold text-amber-200">Pending (oldest first)</h2>
		<ul class="space-y-4">
			{#each pending as r}
				<li class="rounded-2xl border-2 border-amber-700/60 bg-zinc-900/50 p-4">
					<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
						<div>
							<p
								class="text-xs uppercase tracking-wide text-zinc-500"
								title={formatPbDateTime(r.created)}
							>
								Requested {elapsedHhMmSsSince(parsePbDate(r.created), nowMs)} ago
							</p>
							<p class="text-2xl font-semibold text-zinc-100">
								{r.bar_name}{#if r.bar_device_nickname?.trim()}
									<span class="font-normal text-amber-200/90">
										({r.bar_device_nickname.trim()})</span
									>
								{/if}
							</p>
						</div>
						<div class="flex flex-col items-end gap-2">
							<button
								type="button"
								disabled={busyId === r.id}
								class="min-h-[52px] min-w-[180px] rounded-xl bg-sky-600 px-6 py-4 text-xl font-bold text-white hover:bg-sky-500 disabled:opacity-50"
								onclick={() => acceptRequest(r)}
							>
								Accept
							</button>
						</div>
					</div>
					<p class="text-xl text-zinc-200">{summarizeItems(r.items, 300)}</p>
				</li>
			{:else}
				<li class="text-zinc-500">No pending requests.</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="mb-3 text-2xl font-semibold text-sky-200">Accepted (working on)</h2>
		<ul class="space-y-4">
			{#each accepted as r}
				<li class="rounded-2xl border-2 border-sky-800/60 bg-zinc-900/50 p-4">
					<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-xl font-medium text-zinc-100">
								{r.bar_name}{#if r.bar_device_nickname?.trim()}
									<span class="font-normal text-amber-200/90">
										({r.bar_device_nickname.trim()})</span
									>
								{/if}
							</p>
							{#if r.accepted_by_nickname}
								<p class="text-zinc-400">Accepted by {r.accepted_by_nickname}</p>
							{/if}
						</div>
						<button
							type="button"
							disabled={busyId === r.id}
							class="min-h-[52px] min-w-[180px] rounded-xl bg-emerald-600 px-6 py-4 text-xl font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
							onclick={() => doneRequest(r)}
						>
							Done
						</button>
					</div>
					<p class="text-xl text-zinc-200">{summarizeItems(r.items, 300)}</p>
				</li>
			{:else}
				<li class="text-zinc-500">Nothing in progress.</li>
			{/each}
		</ul>
	</section>
{/if}
