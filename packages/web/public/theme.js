(function () {
  var colors = { latte: '#eff1f5', frappe: '#303446', macchiato: '#24273a', mocha: '#1e1e2e' };
  var choice = (function () {
    try {
      return localStorage.getItem('pocket-pilot-theme');
    } catch {
      return null;
    }
  })();
  if (!choice || !colors[choice]) return;
  document.documentElement.setAttribute('data-theme', choice);
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var index = 0; index < metas.length; index += 1)
    metas[index].setAttribute('content', colors[choice]);
})();
