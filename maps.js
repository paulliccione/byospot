/* Loads Places UI Kit only when config.js has a browser key. No key: do nothing. */
(function () {
  var cfg = window.BYO_CONFIG || {};
  var key = String(cfg.googleMapsApiKey || "").trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(key)) return;
  window.BYO_PLACES = "loading";
  // Google's dynamic library import. https://developers.google.com/maps/documentation/javascript/load-maps-js-api
  (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
    key: key,
    v: "weekly"
  });
  function dropRatings() {
    var nodes = document.querySelectorAll("gmp-place-details-compact.google-rating");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
  }
  if (!window.google || !google.maps || !google.maps.importLibrary) {
    window.BYO_PLACES = "failed";
    dropRatings();
    return;
  }
  google.maps.importLibrary("places").then(function () {
    window.BYO_PLACES = "ready";
  }).catch(function () {
    window.BYO_PLACES = "failed";
    dropRatings();
  });
})();
