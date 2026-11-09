(async function() {
  const status = document.getElementById('status');
  function setStatus(m) { if (status) status.textContent = m; }
  async function loadSplit(name, n) {
    setStatus('Loading faces (' + name + ')…');
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = await fetch('./' + name + '.p' + i + '.txt?v=gt2').then(r => {
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
    const code = await fetch(src + '?v=gt2').then(r => {
      if (!r.ok) throw new Error('missing ' + src);
      return r.text();
    });
    (0, eval)(code);
  }
  try {
    await loadSplit('idle-data.js', 7);
    await loadSplit('talking-0.js', 9);
    await loadScript('talking-1.js');
    await loadSplit('talking-2.js', 8);
    await loadSplit('talking-3.js', 8);
    await loadSplit('talking-4.js', 9);
    await loadSplit('talking-5.js', 8);
    await loadSplit('talking-6.js', 8);
    await loadSplit('talking-7.js', 8);
    await loadSplit('talking-8.js', 9);
    await loadSplit('talking-9.js', 9);
    await loadSplit('talking-10.js', 8);
    await loadScript('bolt-data.js');
    await loadScript('app.js');
    setStatus('Pick a face & load audio!');
  } catch (e) {
    console.error(e);
    setStatus('Load failed: ' + e.message + ' (face packs still uploading)');
  }
})();
