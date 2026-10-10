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
    tabBtnResumen: ['resumen', 'Ventas, pedidos recientes, Voltage Club y costos de envío en un vistazo.'],
    tabBtnInventario: ['inventario', 'Consulta, busca, filtra y edita tus productos, precios y existencias.'],
    tabBtnPedidos: ['pedidos', 'Revisa y gestiona los pedidos de tus clientes.'],
    tabBtnDrop: ['drop', 'Configura la cuenta regresiva y los productos del próximo lanzamiento.'],
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
