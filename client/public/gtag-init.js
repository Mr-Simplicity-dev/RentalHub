(function () {
  var script = document.currentScript;
  var gaId = script ? script.getAttribute('data-ga-id') : '';
  if (!gaId || gaId === '%REACT_APP_GA_ID%') return;

  var s = document.createElement('script');
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
  s.async = true;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', gaId);
  window.gtag = gtag;
})();
