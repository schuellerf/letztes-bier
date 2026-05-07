<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { pb, COLLECTIONS } from '$lib/pb_client';
	import { formatPbClientError, logPbError } from '$lib/pb_errors';
	import WrongRoleHint from '$lib/WrongRoleHint.svelte';
	import { roleFromRecord } from '$lib/auth';
	import type { RecordModel } from 'pocketbase';

	type LinkOriginOption = { value: string; label: string };

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
	let loadErr = $state('');
	let selected = $state<RecordModel | null>(null);

	let linkPassword = $state('');
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
					expand: 'bar,storage'
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
