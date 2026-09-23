/* ============================================================
   Devuelve el SVG de una prenda según su tipo, pintado con el
   color recibido. Es la versión en JavaScript de includes/iconos.php
   tipo  : hoodie | tee | cap | pants | jacket | shorts
   color : código HEX, ej. #151512
   ============================================================ */
function iconoProducto(tipo, color = "#dfe8da") {
  const stroke = 'stroke="#1b4332" stroke-opacity="0.55" stroke-width="1.6"';

  const svgs = {
    hoodie: `<svg viewBox="0 0 100 110" fill="none">
      <path d="M50 8 C40 8 33 14 30 22 L18 30 C14 33 13 38 16 42 L24 50 C26 47 29 45 30 45 L30 100 C30 103 32 105 35 105 L65 105 C68 105 70 103 70 100 L70 45 C71 45 74 47 76 50 L84 42 C87 38 86 33 82 30 L70 22 C67 14 60 8 50 8 Z" fill="${color}" ${stroke}/>
      <path d="M38 22 C41 30 46 34 50 34 C54 34 59 30 62 22" stroke="#1b4332" stroke-opacity="0.6" stroke-width="2.2" fill="none"/>
      <path d="M40 50 C40 62 60 62 60 50" stroke="#1b4332" stroke-opacity="0.5" stroke-width="2" fill="none"/>
      <line x1="46" y1="34" x2="44" y2="58" stroke="#1b4332" stroke-opacity="0.5" stroke-width="2"/>
      <line x1="54" y1="34" x2="56" y2="58" stroke="#1b4332" stroke-opacity="0.5" stroke-width="2"/>
      <rect x="30" y="96" width="40" height="4" fill="#1b4332" fill-opacity="0.35"/>
      <rect x="16" y="38" width="4" height="16" fill="#1b4332" fill-opacity="0.3"/>
      <rect x="80" y="38" width="4" height="16" fill="#1b4332" fill-opacity="0.3"/>
    </svg>`,
    tee: `<svg viewBox="0 0 100 110" fill="none">
      <path d="M38 12 L20 24 L10 40 L24 48 L30 40 L30 100 C30 103 32 105 35 105 L65 105 C68 105 70 103 70 100 L70 40 L76 48 L90 40 L80 24 L62 12 C58 20 42 20 38 12 Z" fill="${color}" ${stroke}/>
      <path d="M40 14 C43 22 57 22 60 14" stroke="#1b4332" stroke-opacity="0.6" stroke-width="2.2" fill="none"/>
      <line x1="30" y1="55" x2="70" y2="55" stroke="#1b4332" stroke-opacity="0.25" stroke-width="1.5"/>
    </svg>`,
    cap: `<svg viewBox="0 0 100 90" fill="none">
      <path d="M20 55 C20 32 33 20 50 20 C67 20 80 32 80 55" fill="${color}" ${stroke}/>
      <path d="M20 55 L82 55 L82 60 C82 63 79 65 74 65 L26 65 C21 65 18 63 18 60 Z" fill="${color}" ${stroke}/>
      <path d="M18 60 C6 60 4 68 6 72 L20 68 Z" fill="${color}" ${stroke}/>
      <line x1="50" y1="20" x2="50" y2="55" stroke="#1b4332" stroke-opacity="0.4" stroke-width="1.5"/>
      <line x1="34" y1="24" x2="30" y2="55" stroke="#1b4332" stroke-opacity="0.4" stroke-width="1.5"/>
      <line x1="66" y1="24" x2="70" y2="55" stroke="#1b4332" stroke-opacity="0.4" stroke-width="1.5"/>
      <circle cx="50" cy="22" r="3" fill="#1b4332" fill-opacity="0.55"/>
    </svg>`,
    pants: `<svg viewBox="0 0 100 110" fill="none">
      <path d="M28 10 L72 10 L74 30 L70 30 L70 20 L64 20 L66 100 L54 100 L50 42 L46 100 L34 100 L36 20 L30 20 L30 30 L26 30 Z" fill="${color}" ${stroke}/>
      <rect x="28" y="10" width="44" height="8" fill="#1b4332" fill-opacity="0.35"/>
      <line x1="50" y1="20" x2="50" y2="40" stroke="#1b4332" stroke-opacity="0.5" stroke-width="2"/>
      <rect x="30" y="22" width="8" height="14" fill="#1b4332" fill-opacity="0.25"/>
      <rect x="62" y="22" width="8" height="14" fill="#1b4332" fill-opacity="0.25"/>
    </svg>`,
    jacket: `<svg viewBox="0 0 100 110" fill="none">
      <path d="M50 8 L34 16 L18 26 L10 42 L22 48 L30 38 L30 100 C30 103 32 105 35 105 L65 105 C68 105 70 103 70 100 L70 38 L78 48 L90 42 L82 26 L66 16 Z" fill="${color}" ${stroke}/>
      <line x1="50" y1="16" x2="50" y2="103" stroke="#1b4332" stroke-opacity="0.55" stroke-width="2.4" stroke-dasharray="2 2"/>
      <path d="M34 16 C40 24 60 24 66 16" stroke="#1b4332" stroke-opacity="0.5" stroke-width="2" fill="none"/>
      <rect x="36" y="55" width="14" height="10" rx="2" fill="#1b4332" fill-opacity="0.3"/>
      <rect x="50" y="55" width="14" height="10" rx="2" fill="#1b4332" fill-opacity="0.3"/>
    </svg>`,
    shorts: `<svg viewBox="0 0 100 90" fill="none">
      <path d="M30 10 L70 10 L72 24 L68 24 L68 18 L62 18 L64 75 L52 75 L50 45 L48 75 L36 75 L38 18 L32 18 L32 24 L28 24 Z" fill="${color}" ${stroke}/>
      <rect x="30" y="10" width="40" height="7" fill="#1b4332" fill-opacity="0.35"/>
      <line x1="50" y1="17" x2="50" y2="40" stroke="#1b4332" stroke-opacity="0.5" stroke-width="2"/>
      <path d="M42 12 L42 8 M58 12 L58 8" stroke="#1b4332" stroke-opacity="0.6" stroke-width="1.5"/>
    </svg>`,
  };

  return svgs[tipo] || svgs["tee"];
}

/** Rayo pequeño usado en botones de "vaciar / cerrar" del carrito,
    en vez del clásico ícono de bote de basura. */
function svgRayoBoton() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>`;
}
/** Equis redonda y estilizada para quitar un producto del carrito */
function svgEquisBoton() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
}

/** Etiqueta legible + clase css para el badge de un producto */
function badgeInfo(badge) {
  if (!badge) return null;
  const map = {
    nuevo:   { label: "NUEVO",        class: "new" },
    pocas:   { label: "QUEDAN POCAS", class: "low" },
    vendido: { label: "MÁS VENDIDO",  class: "hot" },
    agotado: { label: "AGOTADO",      class: "out" },
  };
  return map[badge] || null;
}
