export const loginPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>f2u — Sign in</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
  <div class="max-w-sm w-full p-8 bg-slate-900 rounded-2xl shadow-xl border border-slate-800">
    <h1 class="text-2xl font-semibold mb-2">f2u</h1>
    <p class="text-slate-400 text-sm mb-8">Temporary file hosting for AI agents.</p>
    <a href="/auth/github"
       class="flex items-center justify-center gap-2 w-full bg-white text-slate-900 font-medium py-2.5 rounded-lg hover:bg-slate-200 transition">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5"/></svg>
      Sign in with GitHub
    </a>
  </div>
</body>
</html>`;
