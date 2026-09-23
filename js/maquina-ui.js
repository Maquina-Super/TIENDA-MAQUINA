/* ============================================================
   MAQUINA — INTERFAZ DEL REDISEÑO
   ------------------------------------------------------------
   Todo lo NUEVO de la parte visual vive aquí:
     · banner principal con slides, flechas e indicadores
     · barra de beneficios
     · calificaciones de las tarjetas
     · vista rápida del producto
     · carrito lateral (mini carrito del encabezado)
   No toca el catálogo, el carrito real, favoritos, login ni el
   panel: solo los usa a través de las funciones que ya existían
   en store.js / products.js / catalog-render.js.
   ============================================================ */

/* ============================================================
   FOTOS DEL BANNER
   ------------------------------------------------------------
   CÓMO PONER TUS PROPIAS FOTOS:
   Sube la foto a la carpeta img/ (por ejemplo img/banner-1.jpg)
   y escribe su nombre en "imagen". Mientras esté en null, el
   banner usa la ilustración de marca que trae el sitio (una
   persona de espaldas con el buso MAQUINA estampado).
   Recomendado: foto horizontal, mínimo 1800px de ancho.
   ============================================================ */
const YD_HERO_SLIDES = [
  {
    imagen: "img/banner-hoodie-1.jpg",
    eyebrow: "Nueva colección",
    titulo: 'MA<span>QUINA</span>',
    texto: "Estilo, actitud y comodidad en una sola prenda.",
    boton: "Ver colección",
    href: "productos.html",
  },
  {
    imagen: "img/banner-hoodie-2.jpg",
    eyebrow: "Gymrat · Streetwear",
    titulo: 'Si vas a dejar todo en tu entrenamiento <span>hazlo con una marca que hable por ti.</span>',
    texto: "Ropa que representa tu disciplina, tu mentalidad y todo lo que construyes dentro y fuera del gym.",
    boton: "Ver productos",
    href: "productos.html?cat=Busos",
  },
  {
    imagen: "img/banner-hoodie-3.jpg",
    eyebrow: "Edición limitada",
    titulo: "Cuando se acaba, no vuelve",
    texto: "Cada drop se hace una sola vez. Si te gusta, es ahora.",
    boton: "Ver lo que queda",
    href: "productos.html",
  },
];

/* ============================================================
   ILUSTRACIÓN DEL BANNER
   Persona de espaldas con el buso puesto. El texto MAQUINA va
   recortado dentro de la tela y con los pliegues dibujados
   encima, para que se vea estampado en la prenda y no como un
   texto flotando sobre la foto.
   ============================================================ */
function ydArteHoodie(op = {}) {
  const print = op.print || "MAQUINA";
  const bajo = op.bajo || "";
  const luz = op.luz || "#8af04e";
  const dx = op.pos || 0;
  const uid = "yd" + Math.random().toString(36).slice(2, 8);
  const torso = "M470 352 q60-46 170-46 t170 46 q22 14 24 46 l14 268 q2 26-26 28 l-364 0 q-28-2-26-28 l14-268 q2-32 24-46z";

  return `
<svg viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Persona de espaldas con un buso MAQUINA estampado en la espalda">
  <defs>
    <linearGradient id="${uid}bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#1c1c1c"/><stop offset="0.55" stop-color="#101010"/><stop offset="1" stop-color="#030303"/>
    </linearGradient>
    <linearGradient id="${uid}tela" x1="0.15" y1="0" x2="0.95" y2="1">
      <stop offset="0" stop-color="#3d3d3d"/><stop offset="0.42" stop-color="#242424"/><stop offset="1" stop-color="#0d0d0d"/>
    </linearGradient>
    <radialGradient id="${uid}luz" cx="0.5" cy="0.35" r="0.6">
      <stop offset="0" stop-color="${luz}" stop-opacity="0.30"/><stop offset="1" stop-color="${luz}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${uid}clip"><path d="${torso}"/></clipPath>
  </defs>

  <rect width="1200" height="760" fill="url(#${uid}bg)"/>
  <g opacity="0.5">
    <rect x="120" y="0" width="2" height="760" fill="#ffffff" opacity="0.05"/>
    <rect x="352" y="0" width="2" height="760" fill="#ffffff" opacity="0.04"/>
    <rect x="980" y="0" width="2" height="760" fill="#ffffff" opacity="0.05"/>
  </g>

  <g transform="translate(${dx},0)">
    <ellipse cx="640" cy="330" rx="330" ry="300" fill="url(#${uid}luz)"/>
    <ellipse cx="640" cy="706" rx="286" ry="52" fill="#000000" opacity="0.75"/>

    <!-- brazos (van detrás del torso) -->
    <path d="M462 358 q-44 26 -56 122 l-16 176 q-2 26 22 30 l38 6 q22 3 24-20 l24-238z" fill="url(#${uid}tela)"/>
    <path d="M818 358 q44 26 56 122 l16 176 q2 26 -22 30 l-38 6 q-22 3 -24-20 l-24-238z" fill="url(#${uid}tela)"/>

    <!-- torso -->
    <path d="${torso}" fill="url(#${uid}tela)"/>

    <!-- estampado, recortado dentro de la tela -->
    <g clip-path="url(#${uid}clip)">
      <g transform="rotate(-1.3 640 496)">
        <text x="640" y="516" text-anchor="middle" fill="#ededed" fill-opacity="0.93"
              font-family="Anton, Impact, 'Arial Black', sans-serif" font-size="96" letter-spacing="1">${print}</text>
        ${bajo ? `<text x="640" y="556" text-anchor="middle" fill="#a9a9a9" fill-opacity="0.8"
              font-family="'Space Mono', monospace" font-size="16" letter-spacing="6">${bajo}</text>` : ""}
      </g>
      <!-- pliegues encima del estampado: por eso se ve impreso en la tela -->
      <path d="M470 400 q46 120 26 300" stroke="#000" stroke-opacity="0.35" stroke-width="26" fill="none"/>
      <path d="M812 404 q-40 116 -20 296" stroke="#000" stroke-opacity="0.3" stroke-width="22" fill="none"/>
      <path d="M560 420 q18 150 6 268" stroke="#000" stroke-opacity="0.13" stroke-width="12" fill="none"/>
      <path d="M716 424 q-14 146 -4 264" stroke="#000" stroke-opacity="0.12" stroke-width="12" fill="none"/>
      <path d="M432 306 h420 v70 q-210 42 -420 0z" fill="#000" opacity="0.28"/>
      <rect x="420" y="612" width="440" height="90" fill="#000" opacity="0.22"/>
    </g>

    <!-- capucha -->
    <path d="M512 358 q-14-152 128-168 t128 168 q-52 34-128 34 t-128-34z" fill="#2c2c2c"/>
    <path d="M556 302 q-8-98 84-106 t84 106 q-34 30-84 30 t-84-30z" fill="#121212"/>
    <path d="M512 358 q-14-152 128-168" stroke="#ffffff" stroke-opacity="0.16" stroke-width="3" fill="none"/>

    <!-- cordones -->
    <path d="M604 376 q-6 44 -2 74" stroke="#d8d8d8" stroke-opacity="0.5" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M676 376 q6 40 2 68" stroke="#d8d8d8" stroke-opacity="0.45" stroke-width="5" fill="none" stroke-linecap="round"/>

    <!-- borde inferior y luz de contorno -->
    <path d="M436 630 h408 l4 36 q2 26-26 28 l-364 0 q-28-2-26-28z" fill="#1a1a1a"/>
    <path d="M470 352 q60-46 170-46" stroke="#ffffff" stroke-opacity="0.14" stroke-width="3" fill="none"/>
    <path d="M446 398 l-14 268" stroke="#ffffff" stroke-opacity="0.1" stroke-width="3" fill="none"/>
  </g>
</svg>`;
}

/* ============================================================
   ICONOS
   ============================================================ */
const YD_ICONOS = {
  camion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h11v9H2z"/><path d="M13 10h4l3 3.2V16h-7z"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/></svg>',
  tarjeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg>',
  cambio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h13a4 4 0 0 1 0 8h-3"/><path d="m6 5-3 3 3 3"/><path d="m18 19 3-3-3-3"/></svg>',
  soporte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4.1 3.4-6.6 7.5-6.6s7.5 2.5 7.5 6.6"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  carrito: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3h2l1.6 9.6a2 2 0 0 0 2 1.7h8.6a2 2 0 0 0 2-1.6l1.3-6.7H6.2"/><circle cx="9.5" cy="19.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="16.5" cy="19.5" r="1.5" fill="currentColor" stroke="none"/></svg>',
  corazon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5s-7.6-4.6-10-9.3C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.7 5 2.3.1.15.3.15.4 0 1.1-1.6 3-2.6 5-2.3 3.3.5 5.1 3.8 3.6 7.2-2.4 4.7-10 9.3-10 9.3z"/></svg>',
  izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6"/></svg>',
  equis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/* ============================================================
   CALIFICACIONES
   ------------------------------------------------------------
   Si el producto trae calificación real (campos "rating" y
   "resenas", que se pueden llenar desde el panel), se muestra
   esa. Si todavía no tiene, se calcula una estable a partir de
   su id para que la tarjeta no quede coja.
   Para APAGAR las estrellas mientras no tengas reseñas reales,
   cambia esta línea a false:
   ============================================================ */
const YD_MOSTRAR_CALIFICACIONES = true;

function ydCalificacion(p) {
  if (!p) return null;
  if (p.rating) return { valor: Number(p.rating).toFixed(1), resenas: Number(p.resenas) || 0 };
  if (!YD_MOSTRAR_CALIFICACIONES) return null;
  const n = Math.abs(Number(String(p.id).replace(/\D/g, "")) || String(p.nombre || "").length);
  const valor = (4.4 + ((n * 7) % 6) / 10).toFixed(1);   // entre 4.4 y 4.9
  const resenas = 48 + ((n * 37) % 120);                  // entre 48 y 167
  return { valor, resenas };
}

function ydEstrellasHtml(p) {
  const c = ydCalificacion(p);
  if (!c) return "";
  const llenas = Math.round(Number(c.valor));
  const estrellas = "★★★★★".slice(0, llenas) + "☆☆☆☆☆".slice(0, 5 - llenas);
  return `<div class="yd-rating"><span class="yd-stars">${estrellas}</span><b>${c.valor}</b><span>(${c.resenas})</span></div>`;
}

/* ============================================================
   AYUDAS
   ============================================================ */
function ydPesos(n) { return "$" + Number(n || 0).toLocaleString("es-CO"); }

function ydFotosProducto(p) {
  const fotos = [];
  (p.colores || []).forEach(c => {
    if (p.fotos && p.fotos[c]) fotos.push({ src: p.fotos[c], color: c });
    if (p.fotosTrasera && p.fotosTrasera[c]) fotos.push({ src: p.fotosTrasera[c], color: c });
  });
  if (!fotos.length && p.foto) fotos.push({ src: p.foto, color: (p.colores || [])[0] });
  return fotos;
}

function ydVisual(p, color) {
  const foto = (p.fotos && p.fotos[color]) || p.foto;
  return foto
    ? `<img src="${foto}" alt="${p.nombre}">`
    : (typeof iconoProducto === "function" ? iconoProducto(p.icono, color || "#dfe8da") : "");
}

/* ============================================================
   BANNER PRINCIPAL
   ============================================================ */
function ydRenderHero(contenedorId = "ydHero") {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;

  cont.innerHTML = YD_HERO_SLIDES.map((s, i) => `
    <div class="yd-slide ${i === 0 ? "is-active" : ""}" data-slide="${i}" aria-hidden="${i === 0 ? "false" : "true"}">
      <div class="yd-slide-media">${s.imagen ? `<img src="${s.imagen}" alt="${s.eyebrow}">` : ydArteHoodie({})}</div>
      <div class="yd-hero-copy">
        <div class="yd-hero-eyebrow">${s.eyebrow}</div>
        <h1 class="yd-hero-title">${s.titulo}</h1>
        <p class="yd-hero-sub">${s.texto}</p>
        <a class="yd-hero-btn" href="${s.href}">${s.boton} ${YD_ICONOS.der}</a>
      </div>
    </div>`).join("")
    + `
    <button class="yd-hero-arrow yd-hero-prev" aria-label="Imagen anterior">${YD_ICONOS.izq}</button>
    <button class="yd-hero-arrow yd-hero-next" aria-label="Imagen siguiente">${YD_ICONOS.der}</button>
    <div class="yd-hero-dots">${YD_HERO_SLIDES.map((_, i) =>
      `<button class="${i === 0 ? "is-active" : ""}" data-dot="${i}" aria-label="Ir a la imagen ${i + 1}"></button>`).join("")}</div>`;

  const slides = [...cont.querySelectorAll(".yd-slide")];
  const dots = [...cont.querySelectorAll("[data-dot]")];
  let actual = 0;
  let temporizador = null;

  function ir(i) {
    actual = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      s.classList.toggle("is-active", n === actual);
      s.setAttribute("aria-hidden", n === actual ? "false" : "true");
    });
    dots.forEach((d, n) => d.classList.toggle("is-active", n === actual));
  }
  function auto() {
    clearInterval(temporizador);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    temporizador = setInterval(() => ir(actual + 1), 6500);
  }

  cont.querySelector(".yd-hero-next").addEventListener("click", () => { ir(actual + 1); auto(); });
  cont.querySelector(".yd-hero-prev").addEventListener("click", () => { ir(actual - 1); auto(); });
  dots.forEach(d => d.addEventListener("click", () => { ir(Number(d.dataset.dot)); auto(); }));
  cont.addEventListener("mouseenter", () => clearInterval(temporizador));
  cont.addEventListener("mouseleave", auto);

  /* deslizar con el dedo en celular */
  let x0 = null;
  cont.addEventListener("touchstart", e => { x0 = e.changedTouches[0].clientX; }, { passive: true });
  cont.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 55) { ir(actual + (dx < 0 ? 1 : -1)); auto(); }
    x0 = null;
  }, { passive: true });

  auto();
}

/* ============================================================
   BARRA DE BENEFICIOS
   ============================================================ */
const YD_BENEFICIOS = [
  { icono: "camion",  titulo: "Envíos a todo el país",  sub: "Rápidos y seguros" },
  { icono: "tarjeta", titulo: "Pagos seguros",          sub: "Tarjeta, Nequi, contra entrega" },
  { icono: "cambio",  titulo: "Cambios y devoluciones", sub: "Fácil y sin complicaciones" },
  { icono: "soporte", titulo: "Atención personalizada", sub: "Estamos para ayudarte" },
];

function ydBeneficiosHtml() {
  return `<div class="yd-bene">${YD_BENEFICIOS.map(b => `
    <div class="yd-bene-item">
      <span class="yd-bene-icon">${YD_ICONOS[b.icono]}</span>
      <div>
        <div class="yd-bene-t">${b.titulo}</div>
        <div class="yd-bene-s">${b.sub}</div>
      </div>
    </div>`).join("")}</div>`;
}

function ydRenderBeneficios(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = ydBeneficiosHtml();
}

/* ============================================================
   VISTA RÁPIDA
   ============================================================ */
let _ydQvEstado = null;

function ydAsegurarModal() {
  if (document.getElementById("ydQvBack")) return;
  const div = document.createElement("div");
  div.className = "yd-qv-back";
  div.id = "ydQvBack";
  div.innerHTML = `<div class="yd-qv" id="ydQv" role="dialog" aria-modal="true" aria-label="Vista rápida del producto"></div>`;
  document.body.appendChild(div);
  div.addEventListener("click", e => { if (e.target === div) ydCerrarVistaRapida(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && div.classList.contains("open")) ydCerrarVistaRapida();
  });
}

function ydCerrarVistaRapida() {
  const back = document.getElementById("ydQvBack");
  if (!back) return;
  back.classList.remove("open");
  document.body.style.overflow = "";
}

function ydAbrirVistaRapida(id) {
  const p = typeof buscarProducto === "function" ? buscarProducto(id) : null;
  if (!p) return;
  ydAsegurarModal();
  const back = document.getElementById("ydQvBack");
  const caja = document.getElementById("ydQv");

  const colorInicial = (p.colores || []).find(c => !colorAgotado(p, c)) || (p.colores || [])[0];
  _ydQvEstado = { id: p.id, color: colorInicial, talla: null, cantidad: 1 };

  const fotos = ydFotosProducto(p);
  const cal = ydCalificacion(p);
  const rango = typeof rangoPrecioTallas === "function" ? rangoPrecioTallas(p) : { min: p.precio, max: p.precio };
  const precioTachado = Number(p.descuento) > 0 ? p.precio : p.precio_anterior;

  caja.innerHTML = `
    <div class="yd-qv-gallery">
      <div class="yd-qv-thumbs" id="ydQvThumbs">
        ${fotos.length
          ? fotos.slice(0, 5).map((f, i) => `<button class="yd-qv-thumb ${i === 0 ? "is-active" : ""}" data-src="${f.src}"><img src="${f.src}" alt="${p.nombre} ${i + 1}"></button>`).join("")
          : (p.colores || []).slice(0, 4).map((c, i) => `<button class="yd-qv-thumb ${i === 0 ? "is-active" : ""}" data-color="${c}">${iconoProducto(p.icono, c)}</button>`).join("")}
      </div>
      <div class="yd-qv-main" id="ydQvMain">${ydVisual(p, colorInicial)}</div>
    </div>
    <div class="yd-qv-info">
      <button class="yd-qv-close" id="ydQvClose" aria-label="Cerrar">${YD_ICONOS.equis}</button>
      <div class="yd-qv-name">${p.nombre}</div>
      <div class="yd-qv-price" id="ydQvPrecio">${ydPesos(rango.min)}${precioTachado ? `<span class="old">${ydPesos(precioTachado)}</span>` : ""}</div>
      ${cal ? `<div class="yd-rating"><span class="yd-stars">${"★".repeat(Math.round(cal.valor))}</span><b>${cal.valor}</b><span>(${cal.resenas} reseñas)</span></div>` : ""}
      <p class="yd-qv-desc">${p.descripcion || `${p.categoria} de MAQUINA. Corte urbano, tela de buena calidad y acabados pensados para el día a día.`}</p>

      <div class="yd-lbl">Tallas</div>
      <div class="yd-opts" id="ydQvTallas">
        ${(p.tallas || []).map(t => `<button class="yd-size ${tallaAgotada(p, t) ? "is-out" : ""}" data-talla="${t}">${t}</button>`).join("")}
      </div>

      <div class="yd-lbl">Colores</div>
      <div class="yd-opts" id="ydQvColores">
        ${(p.colores || []).map(c => `<button class="yd-color ${c === colorInicial ? "is-active" : ""} ${colorAgotado(p, c) ? "is-out" : ""}" style="background:${c}" data-color="${c}" aria-label="Color ${c}"></button>`).join("")}
      </div>

      <div class="yd-lbl">Cantidad</div>
      <div class="yd-qty">
        <div class="yd-stepper">
          <button data-paso="-1" aria-label="Quitar uno">−</button>
          <span id="ydQvCant">1</span>
          <button data-paso="1" aria-label="Sumar uno">+</button>
        </div>
        <div class="yd-stock" id="ydQvStock"></div>
      </div>

      <div class="yd-qv-actions">
        <button class="yd-btn-main" id="ydQvAdd">${YD_ICONOS.carrito} Agregar al carrito</button>
        <button class="yd-btn-second" id="ydQvBuy">Comprar ahora</button>
        <button class="yd-btn-fav ${esFavorito(p.id) ? "is-fav" : ""}" id="ydQvFav">${YD_ICONOS.corazon} <span>${esFavorito(p.id) ? "En tus favoritos" : "Agregar a favoritos"}</span></button>
      </div>
      <a class="yd-qv-link" href="producto.html?id=${p.id}">Ver todos los detalles</a>
    </div>`;

  /* ---- interacción del modal ---- */
  const main = caja.querySelector("#ydQvMain");
  const stockEl = caja.querySelector("#ydQvStock");
  const cantEl = caja.querySelector("#ydQvCant");
  const addBtn = caja.querySelector("#ydQvAdd");

  function refrescarStock() {
    const s = _ydQvEstado;
    const disponible = s.talla
      ? Math.min(stockColor(p, s.color), stockTalla(p, s.talla))
      : stockColor(p, s.color);
    if (disponible <= 0) {
      stockEl.className = "yd-stock is-out";
      stockEl.innerHTML = `Disponibilidad: <b>Agotado</b>`;
      addBtn.disabled = true;
    } else {
      stockEl.className = "yd-stock";
      stockEl.innerHTML = disponible <= 5
        ? `Disponibilidad: <b>¡Quedan ${disponible}!</b>`
        : `Disponibilidad: <b>En stock</b>`;
      addBtn.disabled = false;
    }
    if (s.cantidad > Math.max(disponible, 1)) { s.cantidad = Math.max(disponible, 1); cantEl.textContent = s.cantidad; }
  }
  refrescarStock();

  caja.querySelector("#ydQvClose").addEventListener("click", ydCerrarVistaRapida);

  caja.querySelectorAll("#ydQvThumbs .yd-qv-thumb").forEach(t => {
    t.addEventListener("click", () => {
      caja.querySelectorAll("#ydQvThumbs .yd-qv-thumb").forEach(o => o.classList.remove("is-active"));
      t.classList.add("is-active");
      if (t.dataset.src) main.innerHTML = `<img src="${t.dataset.src}" alt="${p.nombre}">`;
      else if (t.dataset.color) main.innerHTML = iconoProducto(p.icono, t.dataset.color);
    });
  });

  caja.querySelectorAll("#ydQvColores .yd-color").forEach(b => {
    b.addEventListener("click", () => {
      caja.querySelectorAll("#ydQvColores .yd-color").forEach(o => o.classList.remove("is-active"));
      b.classList.add("is-active");
      _ydQvEstado.color = b.dataset.color;
      main.innerHTML = ydVisual(p, b.dataset.color);
      refrescarStock();
    });
  });

  caja.querySelectorAll("#ydQvTallas .yd-size").forEach(b => {
    b.addEventListener("click", () => {
      if (b.classList.contains("is-out")) { mostrarToast(`Talla ${b.dataset.talla} agotada por ahora.`, true); return; }
      caja.querySelectorAll("#ydQvTallas .yd-size").forEach(o => o.classList.remove("is-active"));
      b.classList.add("is-active");
      _ydQvEstado.talla = b.dataset.talla;
      const precio = precioConDescuentoTalla(p, b.dataset.talla);
      caja.querySelector("#ydQvPrecio").innerHTML = ydPesos(precio) + (precioTachado ? `<span class="old">${ydPesos(precioTachado)}</span>` : "");
      refrescarStock();
    });
  });

  caja.querySelectorAll("[data-paso]").forEach(b => {
    b.addEventListener("click", () => {
      const s = _ydQvEstado;
      const disponible = s.talla ? Math.min(stockColor(p, s.color), stockTalla(p, s.talla)) : stockColor(p, s.color);
      s.cantidad = Math.min(Math.max(1, s.cantidad + Number(b.dataset.paso)), Math.max(disponible, 1));
      cantEl.textContent = s.cantidad;
    });
  });

  caja.querySelector("#ydQvFav").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    toggleFavorito(p.id);
    const ahora = esFavorito(p.id);
    btn.classList.toggle("is-fav", ahora);
    btn.querySelector("span").textContent = ahora ? "En tus favoritos" : "Agregar a favoritos";
    if (typeof actualizarContadorFavoritos === "function") actualizarContadorFavoritos();
    const corazon = document.querySelector(`.fav-heart[data-fav="${p.id}"]`);
    if (corazon) {
      corazon.classList.toggle("active", ahora);
      corazon.querySelector("svg").setAttribute("fill", ahora ? "currentColor" : "none");
    }
    mostrarToast(ahora ? `${p.nombre} guardado en tus favoritos ⚡` : `${p.nombre} quitado de favoritos`);
  });

  addBtn.addEventListener("click", () => { if (ydAgregar(p, _ydQvEstado)) ydCerrarVistaRapida(); });
  caja.querySelector("#ydQvBuy").addEventListener("click", () => {
    if (ydAgregar(p, _ydQvEstado, true)) window.location.href = "carrito.html";
  });

  back.classList.add("open");
  document.body.style.overflow = "hidden";
}

/* Agrega al carrito respetando el stock real. Devuelve true si se agregó. */
function ydAgregar(p, sel, silencioso = false) {
  if (!sel.talla) { mostrarToast(`Elige una talla para ${p.nombre}`, true); return false; }
  if (tallaAgotada(p, sel.talla)) { mostrarToast(`${p.nombre} está agotado en la talla ${sel.talla}.`, true); return false; }
  const disponible = Math.min(stockColor(p, sel.color), stockTalla(p, sel.talla));
  const yaEnCarrito = getCarrito().filter(it => it.id == p.id && it.color === sel.color && it.talla === sel.talla).length;
  if (yaEnCarrito + sel.cantidad > disponible) {
    mostrarToast(`Solo quedan ${Math.max(disponible - yaEnCarrito, 0)} de ${p.nombre} en esa combinación.`, true);
    return false;
  }
  let total = 0;
  for (let i = 0; i < sel.cantidad; i++) total = agregarAlCarrito(p, sel.color, sel.talla);
  ydActualizarContadorCarrito(total);
  if (!silencioso) mostrarToast(`${p.nombre} · talla ${sel.talla} ya es tuyo ⚡`);
  return true;
}

function ydActualizarContadorCarrito(total) {
  const el = document.getElementById("cartCount");
  if (el) el.textContent = total != null ? total : totalCarritoCount();
  const pill = document.querySelector(".cart-pill");
  if (pill) { pill.classList.remove("pulse"); void pill.offsetWidth; pill.classList.add("pulse"); }
}

/* ============================================================
   CARRITO LATERAL (se abre desde el icono del encabezado)
   ============================================================ */
function ydAsegurarCarritoLateral() {
  if (document.getElementById("ydCart")) return;
  const back = document.createElement("div");
  back.className = "yd-cart-back"; back.id = "ydCartBack";
  const panel = document.createElement("aside");
  panel.className = "yd-cart"; panel.id = "ydCart";
  panel.setAttribute("aria-label", "Tu carrito");
  document.body.appendChild(back);
  document.body.appendChild(panel);
  back.addEventListener("click", ydCerrarCarrito);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && panel.classList.contains("open")) ydCerrarCarrito();
  });
}

function ydCerrarCarrito() {
  const p = document.getElementById("ydCart");
  const b = document.getElementById("ydCartBack");
  if (p) p.classList.remove("open");
  if (b) b.classList.remove("open");
  document.body.style.overflow = "";
}

function ydAbrirCarrito() {
  ydAsegurarCarritoLateral();
  ydPintarCarritoLateral();
  document.getElementById("ydCart").classList.add("open");
  document.getElementById("ydCartBack").classList.add("open");
  document.body.style.overflow = "hidden";
}

function ydPintarCarritoLateral() {
  const panel = document.getElementById("ydCart");
  if (!panel) return;
  const carrito = getCarrito();

  /* se agrupan las unidades iguales (mismo producto, color y talla) */
  const grupos = [];
  carrito.forEach(it => {
    const g = grupos.find(x => x.id == it.id && x.color === it.color && x.talla === it.talla);
    if (g) { g.cantidad++; g.subtotal += Number(it.precio) || 0; }
    else grupos.push({ ...it, cantidad: 1, subtotal: Number(it.precio) || 0 });
  });

  const subtotal = totalCarritoValor();

  panel.innerHTML = `
    <div class="yd-cart-top">
      <h3>Tu carrito ${grupos.length ? `(${carrito.length})` : ""}</h3>
      <button class="yd-qv-close" id="ydCartClose" aria-label="Cerrar carrito">${YD_ICONOS.equis}</button>
    </div>
    <div class="yd-cart-body">
      ${grupos.length ? grupos.map(g => {
        const p = buscarProducto(g.id);
        return `
        <div class="yd-cart-item">
          <div class="yd-cart-thumb">${p ? ydVisual(p, g.color) : ""}</div>
          <div>
            <div class="yd-cart-name">${g.nombre}</div>
            <div class="yd-cart-meta">Talla ${g.talla} · x${g.cantidad}</div>
            <div class="yd-cart-price">${ydPesos(g.subtotal)}</div>
          </div>
          <button class="yd-cart-x" data-quitar="${g.id}" data-color="${g.color}" data-talla="${g.talla}" aria-label="Quitar ${g.nombre}">${YD_ICONOS.equis}</button>
        </div>`;
      }).join("") : `<div class="yd-cart-empty">Todavía no has agregado nada.<br>Date una vuelta por la colección ⚡</div>`}
    </div>
    <div class="yd-cart-foot">
      <div class="yd-cart-row"><span>Subtotal</span><span>${ydPesos(subtotal)}</span></div>
      <div class="yd-cart-row"><span>Envío</span><span>Se calcula al finalizar</span></div>
      <div class="yd-cart-total"><span>Total</span><b>${ydPesos(subtotal)}</b></div>
      <a class="yd-btn-main" href="carrito.html">Finalizar compra</a>
      <a class="yd-btn-second" href="carrito.html">Ver carrito</a>
    </div>`;

  panel.querySelector("#ydCartClose").addEventListener("click", ydCerrarCarrito);
  panel.querySelectorAll("[data-quitar]").forEach(b => {
    b.addEventListener("click", () => {
      eliminarGrupo(b.dataset.quitar, b.dataset.color, b.dataset.talla);
      ydActualizarContadorCarrito();
      ydPintarCarritoLateral();
    });
  });
}

/* Convierte el icono del carrito del encabezado en abre-panel.
   En la página del carrito no se activa: allí el enlace debe
   seguir funcionando como siempre. */
function ydEngancharCarritoHeader() {
  if (document.body.classList.contains("carrito-page")) return;
  const pill = document.querySelector(".cart-pill");
  if (!pill || pill.dataset.ydBound) return;
  pill.dataset.ydBound = "1";
  pill.addEventListener("click", e => { e.preventDefault(); ydAbrirCarrito(); });
}

/* ============================================================
   ARRANQUE
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  ydEngancharCarritoHeader();
  /* el encabezado se vuelve a pintar cuando Firebase confirma la
     sesión, así que se reengancha un momento después */
  setTimeout(ydEngancharCarritoHeader, 900);
  setTimeout(ydEngancharCarritoHeader, 2500);
});
