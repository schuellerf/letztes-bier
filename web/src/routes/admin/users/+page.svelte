<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { pb, COLLECTIONS } from '$lib/pb_client';
	import { API_ADMIN_ENSURE_LOGIN_KEY, API_ADMIN_REVOKE_LOGIN_KEY } from '$lib/auth_api_key';
	import { formatPbClientError, logPbError } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord } from '$lib/auth';
	import type { RecordModel } from 'pocketbase';

	type LinkOriginOption = { value: string; label: string };
	type NewStaffKind = 'bar' | 'storage';

	const STAFF_PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

	function randomStaffPassword(): string {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		let s = '';
		for (let i = 0; i < bytes.length; i++) {
			s += STAFF_PW_ALPHABET[bytes[i]! % STAFF_PW_ALPHABET.length];
		}
		return s;
	}

	function isLanCandidateIpv4(ip: string): boolean {
		const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
		if (!m) return false;
		const oct = [m[1], m[2], m[3], m[4]].map((s) => Number(s));
		if (oct.some((n) => n > 255)) return false;
		const [a, b] = oct;
		if (a === 127) return false;
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 169 && b === 254) return true;
		return false;
	}

	function seedOriginStrings(loc: Location): string[] {
		const seen = new Set<string>();
		const ordered: string[] = [];
		function add(o: string) {
			if (!seen.has(o)) {
				seen.add(o);
				ordered.push(o);
			}
		}
		add(loc.origin);
		const portPart = loc.port ? `:${loc.port}` : '';
		if (loc.hostname === 'localhost') {
			add(`${loc.protocol}//127.0.0.1${portPart}`);
		} else if (loc.hostname === '127.0.0.1') {
			add(`${loc.protocol}//localhost${portPart}`);
		}
		return ordered;
	}

	function optionsFromOrigins(origins: string[]): LinkOriginOption[] {
		return origins.map((value, i) => {
			let label: string;
			try {
				const host = new URL(value).host;
				label = i === 0 ? `This page — ${host}` : host;
			} catch {
				label = value;
			}
			return { value, label };
		});
	}

	function discoverLanIpv4s(timeoutMs: number): Promise<string[]> {
		return new Promise((resolve) => {
			const ips = new Set<string>();
			let settled = false;
			const RTCP = globalThis.RTCPeerConnection;
			if (!RTCP) {
				resolve([]);
				return;
			}
			let pc: RTCPeerConnection;
			try {
				pc = new RTCP({ iceServers: [] });
			} catch {
				resolve([]);
				return;
			}
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				try {
					pc.close();
				} catch {
					/* ignore */
				}
				resolve([...ips]);
			};
			const timer = setTimeout(finish, timeoutMs);
			pc.onicecandidate = (ev) => {
				if (ev.candidate?.candidate) {
					const m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ev.candidate.candidate);
					if (m && isLanCandidateIpv4(m[1])) ips.add(m[1]);
				} else {
					finish();
				}
			};
			pc.createDataChannel('q');
			void pc
				.createOffer()
				.then((offer) => pc.setLocalDescription(offer))
				.catch(() => finish());
		});
	}

	let email = $state('');
	let password = $state('');
	let err = $state('');
	let loading = $state(false);

	let authValid = $state(false);
	let record = $state<RecordModel | null>(null);

	const role = $derived(roleFromRecord(record));

	let staff = $state<RecordModel[]>([]);
	let bars = $state<RecordModel[]>([]);
	let storages = $state<RecordModel[]>([]);
	let loadErr = $state('');
	let selected = $state<RecordModel | null>(null);

	let newStaffKind = $state<NewStaffKind>('bar');
	let newStaffTargetId = $state('');
	let newStaffEmail = $state('');
	let createUserBusy = $state(false);
	let createUserErr = $state('');

	let deviceApiKey = $state('');
	let keyBusy = $state(false);
	let keyLoadErr = $state('');
	let revokeBusy = $state(false);
	let linkGenErr = $state('');
	let generatedUrl = $state('');
	let qrSrc = $state('');
	let copyDone = $state(false);

	let linkBaseOrigin = $state('');
	let linkOriginOptions = $state<LinkOriginOption[]>([]);

	function refreshLinkOriginOptions() {
		const loc = window.location;
		const ordered = seedOriginStrings(loc);
		const seen = new Set(ordered);
		linkOriginOptions = optionsFromOrigins(ordered);
		if (!linkBaseOrigin || !seen.has(linkBaseOrigin)) {
			linkBaseOrigin = loc.origin;
		}
		void discoverLanIpv4s(2000).then((discovered) => {
			const locNow = window.location;
			const portSuffix = locNow.port ? `:${locNow.port}` : '';
			const existing = new Set(linkOriginOptions.map((o) => o.value));
			let next = [...linkOriginOptions];
			let changed = false;
			for (const ip of discovered) {
				const o = `${locNow.protocol}//${ip}${portSuffix}`;
				if (!existing.has(o)) {
					existing.add(o);
					let label: string;
					try {
						label = `${new URL(o).host} (detected LAN)`;
					} catch {
						label = `${o} (detected LAN)`;
					}
					next = [...next, { value: o, label }];
					changed = true;
				}
			}
			if (changed) linkOriginOptions = next;
		});
	}

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

	async function loadStaff(opts?: { selectUserId?: string }) {
		if (!pb().authStore.isValid || roleFromRecord(pb().authStore.record) !== 'admin') return;
		loadErr = '';
		try {
			const [list, barList, storageList] = await Promise.all([
				pb()
					.collection(COLLECTIONS.users)
					.getFullList<RecordModel>({
						requestKey: null,
						sort: 'email',
						perPage: 500,
						expand: 'bar,storage'
					}),
				pb()
					.collection(COLLECTIONS.bars)
					.getFullList<RecordModel>({ requestKey: null, sort: 'name', perPage: 200 }),
				pb().collection(COLLECTIONS.storages).getFullList<RecordModel>({
					requestKey: null,
					sort: 'hub_order',
					perPage: 200
				})
			]);
			staff = list;
			bars = barList;
			storages = storageList;

			if (opts?.selectUserId) {
				const u = list.find((x) => x.id === opts.selectUserId);
				if (u) {
					await selectUser(u);
					return;
				}
			}

			selected = null;
			generatedUrl = '';
			qrSrc = '';
			deviceApiKey = '';
			keyLoadErr = '';
		} catch (e) {
			logPbError('admin.users.loadStaff', e);
			loadErr = formatPbClientError(e);
			staff = [];
			bars = [];
			storages = [];
		}
	}

	async function createStaffUser() {
		createUserErr = '';
		const em = newStaffEmail.trim();
		if (!em) {
			createUserErr = 'Enter an email address.';
			return;
		}
		if (!newStaffTargetId) {
			createUserErr = `Select a ${newStaffKind}.`;
			return;
		}
		createUserBusy = true;
		try {
			const password = randomStaffPassword();
			const body =
				newStaffKind === 'bar'
					? {
							email: em,
							password,
							passwordConfirm: password,
							role: 'bar',
							bar: newStaffTargetId
						}
					: {
							email: em,
							password,
							passwordConfirm: password,
							role: 'storage',
							storage: newStaffTargetId
						};
			const created = await pb().collection(COLLECTIONS.users).create<RecordModel>(body);
			newStaffEmail = '';
			await loadStaff({ selectUserId: created.id });
		} catch (e) {
			logPbError('admin.users.createStaff', e);
			createUserErr = formatPbClientError(e);
		} finally {
			createUserBusy = false;
		}
	}

	async function selectUser(u: RecordModel) {
		selected = u;
		generatedUrl = '';
		qrSrc = '';
		deviceApiKey = '';
		linkGenErr = '';
		keyLoadErr = '';
		copyDone = false;
		await ensureDeviceKey(u.id);
	}

	async function ensureDeviceKey(userId: string) {
		keyBusy = true;
		keyLoadErr = '';
		try {
			const res = (await pb().send(API_ADMIN_ENSURE_LOGIN_KEY, {
				method: 'POST',
				body: JSON.stringify({ userId }),
				headers: { 'Content-Type': 'application/json' }
			})) as { apiKey: string };
			deviceApiKey = res.apiKey;
		} catch (e) {
			logPbError('admin.users.ensureKey', e);
			keyLoadErr = formatPbClientError(e);
			deviceApiKey = '';
		} finally {
			keyBusy = false;
		}
	}

	async function revokeDeviceKey() {
		if (!selected) return;
		revokeBusy = true;
		linkGenErr = '';
		try {
			const res = (await pb().send(API_ADMIN_REVOKE_LOGIN_KEY, {
				method: 'POST',
				body: JSON.stringify({ userId: selected.id }),
				headers: { 'Content-Type': 'application/json' }
			})) as { apiKey: string };
			deviceApiKey = res.apiKey;
			generatedUrl = '';
			qrSrc = '';
		} catch (e) {
			logPbError('admin.users.revokeKey', e);
			linkGenErr = formatPbClientError(e);
		} finally {
			revokeBusy = false;
		}
	}

	function barDisplay(u: RecordModel): string {
		const ex = u.expand?.bar as { name?: string } | undefined;
		if (ex?.name) return ex.name;
		const id = typeof u.bar === 'string' ? u.bar : undefined;
		if (id) return id.slice(0, 8) + '…';
		return '—';
	}

	function storageDisplay(u: RecordModel): string {
		const ex = u.expand?.storage as { name?: string } | undefined;
		if (ex?.name) return ex.name;
		const id = typeof u.storage === 'string' ? u.storage : undefined;
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
		if (!deviceApiKey.trim()) {
			linkGenErr = 'No device API key yet. Wait for load or fix errors above.';
			generatedUrl = '';
			qrSrc = '';
			return;
		}
		let base = linkBaseOrigin.trim();
		if (!base) {
			base = typeof window !== 'undefined' ? window.location.origin : '';
		}
		let originBase: string;
		try {
			const parsed = new URL(base);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				linkGenErr = 'URL base must be http or https.';
				generatedUrl = '';
				qrSrc = '';
				return;
			}
			originBase = parsed.origin;
		} catch {
			linkGenErr = 'Invalid URL base.';
			generatedUrl = '';
			qrSrc = '';
			return;
		}
		const u = new URL('/quick-login', originBase);
		u.searchParams.set('email', em);
		u.searchParams.set('apiKey', deviceApiKey.trim());
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
		refreshLinkOriginOptions();
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
			<h2 class="mb-2 text-xl font-semibold text-zinc-200">New user</h2>
			<div class="mb-6 flex flex-col gap-3 rounded-xl border border-zinc-700 bg-zinc-900/30 p-4 sm:flex-row sm:flex-wrap sm:items-center">
				<div class="flex shrink-0 gap-1 rounded-lg border border-zinc-600 p-1">
					<button
						type="button"
						class="rounded-md px-3 py-1.5 text-sm font-medium {newStaffKind === 'bar'
							? 'bg-amber-500 text-black'
							: 'text-zinc-400 hover:text-zinc-200'}"
						onclick={() => {
							newStaffKind = 'bar';
							newStaffTargetId = '';
							createUserErr = '';
						}}
					>
						Bar
					</button>
					<button
						type="button"
						class="rounded-md px-3 py-1.5 text-sm font-medium {newStaffKind === 'storage'
							? 'bg-amber-500 text-black'
							: 'text-zinc-400 hover:text-zinc-200'}"
						onclick={() => {
							newStaffKind = 'storage';
							newStaffTargetId = '';
							createUserErr = '';
						}}
					>
						Storage
					</button>
				</div>
				<div class="min-w-[12rem] flex-1">
					<label class="sr-only" for="new-staff-target">Assign to</label>
					<select
						id="new-staff-target"
						class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-zinc-100"
						bind:value={newStaffTargetId}
					>
						<option value="">Choose {newStaffKind}…</option>
						{#if newStaffKind === 'bar'}
							{#each bars as r (r.id)}
								<option value={r.id}>{typeof r.name === 'string' ? r.name : r.id}</option>
							{/each}
						{:else}
							{#each storages as r (r.id)}
								<option value={r.id}>{typeof r.name === 'string' ? r.name : r.id}</option>
							{/each}
						{/if}
					</select>
				</div>
				<div class="min-w-[10rem] flex-1">
					<label class="sr-only" for="new-staff-email">Email</label>
					<input
						id="new-staff-email"
						type="email"
						class="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-zinc-100"
						placeholder="email@…"
						autocomplete="off"
						bind:value={newStaffEmail}
					/>
				</div>
				<button
					type="button"
					disabled={createUserBusy}
					class="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-500 disabled:opacity-50"
					onclick={() => void createStaffUser()}
				>
					{createUserBusy ? '…' : 'New user'}
				</button>
			</div>
			{#if createUserErr}
				<p class="mb-4 text-sm text-red-300" role="alert">{createUserErr}</p>
			{/if}

			<h2 class="mb-2 text-xl font-semibold text-zinc-200">Staff accounts</h2>
			<ul class="space-y-1 rounded-xl border border-zinc-700 bg-zinc-900/30">
				{#each staff as u (u.id)}
					<li>
						<button
							type="button"
							class="w-full border-b border-zinc-800 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-800/60 {selected?.id === u.id
								? 'bg-zinc-800/80'
								: ''}"
							onclick={() => void selectUser(u)}
						>
							<span class="font-medium text-zinc-100">{u.email}</span>
							<span class="ml-2 text-sm text-zinc-500">{(u.role as string) ?? '—'}</span>
							{#if u.role === 'bar'}
								<div class="text-sm text-zinc-400">{barDisplay(u)}</div>
							{:else if u.role === 'storage'}
								<div class="text-sm text-zinc-400">{storageDisplay(u)}</div>
							{/if}
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
					A per-user <strong class="text-amber-100">device API key</strong> is stored on the server (hidden
					from normal API responses). The sign-in URL and QR contain that key—treat them like credentials
					(history, logs); use on trusted networks.
				</p>
				{#if keyBusy}
					<p class="mb-3 text-sm text-zinc-400">Loading device key…</p>
				{/if}
				{#if keyLoadErr}
					<p class="mb-3 text-sm text-red-300" role="alert">{keyLoadErr}</p>
				{/if}
				<button
					type="button"
					class="mb-3 w-full rounded-lg border border-red-800/70 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-950/50 disabled:opacity-50"
					disabled={revokeBusy || keyBusy || !deviceApiKey}
					onclick={() => void revokeDeviceKey()}
				>
					{revokeBusy ? 'Revoking…' : 'Revoke key & sign out this user everywhere'}
				</button>
				<p class="mb-3 text-xs text-zinc-500">
					Revoke rotates the device key and ends all active sessions for this user (password and device),
					and sends a realtime <code class="text-zinc-400">logout</code> signal to connected apps.
				</p>
				<label class="mb-1 block text-sm text-zinc-400" for="link-origin-select">Open app at (for link & QR)</label>
				{#if linkOriginOptions.length > 0}
					<select
						id="link-origin-select"
						class="mb-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-lg text-zinc-100"
						bind:value={linkBaseOrigin}
					>
						{#each linkOriginOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				{:else}
					<p class="mb-1 text-sm text-zinc-500">Resolving reachable hosts…</p>
				{/if}
				<p class="mb-3 text-xs text-zinc-500">
					Hosts match how this device reaches the app; phones on the same network usually need your LAN IP
					or hostname. Extra addresses may appear after a short detection pass.
				</p>
				<button
					type="button"
					class="mb-4 rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
					disabled={!deviceApiKey.trim() || keyBusy}
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
