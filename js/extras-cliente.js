/* ============================================================
   extras-cliente.js — mejoras para el celular y la confianza
   ------------------------------------------------------------
   Se carga DESPUÉS de layout.js y maquina-ui.js. No toca datos,
   Firebase, carrito ni favoritos: solo reutiliza sus funciones.

   1) Barra inferior en celular (Inicio · Tienda · Favoritos ·
      Carrito · Cuenta)
   2) Guía de tallas (botón junto a "Talla" en producto y vista
      rápida)
   3) Bloque de confianza + ayuda por WhatsApp en la página del
      producto
   4) Barra fija "Agregar al carrito" en celular (producto)
   ============================================================ */
(function () {
  'use strict';
  if (!document.getElementById('site-header')) return;

  const WHATSAPP = '573239523623';   /* mismo número del pie de página */

  /* ------------------------------------------------------------
     MEDIDAS DE LA GUÍA DE TALLAS — EDITA AQUÍ
     Son medidas de REFERENCIA (prenda tendida, en centímetros).
     Cámbialas por las medidas reales de tus prendas.
     ------------------------------------------------------------ */
  const GUIA_TALLAS = {
    'Busos, camisetas y chaquetas': {
      cols: ['Talla', 'Ancho de pecho', 'Largo', 'Manga'],
      filas: [
        ['S',  '56', '70', '22'],
        ['M',  '58', '72', '23'],
        ['L',  '60', '74', '24'],
        ['XL', '62', '76', '25'],
      ],
      nota: 'El ancho de pecho se mide de axila a axila, con la prenda tendida.',
    },
    'Pantalones y shorts': {
      cols: ['Talla', 'Cintura (sin estirar)', 'Largo total', 'Tiro'],
      filas: [
        ['S',  '36', '100', '28'],
        ['M',  '38', '102', '29'],
        ['L',  '40', '104', '30'],
        ['XL', '42', '106', '31'],
      ],
      nota: 'En shorts el largo total es menor; usa la cintura como guía principal.',
    },
    'Gorras': {
      cols: ['Talla', 'Ajuste'],
      filas: [['Única', 'Ajustable, para la mayoría de cabezas']],
      nota: '',
    },
  };
  const GRUPO_POR_CATEGORIA = {
    Busos: 0, Camisetas: 0, Chaquetas: 0, Pantalones: 1, Shorts: 1, Gorras: 2,
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const archivo = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const esMovil = () => window.matchMedia('(max-width:760px)').matches;

  /* ============================================================
     1) BARRA INFERIOR (solo se ve en celular por CSS)
     ============================================================ */
  const ICO = {
    inicio: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    tienda: '<path d="M4 7h16l-1.5 13h-13L4 7z"/><path d="M8 7a4 4 0 0 1 8 0"/>',
    fav:    '<path d="M12 20.5s-7.6-4.6-10-9.3C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.7 5 2.3.1.15.3.15.4 0 1.1-1.6 3-2.6 5-2.3 3.3.5 5.1 3.8 3.6 7.2-2.4 4.7-10 9.3-10 9.3z"/>',
    carro:  '<path d="M2.5 3h2l1.6 9.6a2 2 0 0 0 2 1.7h8.6a2 2 0 0 0 2-1.6l1.3-6.7H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="16.5" cy="19.5" r="1.3"/>',
    user:   '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

  function activoEnBarra() {
    if (archivo === 'index.html' || archivo === '') return 'inicio';
    if (['productos.html', 'producto.html', 'catalogo.html', 'categorias.html'].includes(archivo)) return 'tienda';
    if (archivo === 'favoritos.html') return 'fav';
    if (archivo === 'carrito.html') return 'carro';
    if (['login.html', 'registro.html'].includes(archivo)) return 'user';
    return '';
  }

  function crearBarra() {
    if (document.getElementById('cfBnav')) return;
    const act = activoEnBarra();
    const nav = document.createElement('nav');
    nav.id = 'cfBnav';
    nav.className = 'cf-bnav';
    nav.setAttribute('aria-label', 'Navegación rápida');
    const item = (k, txt, href, extra = '') =>
      `<a href="${href}" class="cf-bn ${act === k ? 'is-on' : ''}" data-k="${k}" ${act === k ? 'aria-current="page"' : ''}>${svg(k)}${extra}<span>${txt}</span></a>`;
    nav.innerHTML =
      item('inicio', 'Inicio', 'index.html') +
      item('tienda', 'Tienda', 'productos.html') +
      item('fav', 'Favoritos', 'favoritos.html', '<b class="cf-badge" data-badge="fav" hidden></b>') +
      item('carro', 'Carrito', 'carrito.html', '<b class="cf-badge" data-badge="carro" hidden></b>') +
      item('user', 'Cuenta', 'login.html');
    document.body.appendChild(nav);
    document.body.classList.add('has-bnav');

    /* el carrito abre el panel lateral (igual que el icono del encabezado) */
    nav.querySelector('[data-k="carro"]').addEventListener('click', (e) => {
      if (document.body.classList.contains('carrito-page') || typeof ydAbrirCarrito !== 'function') return;
      e.preventDefault();
      ydAbrirCarrito();
    });
    /* con sesión iniciada, "Cuenta" abre el menú del celular */
    nav.querySelector('[data-k="user"]').addEventListener('click', (e) => {
      if (typeof usuarioActual === 'function' && usuarioActual()) {
        const b = document.getElementById('navBurger');
        if (b) { e.preventDefault(); b.click(); }
      }
    });
    sincronizarBarra();
  }

  function sincronizarBarra() {
    const nav = document.getElementById('cfBnav');
    if (!nav) return;
    const set = (clave, n) => {
      const b = nav.querySelector(`[data-badge="${clave}"]`);
      if (!b) return;
      const txt = n > 99 ? '99+' : String(n);
      if (b.hidden !== !(n > 0)) b.hidden = !(n > 0);
      if (b.textContent !== txt) b.textContent = txt;
    };
    try { set('carro', typeof totalCarritoCount === 'function' ? totalCarritoCount() : 0); } catch (e) {}
    try { set('fav', typeof totalFavoritosCount === 'function' ? totalFavoritosCount() : 0); } catch (e) {}
    const u = typeof usuarioActual === 'function' ? usuarioActual() : null;
    const cuenta = nav.querySelector('[data-k="user"] span');
    const nombreCuenta = u ? String(u.nombre || 'Cuenta').split(' ')[0] : 'Cuenta';
    if (cuenta && cuenta.textContent !== nombreCuenta) cuenta.textContent = nombreCuenta;
  }

  /* ============================================================
     2) GUÍA DE TALLAS
     ============================================================ */
  function categoriaDelProductoActual(dentroDeVistaRapida) {
    try {
      const id = dentroDeVistaRapida
        ? (typeof _ydQvEstado !== 'undefined' && _ydQvEstado ? _ydQvEstado.id : null)
        : new URLSearchParams(location.search).get('id');
      const p = id != null && typeof buscarProducto === 'function' ? buscarProducto(id) : null;
      return p ? p.categoria : '';
    } catch (e) { return ''; }
  }

  function abrirGuiaTallas(categoria) {
    cerrarGuia();
    const grupos = Object.keys(GUIA_TALLAS);
    let g = GRUPO_POR_CATEGORIA[categoria];
    if (g == null) g = 0;

    const back = document.createElement('div');
    back.className = 'cf-modal-back';
    back.id = 'cfGuia';
    back.innerHTML = `
      <div class="cf-modal" role="dialog" aria-modal="true" aria-label="Guía de tallas">
        <button class="cf-x" type="button" aria-label="Cerrar">✕</button>
        <h3>Guía de tallas</h3>
        <p class="cf-sub">Medidas de la prenda tendida, en centímetros.</p>
        <div class="cf-tabs" role="tablist">${grupos.map((n, i) => `<button type="button" role="tab" class="${i === g ? 'is-on' : ''}" data-g="${i}">${esc(n)}</button>`).join('')}</div>
        <div class="cf-tabla-wrap" id="cfTabla"></div>
        <ul class="cf-tips">
          <li>¿Entre dos tallas? Elige la más grande si te gusta suelto (oversize).</li>
          <li>Tienes <b>15 días para cambiar talla o color</b> sin costo, con la prenda sin usar y su etiqueta.</li>
          <li>Las medidas pueden variar ±2 cm.</li>
        </ul>
        <a class="cf-wa" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola MAQUINA, necesito ayuda para elegir mi talla')}">💬 Pregúntanos por WhatsApp</a>
      </div>`;
    document.body.appendChild(back);
    document.body.classList.add('cf-lock');

    const pintar = (i) => {
      const t = GUIA_TALLAS[grupos[i]];
      document.getElementById('cfTabla').innerHTML = `
        <table class="cf-tabla"><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${t.filas.map(f => `<tr>${f.map((c, k) => k === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        ${t.nota ? `<p class="cf-nota">${esc(t.nota)}</p>` : ''}`;
    };
    pintar(g);
    back.querySelectorAll('.cf-tabs button').forEach(b => b.addEventListener('click', () => {
      back.querySelectorAll('.cf-tabs button').forEach(o => o.classList.toggle('is-on', o === b));
      pintar(Number(b.dataset.g));
    }));
    back.addEventListener('click', (e) => { if (e.target === back) cerrarGuia(); });
    back.querySelector('.cf-x').addEventListener('click', cerrarGuia);
    back.querySelector('.cf-x').focus();
  }
  function cerrarGuia() {
    const m = document.getElementById('cfGuia');
    if (m) m.remove();
    document.body.classList.remove('cf-lock');
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarGuia(); });

  /* pone el botón "Guía de tallas" junto a cada etiqueta "Talla" */
  function inyectarGuia() {
    document.querySelectorAll('#ydPdp .yd-lbl, #ydQv .yd-lbl, .yd-qv .yd-lbl').forEach(l => {
      if (l.dataset.cfGuia || l.textContent.trim().toLowerCase() !== 'talla') return;
      l.dataset.cfGuia = '1';
      l.classList.add('cf-lbl-talla');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cf-guia-btn';
      b.innerHTML = '📏 Guía de tallas';
      b.addEventListener('click', () => abrirGuiaTallas(categoriaDelProductoActual(!!l.closest('#ydQv'))));
      l.appendChild(b);
    });
  }

  /* ============================================================
     3) CONFIANZA + AYUDA POR WHATSAPP (página del producto)
     ============================================================ */
  function inyectarConfianza() {
    const acciones = document.querySelector('#ydPdp .yd-qv-actions');
    if (!acciones || document.getElementById('cfTrust')) return;
    const nombre = (document.querySelector('#ydPdp .yd-pdp-name') || {}).textContent || 'un producto';
    const box = document.createElement('div');
    box.id = 'cfTrust';
    box.className = 'cf-trust';
    box.innerHTML = `
      <ul>
        <li><b>Envío a toda Colombia</b><span>Con seguimiento de tu pedido. <a href="seguimiento.html">Rastrear</a></span></li>
        <li><b>Cambios en 15 días</b><span>De talla o color, con la prenda sin usar. <a href="legal.html#cambios-devoluciones">Ver política</a></span></li>
        <li><b>Garantía de fábrica</b><span>Cubrimos fallas de costura o material. <a href="legal.html#garantia">Ver garantía</a></span></li>
        <li><b>Pago seguro</b><span>Tarjeta, Nequi o contra entrega.</span></li>
      </ul>
      <a class="cf-wa" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola MAQUINA, tengo una duda sobre: ' + nombre.trim())}">💬 ¿Dudas con este producto? Escríbenos</a>`;
    acciones.insertAdjacentElement('afterend', box);
  }

  /* ============================================================
     4) BARRA FIJA DE COMPRA (solo celular, página del producto)
     ============================================================ */
  let observadorCTA = null;
  function barraCompra() {
    const add = document.getElementById('pdpAdd');
    if (!add || document.getElementById('cfSticky')) return;
    const precio = document.getElementById('pdpPrecio');
    const nombre = document.querySelector('#ydPdp .yd-pdp-name');
    const bar = document.createElement('div');
    bar.id = 'cfSticky';
    bar.className = 'cf-sticky';
    bar.innerHTML = `<div><strong></strong><span></span></div><button type="button">Agregar al carrito</button>`;
    document.body.appendChild(bar);

    const refrescar = () => {
      const setTxt = (el, t) => { if (el.textContent !== t) el.textContent = t; };
      setTxt(bar.querySelector('strong'), nombre ? nombre.textContent : '');
      const p = precio ? precio.cloneNode(true) : null;
      if (p) { p.querySelectorAll('.old').forEach(o => o.remove()); }
      setTxt(bar.querySelector('span'), p ? p.textContent.trim() : '');
      const b = bar.querySelector('button');
      if (b.disabled !== add.disabled) b.disabled = add.disabled;
      setTxt(b, add.disabled ? 'Agotado' : 'Agregar al carrito');
    };
    refrescar();
    /* mantiene precio y disponibilidad sincronizados con la página */
    new MutationObserver(refrescar).observe(document.getElementById('ydPdp'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });

    bar.querySelector('button').addEventListener('click', () => {
      /* si aún no eligió talla, lo lleva a ella; si ya eligió, agrega */
      const sinTalla = document.querySelector('#pdpTallas .yd-size') && !document.querySelector('#pdpTallas .yd-size.is-active');
      if (sinTalla) {
        const t = document.getElementById('pdpTallas');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      add.click();
    });

    /* solo aparece cuando el botón principal ya salió de la pantalla */
    if ('IntersectionObserver' in window) {
      observadorCTA = new IntersectionObserver(([en]) => {
        bar.classList.toggle('is-on', !en.isIntersecting && en.boundingClientRect.top < 0);
      }, { threshold: 0 });
      observadorCTA.observe(add);
    }
  }

  /* ============================================================
     ARRANQUE: la página pinta contenido de forma asíncrona, así
     que se observa el <body> y se completa lo que falte.
     ============================================================ */
  let pendiente = false;
  function pasada() {
    pendiente = false;
    crearBarra();
    sincronizarBarra();
    inyectarGuia();
    if (archivo === 'producto.html') { inyectarConfianza(); barraCompra(); }
  }
  function programar() {
    if (pendiente) return;
    pendiente = true;
    (window.requestAnimationFrame || setTimeout)(pasada);
  }
  document.addEventListener('DOMContentLoaded', () => {
    pasada();
    new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  });
  if (document.readyState !== 'loading') { pasada(); new MutationObserver(programar).observe(document.body, { childList: true, subtree: true }); }
})();
