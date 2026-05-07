<script lang="ts">
	import { onMount } from 'svelte';
	import { pb, COLLECTIONS, getPbUrl } from '$lib/pb_client';
	import { roleFromRecord, barIdFromRecord } from '$lib/auth';
	import { getDeviceNickname, setDeviceNickname } from '$lib/device_nickname';
	import { ensureNotifyPermission, notifyRequestAccepted } from '$lib/notifications';
	import { normalizeItems, summarizeItems } from '$lib/items';
	import type { RecordModel } from 'pocketbase';
	import type { StockItem, StockRequestRecord } from '$lib/types';
	import { connection } from '$lib/connection.svelte';

	const JOIN_BAR_KEY = 'letztesbier_join_bar';
	const PRESETS = [
		'Vodka',
		'Gin',
		'Rum',
		'Ice',
		'Tonic',
		'Orange juice',
		'Lime',
		'Beer crates',
		'Red wine',
		'White wine',
		'Soft drinks'
	];

	let email = $state('');
	let password = $state('');
	let err = $state('');
	let loading = $state(false);
	let nickname = $state('');
	let requests = $state<StockRequestRecord[]>([]);
	let pickLabel = $state('');
	let pickQty = $state(1);
	let joinMismatch = $state(false);
	let notifyStatus = $state<NotificationPermission | 'unsupported'>('default');

	let authValid = $state(false);
	let record = $state<RecordModel | null>(null);
	let unsubRequests: null | (() => void) = null;

	const role = $derived(roleFromRecord(record));
	const barExpand = $derived(record?.expand?.bar as { name?: string } | undefined);
	const barDisplayName = $derived(barExpand?.name ?? 'Your bar');

	function syncAuth() {
		authValid = pb().authStore.isValid;
		record = pb().authStore.record;
	}

	async function refreshList() {
		const bid = barIdFromRecord(pb().authStore.record);
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'bar' || !bid) return;
		try {
			const list = await pb()
				.collection(COLLECTIONS.requests)
				.getFullList<StockRequestRecord>({
					sort: '-created',
					filter: `bar = "${bid}"`,
					perPage: 200
				});
			requests = list;
			connection.reconnecting = false;
		} catch (e) {
			console.error(e);
			connection.reconnecting = true;
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
			await bindRealtime();
			await refreshList();
		} catch {
			err = 'Sign-in failed. Check email and password.';
		} finally {
			loading = false;
		}
	}

	function logout() {
		if (unsubRequests) {
			unsubRequests();
			unsubRequests = null;
		}
		pb().authStore.clear();
		syncAuth();
		requests = [];
	}

	let cart = $state<StockItem[]>([]);

	function mergeIntoCart(extra: StockItem[]) {
		const merged = normalizeItems([...cart, ...extra]);
		const map = new Map<string, number>();
		for (const x of merged) {
			map.set(x.label, (map.get(x.label) ?? 0) + x.qty);
		}
		cart = Array.from(map.entries()).map(([label, qty]) => ({ label, qty }));
	}

	function addPreset(label: string) {
		mergeIntoCart([{ label, qty: pickQty }]);
	}

	function addCustom() {
		mergeIntoCart([{ label: pickLabel, qty: pickQty }]);
		pickLabel = '';
	}

	async function submitRequest(e: Event) {
		e.preventDefault();
		err = '';
		const items = normalizeItems(cart);
		const bid = barIdFromRecord(pb().authStore.record);
		if (!bid) {
			err = 'No bar assigned to your account.';
			return;
		}
		if (items.length === 0) {
			err = 'Add at least one line item.';
			return;
		}
		setDeviceNickname(nickname);
		const nick = getDeviceNickname();
		const name =
			(pb().authStore.record?.expand?.bar as { name?: string } | undefined)?.name ??
			barDisplayName;
		loading = true;
		try {
			await pb()
				.collection(COLLECTIONS.requests)
				.create({
					bar: bid,
					bar_name: name,
					items,
					status: 'pending',
					bar_device_nickname: nick || ''
				});
			cart = [];
			pickQty = 1;
			await refreshList();
		} catch {
			err = 'Could not create request.';
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

	async function enableNotify() {
		if (!('Notification' in window)) {
			notifyStatus = 'unsupported';
			return;
		}
		notifyStatus = await ensureNotifyPermission();
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
		nickname = getDeviceNickname();
		if (!('Notification' in window)) notifyStatus = 'unsupported';
		else notifyStatus = Notification.permission;

		syncAuth();
		const unsubAuth = pb().authStore.onChange(() => {
			syncAuth();
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
					await refreshList();
					await bindRealtime();
				}
			})
			.catch(() => {});

		return () => {
			unsubAuth();
			if (unsubRequests) unsubRequests();
		};
	});
</script>

<h1 class="mb-2 text-3xl font-bold text-amber-300">Bar</h1>
<p class="mb-4 text-zinc-400">
	Server: <code class="text-zinc-300">{getPbUrl() || '(same origin)'}</code>
</p>

{#if joinMismatch}
	<div class="mb-4 rounded-lg border border-amber-700 bg-amber-950/50 p-4 text-amber-200">
		Your sign-in bar does not match this device&rsquo;s join link. Use the link your admin sent, or ask
		for an account update.
	</div>
{/if}

<div class="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
	<label class="mb-1 block text-sm font-medium text-zinc-400" for="nick">This device nickname</label>
	<input
		id="nick"
		bind:value={nickname}
		class="mb-3 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-4 py-3 text-xl text-zinc-100"
		placeholder="e.g. Anna iPad"
		autocomplete="off"
	/>
	<button
		type="button"
		class="rounded-lg bg-zinc-800 px-4 py-3 text-lg text-zinc-200 hover:bg-zinc-700"
		onclick={() => setDeviceNickname(nickname)}
	>
		Save nickname
	</button>
	<div class="mt-3 flex flex-wrap items-center gap-3">
		<button
			type="button"
			class="rounded-lg bg-amber-600 px-4 py-3 text-lg font-semibold text-black hover:bg-amber-500"
			onclick={() => void enableNotify()}
		>
			Enable notifications
		</button>
		<span class="text-zinc-500">
			{#if notifyStatus === 'unsupported'}
				Not supported in this browser.
			{:else if notifyStatus === 'denied'}
				Notifications blocked &mdash; check browser settings.
			{:else if notifyStatus === 'granted'}
				Notifications on.
			{:else}
				Not yet enabled.
			{/if}
		</span>
	</div>
</div>

{#if !authValid || role !== 'bar'}
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
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<p class="text-xl text-zinc-300">{barDisplayName}</p>
		<button
			type="button"
			class="rounded-lg border border-zinc-600 px-4 py-2 text-zinc-300 hover:bg-zinc-800"
			onclick={logout}
		>
			Sign out
		</button>
	</div>

	<section class="mb-8 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
		<h2 class="mb-3 text-2xl font-semibold text-zinc-200">Quick add</h2>
		<div class="mb-3 flex flex-wrap gap-2">
			{#each PRESETS as p}
				<button
					type="button"
					class="rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-4 text-xl hover:bg-zinc-700"
					onclick={() => addPreset(p)}
				>
					{p}
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
				{#each cart as line}
					<li class="flex justify-between gap-2 text-zinc-200">
						<span>{line.label}</span>
						<span class="text-amber-300">{line.qty}&times;</span>
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
			{#each requests as r}
				<li class="rounded-xl border border-zinc-700 bg-zinc-900/30 p-4">
					<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
						<span
							class="rounded-full px-3 py-1 text-sm font-medium {r.status === 'pending'
								? 'bg-amber-900/60 text-amber-200'
								: r.status === 'accepted'
									? 'bg-sky-900/50 text-sky-200'
									: 'bg-zinc-700 text-zinc-200'}"
						>
							{statusLabel(r.status)}
						</span>
						<span class="text-sm text-zinc-500">{new Date(r.created).toLocaleString()}</span>
					</div>
					<p class="text-lg text-zinc-200">{summarizeItems(r.items, 200)}</p>
				</li>
			{:else}
				<li class="text-zinc-500">No requests yet.</li>
			{/each}
		</ul>
	</section>
{/if}
