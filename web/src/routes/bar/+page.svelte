<script lang="ts">
	import { onMount } from 'svelte';
	import {
		pb,
		COLLECTIONS,
		barRequestsFilter,
		defaultStorageId
	} from '$lib/pb_client';
	import { formatPbClientError, logPbError, pbErrorSuggestsOffline } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord, barIdFromRecord } from '$lib/auth';
	import { getDeviceNickname } from '$lib/device_nickname';
	import { notifyRequestAccepted, notifyPendingReminder } from '$lib/notifications';
	import { normalizeItems, parseQuickItems, summarizeItems } from '$lib/items';
	import { formatPbDateTime, elapsedHhMmSsSince, parsePbDate, parseRequestTimestamp } from '$lib/dates';
	import { registerRealtimeCleanup } from '$lib/logout_hooks';
	import type { RecordModel } from 'pocketbase';
	import type { StockRequestRecord, StorageHubRecord } from '$lib/types';
	import { connection } from '$lib/connection.svelte';

	const JOIN_BAR_KEY = 'letztesbier_join_bar';

	type CartLine = {
		cartKey: string;
		label: string;
		displayLabel: string;
		storageId: string;
		qty: number;
	};

	let email = $state('');
	let password = $state('');
	let err = $state('');
	let listError = $state('');
	let loading = $state(false);
	let requests = $state<StockRequestRecord[]>([]);
	let nowMs = $state(Date.now());
	let doneOpen = $state(false);
	let pickLabel = $state('');
	let pickQty = $state(1);
	let joinMismatch = $state(false);
	let notifyCooldownIds = $state<Set<string>>(new Set());

	let storagesList = $state<StorageHubRecord[]>([]);
	let storagesError = $state('');

	let authValid = $state(false);
	let record = $state<RecordModel | null>(null);
	let unsubRequests: null | (() => void) = null;

	const role = $derived(roleFromRecord(record));
	const barExpand = $derived(record?.expand?.bar as { name?: string } | undefined);
	const barDisplayName = $derived(barExpand?.name ?? 'Your bar');
	const openRequests = $derived(requests.filter((r) => r.status !== 'done'));
	const doneRequests = $derived(requests.filter((r) => r.status === 'done'));
	const doneRequestsSorted = $derived(
		[...doneRequests].sort((a, b) => {
			const ta = parsePbDate(a.completed_at)?.getTime() ?? 0;
			const tb = parsePbDate(b.completed_at)?.getTime() ?? 0;
			if (tb !== ta) return tb - ta;
			return b.id.localeCompare(a.id);
		})
	);

	const presetButtons = $derived.by(() => {
		const hubs = storagesList;
		const labelCounts = new Map<string, number>();
		for (const hub of hubs) {
			for (const label of parseQuickItems(hub.quick_items)) {
				labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
			}
		}
		const out: { storageId: string; label: string; displayLabel: string; cartKey: string }[] = [];
		for (const hub of hubs) {
			const sname = String(hub.name ?? '');
			for (const label of parseQuickItems(hub.quick_items)) {
				const dup = (labelCounts.get(label) ?? 0) > 1;
				const displayLabel = dup ? `${label} (${sname})` : label;
				out.push({
					storageId: hub.id,
					label,
					displayLabel,
					cartKey: `${hub.id}\t${label}`
				});
			}
		}
		return out;
	});

	function syncAuth() {
		authValid = pb().authStore.isValid;
		record = pb().authStore.record;
	}

	async function loadStorages() {
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'bar') return;
		storagesError = '';
		try {
			const list = await pb()
				.collection(COLLECTIONS.storages)
				.getFullList<StorageHubRecord>({
					requestKey: null,
					sort: 'hub_order,id',
					perPage: 200
				});
			storagesList = list;
		} catch (e) {
			logPbError('bar.loadStorages', e);
			storagesError = formatPbClientError(e);
			storagesList = [];
		}
	}

	async function refreshList() {
		const bid = barIdFromRecord(pb().authStore.record);
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'bar' || !bid) return;
		listError = '';
		try {
			const list = await pb()
				.collection(COLLECTIONS.requests)
				.getFullList<StockRequestRecord>({
					requestKey: null,
					sort: '-id',
					filter: barRequestsFilter(bid),
					perPage: 200
				});
			requests = list;
			connection.reconnecting = false;
		} catch (e) {
			logPbError('bar.refreshList', e);
			listError = formatPbClientError(e);
			if (pbErrorSuggestsOffline(e)) connection.reconnecting = true;
		}
	}

	async function login(e: Event) {
		e.preventDefault();
		err = '';
		loading = true;
		try {
			await pb()
				.collection(COLLECTIONS.users)
				.authWithPassword(email.trim(), password, { expand: 'bar' });
			syncAuth();
			const bid = barIdFromRecord(pb().authStore.record);
			const expect = sessionStorage.getItem(JOIN_BAR_KEY);
			joinMismatch = Boolean(expect && bid && expect !== bid);
			await loadStorages();
			await bindRealtime();
			await refreshList();
		} catch (e) {
			logPbError('bar.login', e);
			err = formatPbClientError(e);
		} finally {
			loading = false;
		}
	}

	let cart = $state<CartLine[]>([]);

	function mergeCartLines(extra: { storageId: string; label: string; displayLabel: string; qty: number }) {
		const cartKey = `${extra.storageId}\t${extra.label}`;
		const idx = cart.findIndex((l) => l.cartKey === cartKey);
		if (idx >= 0) {
			const next = [...cart];
			next[idx] = { ...next[idx], qty: next[idx].qty + extra.qty };
			cart = next;
		} else {
			cart = [
				...cart,
				{
					cartKey,
					label: extra.label,
					displayLabel: extra.displayLabel,
					storageId: extra.storageId,
					qty: extra.qty
				}
			];
		}
	}

	function togglePreset(p: { storageId: string; label: string; displayLabel: string; cartKey: string }) {
		const i = cart.findIndex((l) => l.cartKey === p.cartKey);
		if (i >= 0) {
			cart = cart.filter((_, j) => j !== i);
		} else {
			mergeCartLines({
				storageId: p.storageId,
				label: p.label,
				displayLabel: p.displayLabel,
				qty: pickQty
			});
		}
	}

	function removeCartLine(cartKey: string) {
		cart = cart.filter((l) => l.cartKey !== cartKey);
	}

	function triggerNotify(r: StockRequestRecord) {
		if (notifyCooldownIds.has(r.id)) return;
		notifyPendingReminder(r.id, r.bar_name, r.bar_device_nickname, r.items);
		notifyCooldownIds = new Set(notifyCooldownIds).add(r.id);
		const id = r.id;
		setTimeout(() => {
			const rest = new Set(notifyCooldownIds);
			rest.delete(id);
			notifyCooldownIds = rest;
		}, 10_000);
	}

	function addCustom() {
		err = '';
		const def = defaultStorageId(storagesList);
		if (!def) {
			err = 'No storage hubs available. Ask an admin to set up storages.';
			return;
		}
		const label = pickLabel.trim();
		if (!label) return;
		mergeCartLines({ storageId: def, label, displayLabel: label, qty: pickQty });
		pickLabel = '';
	}

	async function submitRequest(e: Event) {
		e.preventDefault();
		err = '';
		const bid = barIdFromRecord(pb().authStore.record);
		if (!bid) {
			err = 'No bar assigned to your account.';
			return;
		}
		if (cart.length === 0) {
			err = 'Add at least one line item.';
			return;
		}
		const nick = getDeviceNickname();
		const name =
			(pb().authStore.record?.expand?.bar as { name?: string } | undefined)?.name ?? barDisplayName;
		const groups = new Map<string, Map<string, number>>();
		const names = new Map<string, string>();
		for (const line of cart) {
			const hub = storagesList.find((s) => s.id === line.storageId);
			names.set(line.storageId, hub?.name ? String(hub.name) : 'Storage');
			const inner = groups.get(line.storageId) ?? new Map<string, number>();
			inner.set(line.label, (inner.get(line.label) ?? 0) + line.qty);
			groups.set(line.storageId, inner);
		}
		loading = true;
		try {
			for (const [storageId, labelMap] of groups) {
				const items = normalizeItems(
					[...labelMap.entries()].map(([label, qty]) => ({ label, qty }))
				);
				if (items.length === 0) continue;
				await pb().collection(COLLECTIONS.requests).create({
					bar: bid,
					bar_name: name,
					items,
					status: 'pending',
					storage: storageId,
					storage_name: names.get(storageId) ?? 'Storage',
					bar_device_nickname: nick || ''
				});
			}
			cart = [];
			pickQty = 1;
			await refreshList();
		} catch (e) {
			logPbError('bar.createRequest', e);
			err = formatPbClientError(e);
		} finally {
			loading = false;
		}
	}

	function statusLabel(s: string) {
		if (s === 'pending') return 'Pending';
		if (s === 'accepted') return 'Accepted';
		if (s === 'done') return 'Done';
		return s;
	}

	async function bindRealtime() {
		if (unsubRequests) {
			unsubRequests();
			unsubRequests = null;
		}
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'bar') return;
		unsubRequests = await pb()
			.collection(COLLECTIONS.requests)
			.subscribe<StockRequestRecord>('*', (ev) => {
				const r = ev.record;
				const myBar = barIdFromRecord(pb().authStore.record);
				if (!myBar || r.bar !== myBar) return;
				void refreshList();
				if (ev.action === 'update' && r.status === 'accepted') {
					notifyRequestAccepted(r.id, r.accepted_by_nickname, summarizeItems(r.items));
				}
			});
	}

	onMount(() => {
		const clock = setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		let removeCleanup: (() => void) | undefined;
		removeCleanup = registerRealtimeCleanup(() => {
			if (unsubRequests) {
				unsubRequests();
				unsubRequests = null;
			}
		});

		syncAuth();
		const unsubAuth = pb().authStore.onChange(() => {
			syncAuth();
			if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'bar') {
				if (unsubRequests) {
					unsubRequests();
					unsubRequests = null;
				}
				requests = [];
				listError = '';
				storagesList = [];
			}
		}, true);

		void pb()
			.collection(COLLECTIONS.users)
			.authRefresh({ expand: 'bar' })
			.then(async () => {
				syncAuth();
				const bid = barIdFromRecord(pb().authStore.record);
				const expect = sessionStorage.getItem(JOIN_BAR_KEY);
				joinMismatch = Boolean(expect && bid && expect !== bid);
				if (pb().authStore.isValid && roleFromRecord(pb().authStore.record) === 'bar') {
					await loadStorages();
					await refreshList();
					await bindRealtime();
				}
			})
			.catch(() => {});

		return () => {
			clearInterval(clock);
			removeCleanup?.();
			unsubAuth();
			if (unsubRequests) unsubRequests();
		};
	});
</script>

<h1 class="mb-2 text-3xl font-bold text-amber-300">Bar</h1>

{#if joinMismatch}
	<div class="mb-4 rounded-lg border border-amber-700 bg-amber-950/50 p-4 text-amber-200">
		Your sign-in bar does not match this device&rsquo;s join link. Use the link your admin sent, or ask
		for an account update.
	</div>
{/if}

{#if !authValid || role !== 'bar'}
	{#if authValid && role !== 'bar'}
		<WrongRoleHint expected="bar" current={role} />
	{/if}
	<form class="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/40 p-6" onsubmit={login}>
		<p class="text-zinc-400">Sign in with your <strong class="text-zinc-200">bar</strong> account.</p>
		<div>
			<label class="mb-1 block text-sm text-zinc-400" for="email">Email</label>
			<input
				id="email"
				class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-4 text-xl"
				autocomplete="username"
				bind:value={email}
			/>
		</div>
		<div>
			<label class="mb-1 block text-sm text-zinc-400" for="pw">Password</label>
			<input
				id="pw"
				type="password"
				class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-4 text-xl"
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
			class="w-full rounded-xl bg-amber-500 py-5 text-2xl font-bold text-black disabled:opacity-50"
		>
			{loading ? '…' : 'Sign in'}
		</button>
	</form>
{:else}
	<div class="mb-4">
		<p class="text-xl text-zinc-300">{barDisplayName}</p>
	</div>

	{#if listError}
		<div
			class="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-200"
			role="alert"
		>
			{listError}
		</div>
	{/if}

	<section class="mb-8 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
		<h2 class="mb-3 text-2xl font-semibold text-zinc-200">Quick add</h2>
		{#if storagesError}
			<div class="mb-3 rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200">
				{storagesError}
			</div>
		{/if}
		<p class="mb-3 text-sm text-zinc-500">
			Quick picks come from all storage hubs. Custom items go to the hub with the lowest hub order
			(default).
		</p>
		<div class="mb-3 flex flex-wrap gap-2">
			{#each presetButtons as p (p.cartKey)}
				{@const inCart = cart.some((line) => line.cartKey === p.cartKey)}
				<button
					type="button"
					class="rounded-xl border px-4 py-4 text-xl {inCart
						? 'border-sky-500 bg-sky-800 text-sky-100 shadow-md shadow-sky-950/50'
						: 'border-zinc-600 bg-zinc-800 hover:bg-zinc-700'}"
					onclick={() => togglePreset(p)}
				>
					{p.displayLabel}
				</button>
			{/each}
		</div>
		<div class="flex flex-wrap items-end gap-3">
			<div class="min-w-[10rem] flex-1">
				<label class="mb-1 block text-sm text-zinc-400" for="qty">Qty</label>
				<input
					id="qty"
					type="number"
					min="1"
					max="99"
					bind:value={pickQty}
					class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-4 text-2xl"
				/>
			</div>
			<div class="min-w-[12rem] flex-[2]">
				<label class="mb-1 block text-sm text-zinc-400" for="custom">Custom item</label>
				<input
					id="custom"
					bind:value={pickLabel}
					class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-4 text-xl"
					placeholder="e.g. Napkins"
				/>
			</div>
			<button
				type="button"
				class="rounded-xl bg-zinc-700 px-6 py-4 text-xl font-medium hover:bg-zinc-600"
				onclick={addCustom}
			>
				Add
			</button>
		</div>
		{#if cart.length > 0}
			<ul class="mt-4 space-y-2 border-t border-zinc-700 pt-4 text-lg">
				{#each cart as line (line.cartKey)}
					<li class="flex items-center gap-2 text-zinc-200">
						<button
							type="button"
							class="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
							aria-label="Remove {line.displayLabel}"
							onclick={() => removeCartLine(line.cartKey)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="size-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						</button>
						<span class="min-w-0 flex-1">{line.displayLabel}</span>
						<span class="flex shrink-0 items-center gap-2 tabular-nums text-amber-300">
							{#if loading}
								<span
									class="size-4 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
									aria-hidden="true"
								></span>
							{/if}
							{line.qty}&times;
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		<form class="mt-6" onsubmit={submitRequest}>
			{#if err}
				<p class="mb-2 text-red-400">{err}</p>
			{/if}
			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-2xl bg-amber-500 py-6 text-3xl font-bold text-black shadow-lg shadow-amber-900/40 disabled:opacity-50"
			>
				Send request
			</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-2xl font-semibold text-zinc-200">Your recent requests</h2>
		<ul class="space-y-3">
			{#each openRequests as r}
				<li class="rounded-xl border border-zinc-700 bg-zinc-900/30 p-4">
					<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="rounded-full px-3 py-1 text-sm font-medium {r.status === 'pending'
									? 'bg-amber-900/60 text-amber-200'
									: 'bg-sky-900/50 text-sky-200'}"
							>
								{statusLabel(r.status)}
							</span>
							{#if r.storage_name}
								<span class="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
									>Hub: {r.storage_name}</span
								>
							{/if}
							{#if r.status === 'pending'}
								<button
									type="button"
									disabled={notifyCooldownIds.has(r.id)}
									class="rounded-lg border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-95 {notifyCooldownIds.has(r.id)
										? 'bar-notify-pulse border-sky-500 text-white'
										: 'border-sky-500 bg-sky-600 text-white hover:bg-sky-500'}"
									onclick={() => triggerNotify(r)}
								>
									Notify again
								</button>
							{/if}
						</div>
						<span
							class="cursor-default text-sm text-zinc-500"
							title={formatPbDateTime(r.requested_at)}
						>
							Requested {elapsedHhMmSsSince(parseRequestTimestamp(r), nowMs)} ago
						</span>
					</div>
					{#if r.status === 'accepted' && r.accepted_by_nickname?.trim()}
						{@const acceptedAt = parsePbDate(r.accepted_at)}
						<p class="mb-1 text-sm text-sky-300" title={formatPbDateTime(r.accepted_at)}>
							Accepted by {r.accepted_by_nickname.trim()}{#if acceptedAt}
								{' '}· {elapsedHhMmSsSince(acceptedAt, nowMs)} ago
							{/if}
						</p>
					{/if}
					<p class="text-lg text-zinc-200">{summarizeItems(r.items, 200)}</p>
				</li>
			{/each}
			{#if openRequests.length === 0 && doneRequestsSorted.length === 0}
				<li class="text-zinc-500">No requests yet.</li>
			{/if}
		</ul>

		{#if doneRequestsSorted.length > 0}
			<details class="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/20 [&_summary::-webkit-details-marker]:hidden" bind:open={doneOpen}>
				<summary
					class="cursor-pointer select-none list-none px-4 py-3 text-lg font-medium text-zinc-300"
				>
					{doneOpen ? '⏷' : '⏵'} done items ({doneRequestsSorted.length})
				</summary>
				<ul class="space-y-3 border-t border-zinc-700 px-4 pb-4 pt-3">
					{#each doneRequestsSorted as r}
						<li class="rounded-xl border border-zinc-700 bg-zinc-900/30 p-4">
							<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
								<span class="rounded-full bg-zinc-700 px-3 py-1 text-sm font-medium text-zinc-200">
									{statusLabel(r.status)}
								</span>
								<span
									class="cursor-default text-sm text-zinc-500"
									title={formatPbDateTime(r.completed_at)}
								>
									Completed {elapsedHhMmSsSince(parsePbDate(r.completed_at), nowMs)} ago
								</span>
							</div>
							{#if r.storage_name}
								<p class="mb-1 text-sm text-zinc-500">Hub: {r.storage_name}</p>
							{/if}
							{#if r.accepted_by_nickname?.trim()}
								<p class="mb-1 text-sm text-sky-300">
									Accepted by {r.accepted_by_nickname.trim()}
								</p>
							{/if}
							{#if r.done_by_nickname?.trim()}
								<p class="mb-1 text-sm text-emerald-300">Done by {r.done_by_nickname.trim()}</p>
							{/if}
							<p class="text-lg text-zinc-200">{summarizeItems(r.items, 200)}</p>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>
{/if}

<style>
	@keyframes bar-notify-pulse-kf {
		0%,
		100% {
			background-color: rgb(3 105 161); /* sky-700 */
			border-color: rgb(3 105 161);
		}
		50% {
			background-color: rgb(56 189 248); /* sky-400 */
			border-color: rgb(14 165 233); /* sky-500 */
		}
	}
	.bar-notify-pulse {
		animation: bar-notify-pulse-kf 1.2s ease-in-out infinite;
	}
</style>
