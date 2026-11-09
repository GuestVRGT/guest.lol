(async function() {
  const status = document.getElementById('status');
  const setStatus = m => { if (status) status.textContent = m; };
  async function loadScript(src) {
    setStatus('Loading ' + src + '…');
    const code = await fetch(src + '?v=gt5').then(r => {
      if (!r.ok) throw new Error('missing ' + src);
      return r.text();
    });
    // core.js is async loader — wait for idleData
    if (src === 'core.js') {
      await eval('(async()=>{' + code.replace(/^\(async function\(\) \{|\}\)\(\);?$/g,'') + '})()');
      // simpler: run and poll
    }
    const result = eval(code);
    if (result && typeof result.then === 'function') await result;
    // wait until idleData is set
    if (src === 'core.js') {
      for (let i = 0; i < 50; i++) {
        if (window.idleData && window.idleData.Default) break;
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }
  async function loadSplit(name, n) {
    setStatus('Loading mouth frames…');
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = await fetch('./' + name + '.p' + i + '.txt?v=gt5').then(r => {
        if (!r.ok) throw new Error('missing ' + name + '.p' + i);
        return r.text();
      });
      parts.push(t.trim());
    }
    const bin = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
    (0, eval)(new TextDecoder().decode(bin));
  }
  try {
    await loadScript('core.js');
    try { await loadSplit('default-talk', 9); } catch (e) { console.warn(e); }
    try { await loadScript('core-bolt.js'); } catch (e) { console.warn(e); }
    await loadScript('app.js');
    setStatus('Pick a face & load audio!');
  } catch (e) {
    console.error(e);
    setStatus('Load failed: ' + e.message);
  }
})();
