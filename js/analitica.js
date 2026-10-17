/* ============================================================
   ANALÍTICA DE LA TIENDA (Firebase Analytics = Google Analytics 4)
   Usa el measurementId que ya está en js/firebase-config.js, así que
   no hace falta crear nada nuevo: los datos se ven en
   Firebase Console → Analytics (o analytics.google.com).

   · Nunca rompe la tienda: si Analytics no carga (bloqueador de anuncios,
     sin internet, navegador sin soporte) las funciones no hacen nada.
   · Respeta "No rastrear" (Do Not Track) del navegador.
   · NO se envían datos personales: ni nombre, ni correo, ni teléfono,
     ni dirección. Solo productos, montos y pasos del proceso de compra.
   · No se carga en admin.html (las visitas del equipo no cuentan).

   Eventos: view_item, add_to_cart, view_cart, begin_checkout,
   checkout_paso, checkout_error, purchase, generate_lead, notify_me.
   ============================================================ */
(function () {
  'use strict';
  var an = null;
  try {
    var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1';
    if (!dnt && window.firebase && typeof firebase.analytics === 'function') an = firebase.analytics();
  } catch (e) { an = null; }

  /** track('evento', { ...parametros }) — seguro: nunca lanza error. */
  window.track = function (nombre, params) {
    try { if (an) an.logEvent(nombre, params || {}); } catch (e) { /* sin analítica */ }
  };
  /** Un producto en el formato de GA4. */
  window.gaItem = function (p, extra) {
    p = p || {};
    var it = {
      item_id: String(p.id == null ? '' : p.id),
      item_name: String(p.nombre || ''),
      item_category: String(p.categoria || ''),
      price: Number(p.precio) || 0,
      quantity: 1
    };
    if (p.color) it.item_variant = String(p.color) + (p.talla ? ' / ' + p.talla : '');
    else if (p.talla) it.item_variant = String(p.talla);
    if (extra) for (var k in extra) it[k] = extra[k];
    return it;
  };
  /** Lista de unidades del carrito -> items de GA4, y su valor total. */
  window.gaItems = function (lista) {
    return (lista || []).map(function (i) { return window.gaItem(i); });
  };
  window.gaValor = function (lista) {
    return (lista || []).reduce(function (s, i) { return s + (Number(i.precio) || 0); }, 0);
  };
})();
