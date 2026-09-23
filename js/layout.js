/* ============================================================
   Inserta el menú de navegación y el pie de página en cada
   html. Reemplaza a includes/header.php e includes/footer.php
   (aquí no existe "require" del lado del servidor, así que se
   inyecta el mismo HTML con JavaScript).
   ============================================================ */

function renderHeader(paginaActual = "") {
  const cont = document.getElementById("site-header");
  if (!cont) return;
  window._paginaActualHeader = paginaActual;
  /* Firebase confirma la sesión de forma asíncrona; en cuanto lo
     haga, este mismo renderHeader se vuelve a llamar solo, para
     que el botón de "Iniciar sesión" cambie a la cuenta del
     cliente sin que la persona tenga que recargar la página. */
  if (!window._sesionListenerRegistrado && typeof onCambioSesion === 'function') {
    window._sesionListenerRegistrado = true;
    onCambioSesion(() => renderHeader(window._paginaActualHeader));
  }
  const total = totalCarritoCount();
  const usuario = usuarioActual();
  /* "Categorías" ahora es una página aparte (categorias.html), no un
     desplegable sobre productos.html — se resalta sola, y "Tienda"
     se resalta con su propia condición simple, sin depender de la
     URL de la otra. */

  const inicial = usuario ? usuario.nombre.trim().charAt(0).toUpperCase() : '';
  const cuentaHtml = usuario
    ? `
      <div class="account-menu">
        <button class="account-btn account-btn-in" id="accountBtn">
          <span class="account-avatar">${inicial}</span>
          <span class="account-name">${usuario.nombre.split(' ')[0]}</span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="account-dropdown" id="accountDropdown">
          <div class="account-dropdown-hi">
            <span class="account-avatar account-avatar-lg">${inicial}</span>
            <div>
              <div class="account-dropdown-name">${usuario.nombre}</div>
              <div class="account-dropdown-sub">Voltage Club ⚡</div>
            </div>
          </div>
          <a href="#" id="btnCerrarSesion" class="logout-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            <span>Cerrar sesión</span>
          </a>
        </div>
      </div>`
    : `
      <a href="login.html" class="account-btn">
        <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
        <span class="account-name">Iniciar sesión</span>
      </a>`;

  cont.innerHTML = `
    <div class="topbar">
      <span>⚡ DRIP PARA GENTE QUE YA TRAE SU PROPIA ENERGÍA — ENVÍOS A TODA COLOMBIA</span>
    </div>
    ${!usuario ? `
    <div class="subbar">
      <span>Regístrate o inicia sesión para desbloquear tu Voltage Club</span>
      <a href="login.html">Entrar →</a>
    </div>` : ''}
    <nav class="nav">
      <a href="index.html" class="nav-logo">
        <span class="logo-mark">⚡</span><span class="logo-text display">MA<em>QUINA</em></span>
      </a>
      <div class="nav-links">
        <a href="index.html" class="${paginaActual === 'inicio' ? 'active' : ''}">Inicio</a>
        <a href="catalogo.html" class="${paginaActual === 'catalogo' ? 'active' : ''}">Catálogo</a>
        <a href="productos.html" class="${paginaActual === 'productos' ? 'active' : ''}">Tienda</a>
        <a href="categorias.html" class="${paginaActual === 'categorias' ? 'active' : ''}">Categorías</a>
        <a href="servicios.html" class="${paginaActual === 'servicios' ? 'active' : ''}">Contacto</a>
      </div>
      <div class="nav-right">
        <button class="icon-only-btn nav-burger" id="navBurger" aria-label="Abrir menú" aria-expanded="false">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <button class="icon-only-btn" id="searchBtn" aria-label="Buscar">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
        ${cuentaHtml}
        <a class="fav-pill" href="favoritos.html" aria-label="Mis favoritos" title="Mis favoritos">
          <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5s-7.6-4.6-10-9.3C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.7 5 2.3.1.15.3.15.4 0 1.1-1.6 3-2.6 5-2.3 3.3.5 5.1 3.8 3.6 7.2-2.4 4.7-10 9.3-10 9.3z"/></svg>
          <span id="favCount" class="fav-count ${totalFavoritosCount() === 0 ? 'hidden' : ''}">${totalFavoritosCount()}</span>
        </a>
        <a class="cart-pill" href="carrito.html">
          <svg class="icon-btn cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.5 3h2l1.6 9.6a2 2 0 0 0 2 1.7h8.6a2 2 0 0 0 2-1.6l1.3-6.7H6.2"/>
            <circle cx="9.5" cy="19.5" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="16.5" cy="19.5" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
          <span id="cartCount" class="cart-count">${total}</span>
        </a>
      </div>
    </nav>

    <div class="mobile-nav" id="mobileNav">
      <div class="mobile-nav-top">
        <a href="index.html" class="nav-logo">
          <span class="logo-mark">⚡</span><span class="logo-text display">MA<em>QUINA</em></span>
        </a>
        <button class="search-close" id="mobileNavClose" aria-label="Cerrar menú">✕</button>
      </div>
      <div class="mobile-nav-links">
        <a href="index.html" class="${paginaActual === 'inicio' ? 'active' : ''}">Inicio</a>
        <a href="catalogo.html" class="${paginaActual === 'catalogo' ? 'active' : ''}">Catálogo</a>
        <a href="productos.html" class="${paginaActual === 'productos' ? 'active' : ''}">Tienda</a>
        <a href="categorias.html" class="${paginaActual === 'categorias' ? 'active' : ''}">Categorías</a>
        <a href="servicios.html" class="${paginaActual === 'servicios' ? 'active' : ''}">Contacto</a>
        <a href="index.html#club">Voltage Club</a>
        <a href="favoritos.html">Mis favoritos</a>
      </div>
      <div class="mobile-nav-foot">
        ${usuario
          ? `<a href="#" id="mobileLogout">Cerrar sesión</a>`
          : `<a href="login.html" class="mobile-nav-primary">Iniciar sesión</a><a href="registro.html">Crear cuenta</a>`}
      </div>
    </div>

    <div class="search-overlay" id="searchOverlay">
      <div class="search-box">
        <svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="searchInput" placeholder="Busca por nombre… ej: Buso Volt, Gorra, Cargo" autocomplete="off">
        <button class="search-close" id="searchClose" aria-label="Cerrar">✕</button>
      </div>
      <div class="search-results" id="searchResults"></div>
    </div>
  `;

  const accBtn = document.getElementById('accountBtn');
  const accDrop = document.getElementById('accountDropdown');
  if (accBtn && accDrop) {
    accBtn.addEventListener('click', () => accDrop.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!accBtn.contains(e.target) && !accDrop.contains(e.target)) accDrop.classList.remove('open');
    });
  }
  const btnCerrar = document.getElementById('btnCerrarSesion');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', (e) => {
      e.preventDefault();
      btnCerrar.classList.add('logging-out');
      setTimeout(() => {
        cerrarSesion();
        window.location.href = 'login.html';
      }, 260);
    });
  }

  /* ---- menú móvil (hamburguesa) ---- */
  const navBurger = document.getElementById('navBurger');
  const mobileNav = document.getElementById('mobileNav');
  const mobileNavClose = document.getElementById('mobileNavClose');
  if (navBurger && mobileNav) {
    const abrirMenu = () => {
      mobileNav.classList.add('open');
      navBurger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    };
    const cerrarMenu = () => {
      mobileNav.classList.remove('open');
      navBurger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };
    navBurger.addEventListener('click', abrirMenu);
    if (mobileNavClose) mobileNavClose.addEventListener('click', cerrarMenu);
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', cerrarMenu));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) cerrarMenu();
    });
    const mobileLogout = document.getElementById('mobileLogout');
    if (mobileLogout) {
      mobileLogout.addEventListener('click', (e) => {
        e.preventDefault();
        cerrarSesion();
        window.location.href = 'login.html';
      });
    }
  }

  initSearch();
}

/* ============================================================
   BUSCADOR GLOBAL
   Disponible en toda página que tenga #site-header. Filtra
   PRODUCTS por nombre/categoría en vivo y al hacer clic o Enter
   lleva a productos.html?buscar=<id>, donde ese producto se
   resalta y hace scroll automático hacia él.
   ============================================================ */
function initSearch() {
  const overlay = document.getElementById('searchOverlay');
  const btn = document.getElementById('searchBtn');
  const input = document.getElementById('searchInput');
  const closeBtn = document.getElementById('searchClose');
  const results = document.getElementById('searchResults');
  if (!overlay || !btn || typeof productosActivos !== 'function') return;

  const abrir = () => {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 60);
  };
  const cerrar = () => {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    input.value = '';
    pintar('');
  };

  function pintar(termino) {
    const t = termino.trim().toLowerCase();
    if (!t) {
      results.innerHTML = `<div class="search-hint">Escribe el nombre de una prenda — "Buso Volt", "Gorra", "Cargo"…</div>`;
      return;
    }
    const lista = productosActivos().filter(p =>
      p.nombre.toLowerCase().includes(t) || p.categoria.toLowerCase().includes(t)
    );
    if (lista.length === 0) {
      results.innerHTML = `<div class="search-hint">No encontramos nada con "${termino}". Prueba con otra palabra 🔍</div>`;
      return;
    }
    results.innerHTML = lista.slice(0, 6).map(p => `
      <a href="producto.html?id=${p.id}" class="search-result">
        <div class="search-result-icon" style="background:${p.colores[0]}33">${iconoProducto(p.icono, p.colores[0])}</div>
        <div class="search-result-info">
          <div class="search-result-name">${p.nombre}</div>
          <div class="search-result-cat">${p.categoria}</div>
        </div>
        <div class="search-result-price mono">$${Number(p.precio).toLocaleString('es-CO')}</div>
      </a>`).join('');
  }

  btn.addEventListener('click', abrir);
  closeBtn.addEventListener('click', cerrar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); abrir(); }
    if (e.key === 'Escape' && overlay.classList.contains('open')) cerrar();
  });
  input.addEventListener('input', () => pintar(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const primero = results.querySelector('.search-result');
      if (primero) window.location.href = primero.getAttribute('href');
    }
  });
  pintar('');
}

function renderFooter() {
  const cont = document.getElementById("site-footer");
  if (!cont) return;
  cont.innerHTML = `
    <footer class="footer-contacto">
      <div class="footer-cta">
        <div class="footer-cta-text">
          <span class="footer-cta-bolt">⚡</span>
          <div>
            <h3>¿Ya tienes tu drip?</h3>
            <p>Métete al Voltage Club y entérate primero de cada caída — antes que se agote.</p>
          </div>
        </div>
        <a href="index.html#club" class="footer-cta-btn">Quiero entrar →</a>
      </div>

      <div class="footer-inner">
        <div class="footer-brand">
          <a href="index.html" class="foot-logo display"><span class="logo-mark">⚡</span>MA<em>QUINA</em></a>
          <p class="footer-slogan">Drip para gente que ya trae su propia energía.</p>
          <div class="footer-socials">
            <a href="https://www.instagram.com/maquina.oficial/" target="_blank" rel="noopener" class="social-pill ig">📸 @maquina.oficial</a>
            <a href="https://tiktok.com/@maquina" target="_blank" rel="noopener" class="social-pill tk">🎵 TikTok</a>
            <a href="https://facebook.com/maquina" target="_blank" rel="noopener" class="social-pill fb">📘 Facebook</a>
          </div>
        </div>

        <div class="footer-col">
          <h4>CONTÁCTANOS</h4>
          <ul>
            <li><a href="tel:+573239523623">📞 +57 323 952 3623</a></li>
            <li><a href="https://wa.me/573239523623" target="_blank" rel="noopener">💬 WhatsApp: +57 323 952 3623</a></li>
            <li><a href="mailto:contacto@maquina.co">✉️ contacto@maquina.co</a></li>
            <li>📍 Calle 50 #45-30, Medellín, Colombia</li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>REDES SOCIALES</h4>
          <ul class="redes">
            <li><a href="https://www.instagram.com/maquina.oficial/" target="_blank" rel="noopener">📸 Instagram: @maquina.oficial</a></li>
            <li><a href="https://tiktok.com/@maquina" target="_blank" rel="noopener">🎵 TikTok: @maquina</a></li>
            <li><a href="https://facebook.com/maquina" target="_blank" rel="noopener">📘 Facebook: MAQUINA</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>LEGAL</h4>
          <ul>
            <li><a href="legal.html#cambios-devoluciones">Cambios y devoluciones</a></li>
            <li><a href="legal.html#garantia">Garantía</a></li>
            <li><a href="legal.html#terminos">Términos y condiciones</a></li>
            <li><a href="legal.html#datos-personales">Tratamiento de datos</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 MAQUINA — Todos los derechos reservados. <span class="hand">hecho en Medellín ⚡</span></p>
        <a href="admin.html" class="footer-admin-link">Panel del vendedor</a>
      </div>
    </footer>
  `;
}

/* ============================================================
   ANIMACIONES AL HACER SCROLL ("reveal")
   Busca cualquier elemento con class="reveal" (o sus variantes
   reveal-left / reveal-right / reveal-scale) y le agrega
   "visible" apenas entra a la pantalla, usando IntersectionObserver.

   Se puede llamar varias veces sin problema (por ejemplo, después
   de pintar un grid de productos que llega de Firestore): los
   elementos ya observados se saltan gracias a data-revealBound.

   Respeta "reducir movimiento" del sistema operativo: si el
   usuario lo tiene activado, los elementos aparecen de una vez,
   sin animación.
   ============================================================ */
let _revealObserver = null;

function initScrollReveal() {
  const elementos = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
  if (!elementos.length) return;

  const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefiereMenosMovimiento || !('IntersectionObserver' in window)) {
    elementos.forEach(el => el.classList.add('visible'));
    return;
  }

  if (!_revealObserver) {
    _revealObserver = new IntersectionObserver((entradas) => {
      entradas.forEach(entrada => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          _revealObserver.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  }

  elementos.forEach(el => {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    _revealObserver.observe(el);
  });
}

// Corre automáticamente en cada página apenas carga el HTML.
// Si una página agrega elementos ".reveal" después (por ejemplo,
// tarjetas de producto que llegan de Firestore), esa página debe
// volver a llamar initScrollReveal() luego de pintarlos.
document.addEventListener('DOMContentLoaded', initScrollReveal);
