(async function() {
  const status = document.getElementById('status');
  const setStatus = m => { if (status) status.textContent = m; };
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src + '?v=gt9';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('missing ' + src));
      document.head.appendChild(s);
    });
  }
  try {
    setStatus('Loading Gorilla Tag faces…');
    await loadScript('core.js');
    setStatus('Loading app…');
    await loadScript('app.js');
    setStatus('Pick a face & load audio!');
  } catch (e) {
    console.error(e);
    setStatus('Load failed: ' + e.message);
  }
})();
