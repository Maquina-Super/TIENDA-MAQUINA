/* ============================================================
   RENDER DE TARJETAS DE PRODUCTO (compartido)
   Antes esta lógica vivía solo dentro de productos.html. Se
   sacó a un archivo aparte para poder reusarla tal cual en
   favoritos.html (y en cualquier otra página que necesite
   pintar tarjetas de producto con color/talla/agregar/favorito).
   ============================================================ */

/** Arma tarjetas "esqueleto" (grises, con brillo animado) para mostrar
    mientras el catálogo todavía se está trayendo de Firestore, en vez
    de dejar la grilla en blanco. */
function construirSkeletonHtml(cantidad = 6) {
  let html = '';
  for (let i = 0; i < cantidad; i++) {
    html += `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-media"></div>
        <div class="skeleton-body">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line price"></div>
        </div>
      </div>`;
  }
  return html;
}

/* ============================================================
   FOTOS DE LA TARJETA
   Cada producto puede traer:  foto (general) · fotos[color] ·
   fotosTrasera[color]. Estas funciones deciden qué mostrar y cómo
   encajarlo en la tarjeta SIN deformar ni cortar la prenda.
   Campos opcionales por producto (ver products.js):
     ajusteFoto    'contain' | 'cover'   (forzar el modo)
     posicionFoto  p.ej. 'center top'    (object-position)
   ============================================================ */

/* false = el fondo de la tarjeta es siempre oscuro, aunque la foto tenga
   fondo blanco. true = si la foto tiene fondo liso CLARO, la tarjeta toma
   ese mismo color (se ve continuo, pero esa tarjeta queda clara). Los
   fondos lisos oscuros siempre se funden con la tarjeta. */
const FONDO_CLARO_ADAPTATIVO = false;

/** Foto de un producto para un color: la del color o, si no tiene, la general. */
function fotoDeProducto(p, color) {
  return (p.fotos && p.fotos[color]) || p.foto || null;
}

function _attrSeguro(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** HTML de lo que va dentro de .card-fotos: foto de frente (+ espalda y
    puntitos si existe), o el dibujo con un mensaje discreto si no hay foto. */
function htmlFotosTarjeta(p, color) {
  let colorFoto = color;
  let frente = fotoDeProducto(p, color);
  if (!frente) {   // ese color no tiene foto: usa la de cualquier otro color antes que el dibujo
    colorFoto = (p.colores || []).find(c => p.fotos && p.fotos[c]);
    frente = colorFoto ? p.fotos[colorFoto] : null;
  }
  if (!frente) {
    return `<div data-icon>${iconoProducto(p.icono, color)}</div><span class="card-sin-foto">Foto próximamente</span>`;
  }
  const atras = p.fotosTrasera && p.fotosTrasera[colorFoto];
  const alt = _attrSeguro(p.nombre);
  return `<img src="${_attrSeguro(frente)}" class="card-photo" data-photo alt="${alt}" loading="lazy">`
    + (atras ? `<img src="${_attrSeguro(atras)}" class="card-photo card-photo-trasera" data-photo-trasera alt="${alt} de espaldas" loading="lazy">
       <span class="card-dots" aria-hidden="true"><i></i><i></i></span>` : '');
}

/** Mira el borde de la foto: ¿tiene un fondo liso (foto de estudio, aunque
    una manga toque el borde) o una escena detrás (editorial / modelo)?
    Devuelve null si el navegador no deja leer la imagen (otra web sin CORS). */
function analizarBordeFoto(img) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, 96 / Math.max(w, h));
    const cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    const at = (x, y) => (y * cw + x) * 4;
    /* color de fondo = promedio de las 4 esquinas (bloques de 3x3 px) */
    let R = 0, G = 0, B = 0, A = 0, m = 0;
    [[0, 0], [cw - 3, 0], [0, ch - 3], [cw - 3, ch - 3]].forEach(([x0, y0]) => {
      for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) {
        const i = at(x, y); R += d[i]; G += d[i + 1]; B += d[i + 2]; A += d[i + 3]; m++;
      }
    });
    R /= m; G /= m; B /= m; A /= m;
    if (A < 128) return { uniforme: true, transparente: true };
    /* ¿qué parte del anillo exterior se parece a ese fondo? */
    let cerca = 0, n = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (x > 1 && x < cw - 2 && y > 1 && y < ch - 2) continue;
        const i = at(x, y); n++;
        if (Math.hypot(d[i] - R, d[i + 1] - G, d[i + 2] - B) < 32) cerca++;
      }
    }
    return {
      uniforme: cerca / n >= 0.72, transparente: false,
      luma: 0.2126 * R + 0.7152 * G + 0.0722 * B,
      rgb: `rgb(${Math.round(R)},${Math.round(G)},${Math.round(B)})`,
    };
  } catch (e) { return null; }
}

/** Decide cómo encaja una foto cargada:
    · contain (por defecto): se ve la prenda COMPLETA, sin cortar mangas ni estampado.
    · cover: solo si la foto trae escena de fondo (editorial/modelo) Y su
      proporción ya es casi la de la tarjeta (4:5), así el recorte es mínimo.
    ajusteFoto / posicionFoto del producto mandan sobre esta decisión. */
function ajustarFotoTarjeta(img, card) {
  const media = card.querySelector('[data-media]');
  const p = (typeof buscarProducto === 'function' && buscarProducto(card.id)) || {};
  const analisis = analizarBordeFoto(img);
  let ajuste = p.ajusteFoto;
  if (ajuste !== 'cover' && ajuste !== 'contain') {
    const ratio = img.naturalWidth / img.naturalHeight;
    ajuste = (analisis && !analisis.uniforme && Math.abs(ratio - 0.8) < 0.1) ? 'cover' : 'contain';
  }
  img.dataset.fit = ajuste;
  img.style.objectPosition = p.posicionFoto || (ajuste === 'cover' ? 'center 22%' : 'center');
  if (media && !img.hasAttribute('data-photo-trasera') && ajuste === 'contain'
      && analisis && analisis.uniforme && !analisis.transparente
      && (analisis.luma < 110 || FONDO_CLARO_ADAPTATIVO)) {
    media.style.setProperty('--fondo-foto', analisis.rgb);   // la foto se funde con la tarjeta
  }
}

/** Si una foto no carga, la tarjeta no se rompe: vuelve al dibujo + mensaje. */
function mostrarSinFotoTarjeta(card) {
  const fotos = card.querySelector('[data-fotos]');
  const p = typeof buscarProducto === 'function' && buscarProducto(card.id);
  if (!fotos || !p) return;
  const color = card.querySelector('.swatch.active')?.dataset.color || (p.colores || [])[0];
  fotos.innerHTML = `<div data-icon>${iconoProducto(p.icono, color)}</div><span class="card-sin-foto">Foto próximamente</span>`;
  card.querySelector('[data-media]')?.style.removeProperty('--fondo-foto');
}

/** Conecta el ajuste y el control de errores a las fotos de UNA tarjeta. */
function activarFotosTarjeta(card) {
  card.querySelectorAll('img.card-photo').forEach(img => {
    if (img.complete) {
      img.naturalWidth ? ajustarFotoTarjeta(img, card) : mostrarSinFotoTarjeta(card);
      return;
    }
    img.addEventListener('load', () => ajustarFotoTarjeta(img, card), { once: true });
    img.addEventListener('error', () => mostrarSinFotoTarjeta(card), { once: true });
  });
}

/** Arma el HTML de una sola tarjeta de producto. */
function construirTarjetaHtml(p, i = 0) {
  const revealDelay = `reveal-d${(i % 6) + 1}`;
  const stockNum = stockTotalProducto(p);
  const sinStock = stockNum <= 0;
  const descuento = Number(p.descuento) || 0;
  const badge = badgeInfo(sinStock ? 'agotado' : p.badge);
  const badgeHtml = badge ? `<div class="badge ${badge.class}">${badge.label}</div>` : '';
  const esFav = typeof esFavorito === 'function' ? esFavorito(p.id) : false;
  const favHtml = `
    <button class="fav-heart ${esFav ? 'active' : ''}" data-fav="${p.id}" aria-label="${esFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}" title="${esFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}">
      <svg viewBox="0 0 24 24" fill="${esFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5s-7.6-4.6-10-9.3C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.7 5 2.3.1.15.3.15.4 0 1.1-1.6 3-2.6 5-2.3 3.3.5 5.1 3.8 3.6 7.2-2.4 4.7-10 9.3-10 9.3z"/></svg>
    </button>`;
  /* primer color con stock disponible (si todos están agotados, cae en el primero) */
  const colorInicial = p.colores.find(c => !colorAgotado(p, c)) || p.colores[0];
  const swatchesHtml = p.colores.map((c, ci) => {
    const agotadoColor = colorAgotado(p, c);
    const activo = c === colorInicial;
    const etiqueta = `Color ${ci + 1} de ${p.colores.length}${agotadoColor ? ' — agotado en este color' : ''}`;
    return `<div class="swatch ${activo ? 'active' : ''} ${agotadoColor ? 'swatch-agotado' : ''}" style="background:${c}" data-color="${c}" title="${agotadoColor ? 'Agotado en este color' : ''}" role="button" tabindex="0" aria-pressed="${activo}" aria-label="${etiqueta}"></div>`;
  }).join('');
  const sizesHtml = p.tallas.map(sz => {
    const agotadaSz = tallaAgotada(p, sz);
    const etiqueta = `Talla ${sz}${agotadaSz ? ' — agotada' : ''}`;
    return `<div class="size-chip ${agotadaSz ? 'size-chip-agotado' : ''}" data-size="${sz}" title="${agotadaSz ? 'Agotada' : ''}" role="button" tabindex="0" aria-pressed="false" aria-label="${etiqueta}">${sz}</div>`;
  }).join('');
  const precioTachado = descuento > 0 ? p.precio : p.precio_anterior;
  const precioAnteriorHtml = precioTachado
    ? `<span class="old">$${Number(precioTachado).toLocaleString('es-CO')}</span>` : '';
  const descuentoHtml = descuento > 0 ? `<span class="chip-descuento">-${descuento}%</span>` : '';
  const stockColorInicial = stockColor(p, colorInicial);
  const stockNoteHtml = (!sinStock && stockColorInicial <= 5)
    ? `<div class="stock-note" data-stock-note>¡Quedan ${stockColorInicial}!</div>` : `<div class="stock-note" data-stock-note style="display:none;"></div>`;
  const rango = rangoPrecioTallas(p);
  const precioMostradoInicial = rango.min === rango.max
    ? `$${rango.min.toLocaleString('es-CO')}`
    : `Desde $${rango.min.toLocaleString('es-CO')}`;

  return `
    <div class="card reveal ${revealDelay} ${sinStock ? 'sin-stock' : ''}" id="${p.id}" data-cat="${p.categoria}" data-stock="${stockNum}" data-product>
      <div class="card-media" data-media>
        ${badgeHtml}
        ${favHtml}
        <div class="card-fotos" data-fotos>${htmlFotosTarjeta(p, colorInicial)}</div>
        ${typeof YD_ICONOS !== 'undefined' ? `<button class="yd-quick" data-quick="${p.id}" type="button">${YD_ICONOS.ojo} Vista rápida</button>` : ''}
      </div>
      <div class="card-body">
        <div class="card-cat">${p.categoria}</div>
        <a class="card-name display" href="producto.html?id=${p.id}">${p.nombre}</a>
        ${typeof ydEstrellasHtml === 'function' ? ydEstrellasHtml(p) : ''}
        <div class="swatches">${swatchesHtml}</div>
        <div class="sizes">${sizesHtml}</div>
        ${stockNoteHtml}
        <div class="card-bottom">
          <div class="card-price mono">${precioAnteriorHtml} <span data-price-num>${precioMostradoInicial}</span> ${descuentoHtml}</div>
          <button class="add-btn" data-id="${p.id}" data-nombre="${p.nombre}" ${sinStock ? 'disabled' : ''}>${sinStock ? 'Agotado' : 'Lo quiero'}</button>
        </div>
      </div>
    </div>`;
}

/** Arma el HTML de una lista completa de productos. */
function construirTarjetasHtml(productos) {
  return productos.map((p, i) => construirTarjetaHtml(p, i)).join('');
}

/** Muestra el mensajito flotante ("toast") de abajo. Necesita que la
    página tenga el markup de #toast / #toastText (igual que en
    productos.html). */
function mostrarToast(text, esError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toastText').textContent = text;
  toast.classList.toggle('error', esError);
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

/** Activa todos los eventos (color, talla, agregar al carrito, favorito)
    de las tarjetas [data-product] dentro de gridEl. Se debe volver a
    llamar cada vez que se repinta el grid (porque el HTML es nuevo).
    opciones.onFavoritoQuitado(id, card) — si se da, se llama cuando el
    usuario le quita el corazón a un producto (útil en favoritos.html
    para sacar la tarjeta de la vista al instante). */
function activarInteraccionGrid(gridEl, opciones = {}) {
  const seleccion = {};

  gridEl.querySelectorAll('[data-product]').forEach(card => {
    const id = card.id;
    seleccion[id] = { color: card.querySelector('.swatch.active')?.dataset.color || card.querySelector('.swatch')?.dataset.color || null, talla: null };

    function refrescarAvisoStock() {
      const producto = buscarProducto(id);
      const colorElegido = seleccion[id].color;
      const noteEl = card.querySelector('[data-stock-note]');
      const addBtn = card.querySelector('.add-btn');
      if (!producto || !noteEl) return;
      const stockDeEseColor = stockColor(producto, colorElegido);
      if (colorAgotado(producto, colorElegido)) {
        noteEl.textContent = 'Agotado en este color';
        noteEl.style.display = 'block';
        noteEl.classList.add('stock-note-agotado');
        if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Agotado en este color'; }
      } else {
        noteEl.classList.remove('stock-note-agotado');
        if (addBtn) { addBtn.disabled = false; addBtn.textContent = 'Lo quiero'; }
        if (stockDeEseColor <= 5) {
          noteEl.textContent = `¡Quedan ${stockDeEseColor}!`;
          noteEl.style.display = 'block';
        } else {
          noteEl.style.display = 'none';
        }
      }
    }
    refrescarAvisoStock();
    activarFotosTarjeta(card);

    /* accesibilidad por teclado: los círculos de color y las tallas son
       <div role="button"> (para que se vean como antes), así que no
       reciben clic con Enter/Espacio por defecto como un <button> de
       verdad — se lo agregamos a mano acá. */
    card.querySelectorAll('.swatch, .size-chip').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          el.click();
        }
      });
    });

    /* en celular no existe el "hover" del mouse, así que un toque sobre
       la foto alterna entre la vista de adelante y la de espaldas */
    const mediaEl = card.querySelector('[data-media]');
    mediaEl.addEventListener('click', (e) => {
      if (e.target.closest('.fav-heart') || e.target.closest('.yd-quick')) return;
      if (card.querySelector('[data-photo-trasera]')) {
        card.classList.toggle('card-trasera-activa');
      }
    });

    card.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        card.querySelectorAll('.swatch').forEach(s => { s.classList.remove('active'); s.setAttribute('aria-pressed', 'false'); });
        sw.classList.add('active');
        sw.setAttribute('aria-pressed', 'true');
        const colorElegido = sw.dataset.color;
        seleccion[id].color = colorElegido;
        const producto = buscarProducto(id);
        const fotosEl = card.querySelector('[data-fotos]');
        if (producto && fotosEl) {
          if (fotoDeProducto(producto, colorElegido)) {
            /* ese color tiene foto: se pinta (aunque antes se viera el dibujo) */
            fotosEl.innerHTML = htmlFotosTarjeta(producto, colorElegido);
            card.querySelector('[data-media]').style.removeProperty('--fondo-foto');
            card.classList.remove('card-trasera-activa');
            activarFotosTarjeta(card);
          } else {
            /* sin foto para este color: se deja la que hay (sin espalda) o se tiñe el dibujo */
            fotosEl.querySelectorAll('[data-photo-trasera], .card-dots').forEach(el => el.remove());
            card.classList.remove('card-trasera-activa');
            fotosEl.querySelectorAll('[data-icon] svg path[fill]').forEach(path => path.setAttribute('fill', colorElegido));
          }
        }
        refrescarAvisoStock();
      });
    });

    card.querySelectorAll('.size-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const producto = buscarProducto(id);
        if (producto && tallaAgotada(producto, chip.dataset.size)) {
          mostrarToast(`Talla ${chip.dataset.size} agotada por ahora.`, true);
          return;
        }
        card.querySelectorAll('.size-chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        seleccion[id].talla = chip.dataset.size;

        const priceEl = card.querySelector('[data-price-num]');
        if (producto && priceEl) {
          const finalTalla = precioConDescuentoTalla(producto, chip.dataset.size);
          priceEl.textContent = `$${Number(finalTalla).toLocaleString('es-CO')}`;
        }
      });
    });

    /* ---- vista rápida ---- */
    const quickBtn = card.querySelector('.yd-quick');
    if (quickBtn && typeof ydAbrirVistaRapida === 'function') {
      quickBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ydAbrirVistaRapida(id);
      });
    }

    /* ---- corazón de favoritos ---- */
    const favBtn = card.querySelector('.fav-heart');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const producto = buscarProducto(id);
        const favs = toggleFavorito(id);
        const ahoraEsFav = favs.some(f => f == id);
        favBtn.classList.toggle('active', ahoraEsFav);
        favBtn.querySelector('svg').setAttribute('fill', ahoraEsFav ? 'currentColor' : 'none');
        favBtn.setAttribute('aria-label', ahoraEsFav ? 'Quitar de favoritos' : 'Guardar en favoritos');
        favBtn.classList.remove('fav-pop'); void favBtn.offsetWidth; favBtn.classList.add('fav-pop');
        actualizarContadorFavoritos();
        if (ahoraEsFav) {
          mostrarToast(`${producto ? producto.nombre + ' guardado en' : 'Guardado en'} tus favoritos ⚡`);
        } else {
          mostrarToast(`${producto ? producto.nombre + ' quitado de' : 'Quitado de'} favoritos`);
          if (typeof opciones.onFavoritoQuitado === 'function') opciones.onFavoritoQuitado(id, card);
        }
      });
    }

    /* ---- añadir al carrito ---- */
    const addBtn = card.querySelector('.add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const sel = seleccion[id];

        if (!sel.talla) {
          addBtn.classList.remove('shake'); void addBtn.offsetWidth; addBtn.classList.add('shake');
          mostrarToast('Elige una talla para ' + addBtn.dataset.nombre, true);
          return;
        }

        const producto = buscarProducto(id);
        if (!producto) { mostrarToast('Ese producto ya no está disponible.', true); return; }

        if (tallaAgotada(producto, sel.talla)) {
          mostrarToast(`${producto.nombre} está agotado en la talla ${sel.talla} por ahora.`, true);
          return;
        }
        const stockDisponible = Math.min(stockColor(producto, sel.color), stockTalla(producto, sel.talla));
        if (stockDisponible <= 0) {
          mostrarToast(`${producto.nombre} está agotado en ese color por ahora.`, true);
          return;
        }
        const yaEnCarrito = getCarrito().filter(it => it.id == producto.id && it.color === sel.color && it.talla === sel.talla).length;
        if (yaEnCarrito >= stockDisponible) {
          mostrarToast(`Ya tienes en el carrito todo el stock disponible de ${producto.nombre} en esa combinación.`, true);
          return;
        }

        const totalCarrito = agregarAlCarrito(producto, sel.color, sel.talla);

        const cartCountEl = document.getElementById('cartCount');
        if (cartCountEl) cartCountEl.textContent = totalCarrito;
        const pill = document.querySelector('.cart-pill');
        if (pill) { pill.classList.remove('pulse'); void pill.offsetWidth; pill.classList.add('pulse'); }

        const original = addBtn.textContent;
        addBtn.textContent = '¡Sumado! ⚡';
        addBtn.classList.add('added');
        setTimeout(() => { addBtn.textContent = original; addBtn.classList.remove('added'); }, 1200);

        if (yaEnCarrito + 1 >= stockDisponible) {
          const noteEl = card.querySelector('[data-stock-note]');
          if (noteEl) {
            noteEl.textContent = 'Agotado en este color';
            noteEl.style.display = 'block';
            noteEl.classList.add('stock-note-agotado');
          }
          setTimeout(() => { addBtn.disabled = true; addBtn.textContent = 'Agotado en este color'; }, 1200);
        }

        mostrarToast(`${producto.nombre} · talla ${sel.talla} ya es tuyo ⚡`);
      });
    }
  });
}

/** Actualiza el numerito del corazón en el header (si existe). */
function actualizarContadorFavoritos() {
  const el = document.getElementById('favCount');
  if (!el) return;
  const total = typeof totalFavoritosCount === 'function' ? totalFavoritosCount() : 0;
  el.textContent = total;
  el.classList.toggle('hidden', total === 0);
}
