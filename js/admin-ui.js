/* ============================================================
   admin-ui.js — comportamiento visual del panel (admin.html)
   ------------------------------------------------------------
   NO toca datos, Firebase ni permisos. Solo:
   - abre/cierra la barra lateral en celular y tablet
   - marca en <#adminDashView data-tab="..."> cuál pestaña está activa
     (para mostrar "+ Agregar producto" solo en Inventario)
   - escribe la descripción breve debajo del título
   - lleva la vista al formulario "Agregar producto" al abrirlo
   Se carga DESPUÉS de js/admin.js.
   ============================================================ */
(function () {
  'use strict';
  const dash = document.getElementById('adminDashView');
  if (!dash) return;

  const sidebar = document.getElementById('apSidebar');
  const burger = document.getElementById('apBurger');
  const backdrop = document.getElementById('apBackdrop');

  function abrirMenu() {
    dash.classList.add('ap-menu-open');
    if (burger) burger.setAttribute('aria-expanded', 'true');
  }
  function cerrarMenu() {
    dash.classList.remove('ap-menu-open');
    if (burger) burger.setAttribute('aria-expanded', 'false');
  }
  if (burger) burger.addEventListener('click', () => (dash.classList.contains('ap-menu-open') ? cerrarMenu() : abrirMenu()));
  if (backdrop) backdrop.addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 980) cerrarMenu(); });
  // al elegir una pestaña o una acción de la barra lateral en celular, se cierra el menú
  if (sidebar) sidebar.addEventListener('click', (e) => { if (e.target.closest('button, a')) cerrarMenu(); });

  /* pestaña activa → atributo data-tab + descripción */
  const tabs = {
    tabBtnResumen: ['resumen', 'Ventas, pedidos recientes y Voltage Club en un vistazo.'],
    tabBtnInventario: ['inventario', 'Consulta, busca, filtra y edita tus productos, precios y existencias.'],
    tabBtnPedidos: ['pedidos', 'Revisa y gestiona los pedidos de tus clientes.'],
    tabBtnMensajes: ['mensajes', 'Lee, busca y responde los mensajes del formulario de Contacto de la tienda.'],
    tabBtnDrop: ['drop', 'Configura la cuenta regresiva y los productos del próximo lanzamiento.'],
    tabBtnEnvios: ['envios', 'Define cuánto pagan tus clientes de envío en cada zona (paso 3 del carrito).'],
    tabBtnUsuarios: ['usuarios', 'Administra quién puede entrar al panel y qué puede hacer.'],
  };
  const sub = document.getElementById('apSubtitulo');
  function sincronizarTab() {
    const activo = Object.keys(tabs).find(id => {
      const b = document.getElementById(id);
      return b && b.classList.contains('active');
    });
    dash.dataset.tab = activo ? tabs[activo][0] : '';
    if (sub) sub.textContent = activo ? tabs[activo][1] : '';
  }
  const obs = new MutationObserver(sincronizarTab);
  Object.keys(tabs).forEach(id => {
    const b = document.getElementById(id);
    if (b) obs.observe(b, { attributes: true, attributeFilter: ['class'] });
  });
  sincronizarTab();

  /* al abrir "Agregar producto", mostrar el formulario */
  const btnNuevo = document.getElementById('btnMostrarNuevo');
  const cardNuevoEl = document.getElementById('cardNuevoProducto');
  if (btnNuevo && cardNuevoEl) {
    btnNuevo.addEventListener('click', () => {
      setTimeout(() => {
        if (cardNuevoEl.style.display !== 'none') {
          cardNuevoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const n = document.getElementById('nProdNombre');
          if (n) n.focus({ preventScroll: true });
        }
      }, 30);
    });
  }
})();

/* ============================================================
   confirmarAccion({ titulo, mensaje, textoOk, textoCancelar, peligro })
   → Promise<boolean>
   Reemplaza al confirm() del navegador por un diálogo con la
   identidad de la tienda. Accesible: role="alertdialog", foco
   atrapado, Escape cancela y el foco vuelve a donde estaba.
   ============================================================ */
window.confirmarAccion = function (opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var previo = document.activeElement;
    var fondo = document.createElement('div');
    fondo.className = 'mq-confirm-fondo';
    var caja = document.createElement('div');
    caja.className = 'mq-confirm' + (opts.peligro ? ' es-peligro' : '');
    caja.setAttribute('role', 'alertdialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-labelledby', 'mqConfirmTitulo');
    caja.setAttribute('aria-describedby', 'mqConfirmTexto');
    var h = document.createElement('h3'); h.id = 'mqConfirmTitulo'; h.textContent = opts.titulo || '¿Seguro?';
    var p = document.createElement('p'); p.id = 'mqConfirmTexto'; p.textContent = opts.mensaje || '';
    var fila = document.createElement('div'); fila.className = 'mq-confirm-botones';
    var bNo = document.createElement('button'); bNo.type = 'button'; bNo.className = 'mq-confirm-no'; bNo.textContent = opts.textoCancelar || 'Cancelar';
    var bSi = document.createElement('button'); bSi.type = 'button'; bSi.className = 'mq-confirm-si'; bSi.textContent = opts.textoOk || 'Confirmar';
    fila.appendChild(bNo); fila.appendChild(bSi);
    caja.appendChild(h); caja.appendChild(p); caja.appendChild(fila);
    fondo.appendChild(caja); document.body.appendChild(fondo);
    function cerrar(valor) {
      document.removeEventListener('keydown', teclas, true);
      fondo.remove();
      if (previo && previo.focus) { try { previo.focus(); } catch (e) {} }
      resolve(valor);
    }
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
      else if (e.key === 'Tab') {
        var f = [bNo, bSi], i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
    document.addEventListener('keydown', teclas, true);
    bNo.addEventListener('click', function () { cerrar(false); });
    bSi.addEventListener('click', function () { cerrar(true); });
    fondo.addEventListener('mousedown', function (e) { if (e.target === fondo) cerrar(false); });
    (opts.peligro ? bNo : bSi).focus();   // en acciones peligrosas el foco empieza en "Cancelar"
  });
};
