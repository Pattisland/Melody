(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelector('[data-new-list]').click();
  await new Promise((r) => setTimeout(r, 500));
  const input = document.querySelector('[data-ask]');
  if (!input) return { error: 'no input' };
  input.value = '夜里开车';
  const confirm = Array.from(document.querySelectorAll('.dialog__actions .btn--filled')).pop();
  confirm.click();
  await new Promise((r) => setTimeout(r, 1200));
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  const lists = await repo.listPlaylists(store.state.profileId);
  return { hash: location.hash, lists: lists.map((l) => l.name) };
})()