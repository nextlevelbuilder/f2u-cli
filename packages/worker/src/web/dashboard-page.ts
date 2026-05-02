export const dashboardPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>f2u — Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100">
  <header class="border-b border-slate-800">
    <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">f2u <span class="text-slate-500 text-sm font-normal">dashboard</span></h1>
      <div class="flex items-center gap-3 text-sm">
        <img id="avatar" class="w-8 h-8 rounded-full bg-slate-800" alt="" />
        <span id="login" class="text-slate-300"></span>
        <button id="logout" class="text-slate-400 hover:text-white">Sign out</button>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-6 py-10">
    <section class="mb-8">
      <div class="flex items-end justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold">API keys</h2>
          <p class="text-slate-400 text-sm">Used by the f2u CLI and HTTP API.</p>
        </div>
        <button id="create"
          class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium px-4 py-2 rounded-lg">
          + New key
        </button>
      </div>

      <div id="created" class="hidden mb-6 p-4 rounded-lg border border-emerald-700 bg-emerald-950/40">
        <div class="text-emerald-300 text-sm font-medium mb-2">New API key created — copy it now, it will not be shown again.</div>
        <div class="flex items-center gap-2">
          <code id="created-key" class="flex-1 px-3 py-2 bg-slate-900 rounded text-sm font-mono break-all"></code>
          <button id="copy" class="px-3 py-2 text-sm rounded bg-slate-800 hover:bg-slate-700">Copy</button>
        </div>
      </div>

      <div id="list" class="rounded-lg border border-slate-800 overflow-hidden">
        <div class="p-6 text-center text-slate-500 text-sm">Loading…</div>
      </div>
    </section>

    <section class="text-sm text-slate-400">
      <h3 class="text-slate-200 font-medium mb-2">Quick start</h3>
      <pre class="bg-slate-900 border border-slate-800 rounded p-3 overflow-x-auto"><code>npm install -g f2u-cli
f2u auth --key &lt;YOUR_KEY&gt;
f2u up -f ./file.png</code></pre>
    </section>
  </main>

<script>
const $ = (s) => document.querySelector(s);

async function jsonFetch(url, opts) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } });
  if (res.status === 401) { location.href = '/login'; throw new Error('unauth'); }
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

async function loadMe() {
  const { body } = await jsonFetch('/api/me');
  $('#login').textContent = body.github_login || '';
  if (body.avatar_url) $('#avatar').src = body.avatar_url;
}

async function loadKeys() {
  const { body } = await jsonFetch('/api/keys');
  const keys = body.keys || [];
  if (keys.length === 0) {
    $('#list').innerHTML = '<div class="p-6 text-center text-slate-500 text-sm">No keys yet. Create one to get started.</div>';
    return;
  }
  const rows = keys.map(k => {
    const revoked = k.revoked === 1;
    const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never';
    return \`
      <tr class="border-t border-slate-800 \${revoked ? 'opacity-50' : ''}">
        <td class="px-4 py-3">\${escapeHtml(k.name)}</td>
        <td class="px-4 py-3 font-mono text-xs text-slate-400">\${escapeHtml(k.prefix)}…</td>
        <td class="px-4 py-3 text-sm text-slate-400">\${new Date(k.created_at).toLocaleDateString()}</td>
        <td class="px-4 py-3 text-sm text-slate-400">\${lastUsed}</td>
        <td class="px-4 py-3 text-right">
          \${revoked
            ? '<span class="text-xs text-slate-500">revoked</span>'
            : \`<button data-id="\${k.id}" class="revoke text-xs text-red-400 hover:text-red-300">Revoke</button>\`}
        </td>
      </tr>\`;
  }).join('');
  $('#list').innerHTML = \`
    <table class="w-full text-sm">
      <thead class="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
        <tr>
          <th class="px-4 py-2 text-left">Name</th>
          <th class="px-4 py-2 text-left">Prefix</th>
          <th class="px-4 py-2 text-left">Created</th>
          <th class="px-4 py-2 text-left">Last used</th>
          <th class="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>\${rows}</tbody>
    </table>\`;
  document.querySelectorAll('.revoke').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Revoke this key? Clients using it will stop working immediately.')) return;
      await jsonFetch('/api/keys/' + btn.dataset.id, { method: 'DELETE' });
      loadKeys();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

$('#create').addEventListener('click', async () => {
  const name = prompt('Name for this key?', 'My device');
  if (name === null) return;
  const { ok, body } = await jsonFetch('/api/keys', { method: 'POST', body: JSON.stringify({ name }) });
  if (!ok) { alert(body.error || 'Failed to create key'); return; }
  $('#created-key').textContent = body.key;
  $('#created').classList.remove('hidden');
  loadKeys();
});

$('#copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('#created-key').textContent || '');
});

$('#logout').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/login';
});

loadMe();
loadKeys();
</script>
</body>
</html>`;
