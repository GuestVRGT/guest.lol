(async function() {
  const status = document.getElementById('status');
  const setStatus = m => { if (status) status.textContent = m; };
  async function loadSplit(name, n) {
    setStatus('Loading Gorilla Tag ' + name.replace('faces-','').replace('.js','') + '…');
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = await fetch('./' + name + '.p' + i + '.txt?v=gt8').then(r => {
        if (!r.ok) throw new Error('missing ' + name + '.p' + i);
        return r.text();
      });
      parts.push(t.trim());
    }
    const bin = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
    (0, eval)(new TextDecoder().decode(bin));
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src + '?v=gt8';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('missing ' + src));
      document.head.appendChild(s);
    });
  }
  try {
    await loadSplit('faces-idle.js', 28);
    await loadSplit('faces-talk.js', 13);
    await loadSplit('faces-bolt.js', 3);
    await loadScript('app.js');
    setStatus('Pick a face & load audio!');
  } catch (e) {
    console.error(e);
    setStatus('Load failed: ' + e.message);
  }
})();
