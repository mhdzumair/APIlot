try {
  var api = (typeof browser !== 'undefined' && browser.devtools) ? browser : chrome;
  api.devtools.panels.create('APIlot', '', '/panel.html');
} catch (e) {
  console.warn('[APIlot] devtools panel registration failed:', e);
}
