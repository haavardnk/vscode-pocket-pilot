(function () {
  var colors = { latte: '#eff1f5', frappe: '#303446', macchiato: '#24273a', mocha: '#1e1e2e' };
  var accents = [
    'rosewater',
    'flamingo',
    'pink',
    'mauve',
    'red',
    'maroon',
    'peach',
    'yellow',
    'green',
    'teal',
    'sky',
    'sapphire',
    'blue'
  ];
  function stored(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  var accent = stored('pocket-pilot-accent');
  if (accents.indexOf(accent) !== -1) document.documentElement.setAttribute('data-accent', accent);
  var choice = stored('pocket-pilot-theme');
  if (!choice || !colors[choice]) return;
  document.documentElement.setAttribute('data-theme', choice);
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var index = 0; index < metas.length; index += 1)
    metas[index].setAttribute('content', colors[choice]);
})();
