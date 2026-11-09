(async function() {
  const status = document.getElementById('status');
  const setStatus = m => { if (status) status.textContent = m; };
  async function loadSplit(name, n) {
    setStatus('Loading mouth frames…');
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = await fetch('./' + name + '.p' + i + '.txt?v=gt3').then(r => {
        if (!r.ok) throw new Error('missing ' + name + '.p' + i);
        return r.text();
      });
      parts.push(t.trim());
    }
    const bin = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
    (0, eval)(new TextDecoder().decode(bin));
  }
  async function loadScript(src) {
    setStatus('Loading ' + src + '…');
    const code = await fetch(src + '?v=gt3').then(r => {
      if (!r.ok) throw new Error('missing ' + src);
      return r.text();
    });
    (0, eval)(code);
  }
  try {
    await loadScript('core.js');
    await loadSplit('default-talk', 9);
    await loadScript('app.js');
    setStatus('Pick a face & load audio!');
  } catch (e) {
    console.error(e);
    setStatus('Load failed: ' + e.message);
  }
})();
