<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { pb, COLLECTIONS } from '$lib/pb_client';
	import { formatPbClientError, logPbError } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord } from '$lib/auth';
	import type { RecordModel } from 'pocketbase';

	let email = $state('');
	let password = $state('');
	let err = $state('');
	let loading = $state(false);

	let authValid = $state(false);
	let record = $state<RecordModel | null>(null);

	const role = $derived(roleFromRecord(record));

	let staff = $state<RecordModel[]>([]);
	let loadErr = $state('');
	let selected = $state<RecordModel | null>(null);

	let linkPassword = $state('');
	let linkGenErr = $state('');
	let generatedUrl = $state('');
	let qrSrc = $state('');
	let copyDone = $state(false);

	function syncAuth() {
		authValid = pb().authStore.isValid;
		record = pb().authStore.record;
	}

	async function login(e: Event) {
		e.preventDefault();
		err = '';
		loading = true;
		try {
			await pb().collection(COLLECTIONS.users).authWithPassword(email.trim(), password);
			syncAuth();
			await loadStaff();
		} catch (e) {
			logPbError('admin.users.login', e);
			err = formatPbClientError(e);
		} finally {
			loading = false;
		}
	}

	async function loadStaff() {
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'admin') return;
		loadErr = '';
		try {
			const list = await pb()
				.collection(COLLECTIONS.users)
				.getFullList<RecordModel>({
					requestKey: null,
					sort: 'email',
					perPage: 500,
					expand: 'bar'
				});
			staff = list;
			selected = null;
			generatedUrl = '';
			qrSrc = '';
			linkPassword = '';
			linkGenErr = '';
		} catch (e) {
			logPbError('admin.users.loadStaff', e);
			loadErr = formatPbClientError(e);
			staff = [];
		}
	}

	function selectUser(u: RecordModel) {
		selected = u;
		generatedUrl = '';
		qrSrc = '';
		linkPassword = '';
		linkGenErr = '';
		copyDone = false;
	}

	function barDisplay(u: RecordModel): string {
		const ex = u.expand?.bar as { name?: string } | undefined;
		if (ex?.name) return ex.name;
		const id = typeof u.bar === 'string' ? u.bar : undefined;
		if (id) return id.slice(0, 8) + '…';
		return '—';
	}

	function buildQuickLoginUrl() {
		linkGenErr = '';
		if (!selected) return;
		const em = typeof selected.email === 'string' ? selected.email.trim() : '';
		if (!em) {
			linkGenErr =
				'No email in this record. Restart PocketBase so hooks load, then reload this page. Or enable email visibility on the user in the dashboard.';
			generatedUrl = '';
			qrSrc = '';
			return;
		}
		const u = new URL('/quick-login', window.location.origin);
		u.searchParams.set('email', em);
		u.searchParams.set('password', linkPassword);
		generatedUrl = u.toString();
		copyDone = false;
	}

	$effect(() => {
		const url = generatedUrl;
		if (!url) {
			qrSrc = '';
			return;
		}
		let cancel = false;
		void QRCode.toDataURL(url, { margin: 1, width: 220 }).then((data) => {
			if (!cancel) qrSrc = data;
		});
		return () => {
			cancel = true;
		};
	});

	async function copyUrl() {
		if (!generatedUrl) return;
		try {
			await navigator.clipboard.writeText(generatedUrl);
			copyDone = true;
			setTimeout(() => {
				copyDone = false;
			}, 2000);
		} catch {
			copyDone = false;
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
					await loadStaff();
				}
			})
			.catch(() => {});

		return () => off();
	});
</script>

<h1 class="mb-2 text-3xl font-bold text-amber-300">Users</h1>

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
{:else}
	{#if loadErr}
		<div class="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-200" role="alert">
			{loadErr}
		</div>
	{/if}

	<div class="flex flex-col gap-6 lg:flex-row">
		<div class="min-w-0 flex-1">
			<h2 class="mb-2 text-xl font-semibold text-zinc-200">Staff accounts</h2>
			<ul class="space-y-1 rounded-xl border border-zinc-700 bg-zinc-900/30">
				{#each staff as u (u.id)}
					<li>
						<button
							type="button"
							class="w-full border-b border-zinc-800 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-800/60 {selected?.id === u.id
								? 'bg-zinc-800/80'
								: ''}"
							onclick={() => selectUser(u)}
						>
							<span class="font-medium text-zinc-100">{u.email}</span>
							<span class="ml-2 text-sm text-zinc-500">{(u.role as string) ?? '—'}</span>
							<div class="text-sm text-zinc-400">{barDisplay(u)}</div>
						</button>
					</li>
				{:else}
					<li class="px-4 py-6 text-zinc-500">No users loaded.</li>
				{/each}
			</ul>
		</div>

		<div class="w-full min-w-0 flex-1 lg:max-w-md">
			<h2 class="mb-2 text-xl font-semibold text-zinc-200">Quick-login link</h2>
			{#if !selected}
				<p class="text-zinc-500">Select a user to generate a sign-in URL and QR code.</p>
			{:else}
				<p class="mb-2 text-sm text-zinc-400">
					Selected: <strong class="text-zinc-200">{selected.email}</strong>
				</p>
				<p class="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100/90">
					PocketBase does not expose passwords. Enter this user’s password below only to build the
					link—nothing is sent until someone opens the URL. Putting credentials in a URL is risky
					(history, logs, QR); use on trusted networks.
				</p>
				<label class="mb-1 block text-sm text-zinc-400" for="link-pw">User password (for link only)</label>
				<input
					id="link-pw"
					type="password"
					class="mb-3 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-lg text-zinc-100"
					autocomplete="off"
					bind:value={linkPassword}
				/>
				<button
					type="button"
					class="mb-4 rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
					disabled={!linkPassword.trim()}
					onclick={buildQuickLoginUrl}
				>
					Generate link & QR
				</button>
				{#if linkGenErr}
					<p class="mb-4 text-sm text-red-300">{linkGenErr}</p>
				{/if}

				{#if generatedUrl}
					<div class="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
						{#if qrSrc}
							<img src={qrSrc} width="220" height="220" class="rounded" alt="QR code for login URL" />
						{:else}
							<div class="flex h-[220px] w-[220px] items-center justify-center text-zinc-500">
								Generating QR…
							</div>
						{/if}
						<div class="w-full">
							<div class="mb-1 text-xs uppercase tracking-wide text-zinc-500">URL</div>
							<code
								class="block max-h-32 overflow-auto break-all rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-300"
								>{generatedUrl}</code
							>
						</div>
						<button
							type="button"
							class="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
							onclick={copyUrl}
						>
							{copyDone ? 'Copied' : 'Copy URL'}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}
