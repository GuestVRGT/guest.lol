(function() {
  var parts = window.__FE_PARTS || [];
  var b64 = parts.join('');
  var bin = atob(b64);
  var s = document.createElement('script');
  s.textContent = bin;
  document.head.appendChild(s);
})();
