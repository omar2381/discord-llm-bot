(() => {
  const config = window.BOT_CONFIG ?? {};
  const repo = config.repo ?? '';

  for (const [id, href] of [
    ['repo', repo],
    ['repo-footer', repo],
    ['readme', `${repo}#readme`],
    ['plan', `${repo}/blob/main/PLAN.md`],
  ]) {
    const link = document.getElementById(id);
    if (link && repo) link.href = href;
  }

  const invite = document.getElementById('invite');
  const note = document.getElementById('invite-note');
  const clientId = String(config.clientId ?? '').trim();

  // Without an application id there is nothing to invite, so the button says so
  // rather than sending anyone to a Discord error page.
  if (!/^\d{17,20}$/.test(clientId)) {
    invite.textContent = 'Run your own';
    invite.setAttribute('href', '#self-host');
    note.hidden = false;
    note.innerHTML =
      'No public instance yet. Put your application id in <code>docs/config.js</code> and this becomes an invite link.';
    return;
  }

  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', config.permissions ?? '0');

  invite.href = url.toString();
  invite.target = '_blank';
  invite.rel = 'noopener';
  note.hidden = false;
  note.textContent = 'You need Manage Server on the server you are adding it to.';
})();
