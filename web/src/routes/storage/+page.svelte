<script lang="ts">
	import { onMount } from 'svelte';
	import {
		pb,
		COLLECTIONS,
		nowIso,
		sortRequestsForStorage,
		storageOpenRequestsFilter
	} from '$lib/pb_client';
	import { formatPbClientError, logPbError, pbErrorSuggestsOffline } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord, storageIdFromRecord } from '$lib/auth';
	import { getDeviceNickname } from '$lib/device_nickname';
	import { notifyNewPendingRequest } from '$lib/notifications';
	import { parseQuickItems, summarizeItems } from '$lib/items';
	import { formatPbDateTime, elapsedHhMmSsSince, parsePbDate, parseRequestTimestamp } from '$lib/dates';
	import { registerRealtimeCleanup } from '$lib/logout_hooks';
	import type { RecordModel } from 'pocketbase';
	import type { StockRequestRecord, StorageHubRecord } from '$lib/types';
	import { connection } from '$lib/connection.svelte';

	const JOIN_STORAGE_KEY = 'letztesbier_join_storage';

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
	let doneOpen = $state(false);
	let settingsOpen = $state(false);
	let joinMismatch = $state(false);

	let settingsLines = $state('');
	let settingsBusy = $state(false);
	let settingsErr = $state('');
	let settingsOk = $state(false);

	const role = $derived(roleFromRecord(record));
	const hubExpand = $derived(record?.expand?.storage as { name?: string } | undefined);
	const hubDisplayName = $derived(hubExpand?.name ?? 'Your hub');

	function syncAuth() {
		authValid = pb().authStore.isValid;
		record = pb().authStore.record;
	}

	async function refreshList() {
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'storage') return;
		const sid = storageIdFromRecord(pb().authStore.record);
		if (!sid) {
			listError = 'No storage hub assigned to your account. Ask an admin to set your user’s storage.';
			requests = [];
			return;
		}
		listError = '';
		try {
			const list = await pb()
				.collection(COLLECTIONS.requests)
				.getFullList<StockRequestRecord>({
					requestKey: null,
					sort: 'id',
					filter: storageOpenRequestsFilter(sid),
					perPage: 500
				});
			requests = sortRequestsForStorage(list);
			connection.reconnecting = false;
		} catch (e) {
			logPbError('storage.refreshList', e);
			listError = formatPbClientError(e);
			if (pbErrorSuggestsOffline(e)) connection.reconnecting = true;
		}
	}

	async function loadSettingsDraft() {
		settingsErr = '';
		const sid = storageIdFromRecord(pb().authStore.record);
		if (!sid) {
			settingsLines = '';
			return;
		}
		try {
			const row = await pb().collection(COLLECTIONS.storages).getOne<StorageHubRecord>(sid);
			settingsLines = parseQuickItems(row.quick_items).join('\n');
		} catch (e) {
			logPbError('storage.loadSettings', e);
			settingsErr = formatPbClientError(e);
		}
	}

	async function saveSettings(e: Event) {
		e.preventDefault();
		settingsErr = '';
		settingsOk = false;
		const sid = storageIdFromRecord(pb().authStore.record);
		if (!sid) {
			settingsErr = 'No hub assigned.';
			return;
		}
		const lines = settingsLines
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		settingsBusy = true;
		try {
			await pb().collection(COLLECTIONS.storages).update(sid, { quick_items: lines });
			settingsOk = true;
			setTimeout(() => {
				settingsOk = false;
			}, 2500);
		} catch (e) {
			logPbError('storage.saveSettings', e);
			settingsErr = formatPbClientError(e);
		} finally {
			settingsBusy = false;
		}
	}

	async function login(e: Event) {
		e.preventDefault();
		err = '';
		loading = true;
		try {
			await pb()
				.collection(COLLECTIONS.users)
				.authWithPassword(email.trim(), password, { expand: 'storage' });
			syncAuth();
			const sid = storageIdFromRecord(pb().authStore.record);
			const expect = sessionStorage.getItem(JOIN_STORAGE_KEY);
			joinMismatch = Boolean(expect && sid && expect !== sid);
			await loadSettingsDraft();
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
		const nick = getDeviceNickname();
		busyId = r.id;
		try {
			await pb().collection(COLLECTIONS.requests).update(r.id, {
				status: 'done',
				completed_at: nowIso(),
				done_by_nickname: nick || ''
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
		const mySid = storageIdFromRecord(pb().authStore.record);
		if (!mySid) return;
		unsub = await pb()
			.collection(COLLECTIONS.requests)
			.subscribe<StockRequestRecord>('*', (ev) => {
				const r = ev.record;
				if (r.storage !== mySid) return;
				void refreshList();
				if (ev.action === 'create' && r.status === 'pending') {
					notifyNewPendingRequest(r.id, r.bar_name, r.bar_device_nickname, r.items);
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
				settingsLines = '';
			}
		}, true);

		void pb()
			.collection(COLLECTIONS.users)
			.authRefresh({ expand: 'storage' })
			.then(async () => {
				syncAuth();
				const sid = storageIdFromRecord(pb().authStore.record);
				const expect = sessionStorage.getItem(JOIN_STORAGE_KEY);
				joinMismatch = Boolean(expect && sid && expect !== sid);
				if (pb().authStore.isValid && roleFromRecord(pb().authStore.record) === 'storage') {
					await loadSettingsDraft();
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
	const doneRequestsSorted = $derived(
		[...requests.filter((r) => r.status === 'done')].sort((a, b) => {
			const ta = parsePbDate(a.completed_at)?.getTime() ?? 0;
			const tb = parsePbDate(b.completed_at)?.getTime() ?? 0;
			if (tb !== ta) return tb - ta;
			return b.id.localeCompare(a.id);
		})
	);
</script>

{#if joinMismatch}
	<div class="mb-4 rounded-lg border border-amber-700 bg-amber-950/50 p-4 text-amber-200">
		Your account is not linked to this device&rsquo;s storage join link. Use the link your admin sent, or
		ask for an account update.
	</div>
{/if}

{#if !authValid || role !== 'storage'}
	<h1 class="mb-2 text-3xl font-bold text-amber-300">Lager</h1>
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
	<h1 class="mb-4 flex flex-wrap items-baseline gap-x-3">
		<span class="text-3xl font-bold text-amber-300">Lager</span>
		<span class="text-xl text-zinc-300">"{hubDisplayName}"</span>
	</h1>

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
		<h2 class="mb-3 text-2xl font-semibold text-amber-200">Pending</h2>
		<ul class="space-y-4">
			{#each pending as r}
				<li class="rounded-2xl border-2 border-amber-700/60 bg-zinc-900/50 p-4">
					<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-2xl font-semibold text-zinc-100">
								{r.bar_name}{#if r.bar_device_nickname?.trim()}
									<span class="font-normal text-amber-200/90">
										&nbsp;({r.bar_device_nickname.trim()})</span
									>
								{/if}
							</p>
							<p
								class="text-xs uppercase tracking-wide text-zinc-500"
								title={formatPbDateTime(r.requested_at)}
							>
								Requested {elapsedHhMmSsSince(parseRequestTimestamp(r), nowMs)} ago
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
		<h2 class="mb-3 text-2xl font-semibold text-sky-200">Accepted</h2>
		<ul class="space-y-4">
			{#each accepted as r}
				<li class="rounded-2xl border-2 border-sky-800/60 bg-zinc-900/50 p-4">
					<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-xl font-medium text-zinc-100">
								{r.bar_name}{#if r.bar_device_nickname?.trim()}
									<span class="font-normal text-amber-200/90">
										&nbsp;({r.bar_device_nickname.trim()})</span
									>
								{/if}
							</p>
							{#if r.accepted_by_nickname?.trim()}
								{@const acceptedAt = parsePbDate(r.accepted_at)}
								<p class="mb-1 text-sm text-sky-300" title={formatPbDateTime(r.accepted_at)}>
									Accepted by {r.accepted_by_nickname.trim()}{#if acceptedAt}
										{' '}· {elapsedHhMmSsSince(acceptedAt, nowMs)} ago
									{/if}
								</p>
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

	{#if doneRequestsSorted.length > 0}
		<details
			class="mt-4 rounded-2xl border border-zinc-700 bg-zinc-900/20 [&_summary::-webkit-details-marker]:hidden"
			bind:open={doneOpen}
		>
			<summary
				class="cursor-pointer select-none list-none px-4 py-3 text-xl font-medium text-zinc-300"
			>
				{doneOpen ? '⏷' : '⏵'} Done items ({doneRequestsSorted.length})
			</summary>
			<ul class="space-y-4 border-t border-zinc-700 px-4 pb-4 pt-4">
				{#each doneRequestsSorted as r}
					<li class="rounded-2xl border border-zinc-700 bg-zinc-900/30 p-4">
						<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
							<div>
								<p class="text-xl font-medium text-zinc-100">
									{r.bar_name}{#if r.bar_device_nickname?.trim()}
										<span class="font-normal text-amber-200/90">
											({r.bar_device_nickname.trim()})</span>
									{/if}
								</p>
								{#if r.accepted_by_nickname?.trim()}
									<p class="mb-1 text-sm text-sky-300">
										Accepted by {r.accepted_by_nickname.trim()}
									</p>
								{/if}
								{#if r.done_by_nickname?.trim()}
									<p class="mb-1 text-sm text-emerald-300">
										Done by {r.done_by_nickname.trim()}
									</p>
								{/if}
							</div>
							<span
								class="cursor-default text-sm text-zinc-500"
								title={formatPbDateTime(r.completed_at)}
							>
								Completed {elapsedHhMmSsSince(parsePbDate(r.completed_at), nowMs)} ago
							</span>
						</div>
						<p class="text-xl text-zinc-200">{summarizeItems(r.items, 300)}</p>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	<details
		class="mt-12 max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900/30 [&_summary::-webkit-details-marker]:hidden"
		bind:open={settingsOpen}
	>
		<summary
			class="cursor-pointer select-none list-none px-6 py-3 text-xl font-semibold text-zinc-200"
		>
			{settingsOpen ? '⏷' : '⏵'} Settings
		</summary>
		<div class="space-y-4 border-t border-zinc-700 px-6 pb-6 pt-4">
			<p class="text-sm text-zinc-500">
				One label per line. These lines appear as quick-add buttons on bar devices (together with other hubs).
				Hub name and hub order are managed in the admin dashboard.
			</p>
			{#if settingsErr}
				<p class="text-sm text-red-300">{settingsErr}</p>
			{/if}
			{#if settingsOk}
				<p class="text-sm text-emerald-400">Saved.</p>
			{/if}
			<form class="space-y-3" onsubmit={saveSettings}>
				<label class="block">
					<span class="mb-1 block text-sm text-zinc-400">Quick item labels</span>
					<textarea
						bind:value={settingsLines}
						rows="12"
						class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200"
						placeholder="One label per line"
					></textarea>
				</label>
				<button
					type="submit"
					disabled={settingsBusy}
					class="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
				>
					{settingsBusy ? 'Saving…' : 'Save quick items'}
				</button>
			</form>
		</div>
	</details>
{/if}
