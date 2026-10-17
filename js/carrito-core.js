/* ============================================================
   MAQUINA — CARRITO: lógica pura (sin tocar el DOM)
   ------------------------------------------------------------
   Lo usa carrito.html. Depende de lo que ya existe en store.js /
   products.js: getCarrito, stockColor, stockTalla, buscarProducto,
   precioBaseTalla, precioConDescuentoTalla, estaOcultoPorDrop,
   LS_KEYS y _guardar.

   Qué hace:
   · agrupa las unidades iguales (id + color + talla)
   · calcula cuánto stock hay REALMENTE para cada variante, con el
     mismo criterio que usan los botones "Agregar" de la tienda
   · compara cada línea con el catálogo de Firestore (la fuente de
     verdad de la tienda) y corrige precios que cambiaron
   · calcula subtotal, descuentos y total sobre lo que sí se puede comprar
   ============================================================ */
(function (global) {
  'use strict';

  var UMBRAL_POCO_STOCK = 3;

  /* Estado de la última validación contra el catálogo:
     'pendiente'     → todavía no se consultó el catálogo
     'ok'            → el catálogo vino de Firestore y ya se comparó
     'sin_verificar' → no se pudo leer Firestore (sin internet): no se tocan precios */
  var estado = { validacion: 'pendiente', fecha: 0, avisosPrecio: [] };

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* OJO: LS_KEYS está declarado con const en store.js, así que NO cuelga de
     window (leerlo como propiedad de window daría undefined). Se usa el nombre directo. */
  function guardar(carrito) { _guardar(LS_KEYS.carrito, carrito); }
  function clave(it) { return String(it.id) + '|' + (it.color || '') + '|' + (it.talla || ''); }
  function claveColor(it) { return String(it.id) + '|' + (it.color || ''); }

  /** Quita del carrito guardado lo que está dañado (sin id o con precio inválido). */
  function sanear(carrito) {
    return (Array.isArray(carrito) ? carrito : []).filter(function (it) {
      return it && it.id != null && it.id !== '' && isFinite(Number(it.precio)) && Number(it.precio) >= 0;
    });
  }

  /** Lee el carrito ya saneado. Si había basura en localStorage, la limpia. */
  function leer() {
    var crudo = global.getCarrito();
    var limpio = sanear(crudo);
    if (limpio.length !== crudo.length) {
      try { guardar(limpio); } catch (e) { /* ignorar */ }
    }
    return limpio;
  }

  /** Agrupa las unidades iguales conservando el orden en que se agregaron. */
  function agrupar(carrito) {
    var grupos = [], idx = {};
    carrito.forEach(function (it) {
      var k = clave(it);
      if (idx[k] === undefined) {
        idx[k] = grupos.length;
        grupos.push({
          key: k, id: it.id, nombre: it.nombre, categoria: it.categoria, icono: it.icono,
          foto: it.foto || null, color: it.color, talla: it.talla,
          precio: num(it.precio), cantidad: 0, subtotal: 0
        });
      }
      var g = grupos[idx[k]];
      g.cantidad += 1;
      g.subtotal += num(it.precio);
    });
    return grupos;
  }

  /** ¿El producto se puede vender ahora? (existe, está activo y no está oculto por el drop) */
  function vendible(p) {
    if (!p || !p.activo) return false;
    if (typeof global.estaOcultoPorDrop === 'function' && global.estaOcultoPorDrop(p)) return false;
    return true;
  }

  /** Unidades que se pueden comprar de UNA variante (color + talla). Mismo
      criterio que los botones "Agregar" de la tienda: manda el más bajo. */
  function topeVariante(p, color, talla) {
    return Math.min(global.stockColor(p, color), global.stockTalla(p, talla));
  }

  function tieneBolsaDeColor(p, color) {
    return !!(p && p.stockColores && Object.prototype.hasOwnProperty.call(p.stockColores, color));
  }

  /** Cuántas unidades MÁS se pueden sumar a esta línea, contando lo que ya hay
      en el carrito de otras tallas del mismo color (comparten la bolsa de color). */
  function cuantasMasSePuede(p, color, talla, carrito) {
    var enVariante = 0, enColor = 0;
    carrito.forEach(function (it) {
      if (it.id != p.id || it.color !== color) return;
      enColor++;
      if (it.talla === talla) enVariante++;
    });
    var masPorVariante = topeVariante(p, color, talla) - enVariante;
    var masPorColor = tieneBolsaDeColor(p, color) ? global.stockColor(p, color) - enColor : Infinity;
    return Math.max(0, Math.min(masPorVariante, masPorColor));
  }

  /** Analiza el carrito completo y devuelve todo lo que la pantalla necesita. */
  function analizar(carrito) {
    carrito = carrito || leer();
    var verificado = estado.validacion === 'ok';
    var usadoColor = {};
    var grupos = agrupar(carrito).map(function (g) {
      var p = global.buscarProducto(g.id);
      var base = g.precio, descuentoPct = 0;
      if (p) {
        base = global.precioBaseTalla(p, g.talla);
        descuentoPct = Number(p.descuento) || 0;
        if (!(base > g.precio)) { base = g.precio; descuentoPct = 0; }
      }
      var info = {
        producto: p, base: base, descuentoPct: descuentoPct,
        ahorroUnidad: Math.max(0, base - g.precio),
        estado: 'ok', disponible: g.cantidad, unidadesValidas: g.cantidad,
        mensaje: '', pocoStock: 0
      };

      if (verificado) {
        if (!vendible(p)) {
          info.estado = 'no_disponible'; info.disponible = 0; info.unidadesValidas = 0;
          info.mensaje = p ? 'Este producto ya no está disponible.' : 'Este producto ya no está en el catálogo.';
        } else {
          var permitido = topeVariante(p, g.color, g.talla);
          if (tieneBolsaDeColor(p, g.color)) {
            var kc = claveColor(g);
            permitido = Math.min(permitido, global.stockColor(p, g.color) - (usadoColor[kc] || 0));
          }
          permitido = Math.max(0, permitido);
          info.disponible = permitido;
          info.unidadesValidas = Math.min(g.cantidad, permitido);
          usadoColor[claveColor(g)] = (usadoColor[claveColor(g)] || 0) + info.unidadesValidas;
          if (permitido <= 0) {
            info.estado = 'agotado';
            info.mensaje = 'Ya no quedan unidades en este color y talla. Quítalo o elige otra combinación.';
          } else if (g.cantidad > permitido) {
            info.estado = 'parcial';
            info.mensaje = permitido === 1
              ? 'Solo queda 1 unidad disponible y tienes ' + g.cantidad + ' en el carrito.'
              : 'Solo quedan ' + permitido + ' unidades y tienes ' + g.cantidad + ' en el carrito.';
          } else if (permitido <= UMBRAL_POCO_STOCK) {
            info.pocoStock = permitido;
          }
        }
      }
      return Object.assign({}, g, { info: info });
    });

    var unidades = 0, unidadesValidas = 0, lista = 0, subtotal = 0, problemas = 0;
    grupos.forEach(function (g) {
      unidades += g.cantidad;
      unidadesValidas += g.info.unidadesValidas;
      subtotal += g.precio * g.info.unidadesValidas;
      lista += g.info.base * g.info.unidadesValidas;
      if (g.info.estado !== 'ok') problemas++;
    });
    /* Si las unidades de un grupo tienen precios guardados distintos (antes de
       reconciliar), el subtotal exacto es la suma real; se usa mientras no se verifique. */
    if (!verificado) { subtotal = grupos.reduce(function (s, g) { return s + g.subtotal; }, 0); lista = subtotal; }

    return {
      grupos: grupos, unidades: unidades, unidadesValidas: unidadesValidas,
      subtotal: subtotal, lista: Math.max(lista, subtotal), descuentos: Math.max(0, lista - subtotal),
      problemas: problemas, verificado: verificado,
      estadoValidacion: estado.validacion
    };
  }

  /** Compara el carrito con el catálogo recién leído de Firestore y corrige
      precio, nombre y foto de cada línea. Devuelve los avisos de precio. */
  function reconciliar(desdeNube) {
    estado.fecha = Date.now();
    if (!desdeNube) { estado.validacion = 'sin_verificar'; return []; }
    estado.validacion = 'ok';

    var carrito = leer(), cambio = false, avisos = [];
    var visto = {};
    carrito.forEach(function (it) {
      var p = global.buscarProducto(it.id);
      if (!vendible(p)) return;
      var precioReal = global.precioConDescuentoTalla(p, it.talla);
      if (isFinite(precioReal) && precioReal >= 0 && num(it.precio) !== precioReal) {
        var k = clave(it);
        if (!visto[k]) {
          visto[k] = true;
          avisos.push({ nombre: p.nombre, talla: it.talla, antes: num(it.precio), ahora: precioReal });
        }
        it.precio = precioReal; cambio = true;
      }
      var fotoReal = (p.fotos && p.fotos[it.color]) || p.foto || null;
      if (fotoReal && it.foto !== fotoReal) { it.foto = fotoReal; cambio = true; }
      if (p.nombre && it.nombre !== p.nombre) { it.nombre = p.nombre; cambio = true; }
    });
    if (cambio) { try { guardar(carrito); } catch (e) { console.error('No se pudo guardar el carrito corregido:', e); } }
    if (avisos.length) estado.avisosPrecio = estado.avisosPrecio.concat(avisos);
    return avisos;
  }

  /** Ajusta una línea al stock real (deja solo `permitido` unidades). */
  function ajustarAlStock(id, color, talla, permitido) {
    var carrito = leer(), quedan = 0;
    var nuevo = carrito.filter(function (it) {
      if (it.id == id && it.color === color && it.talla === talla) { quedan++; return quedan <= permitido; }
      return true;
    });
    guardar(nuevo);
    return nuevo.length;
  }

  /** Quita todas las líneas que no se pueden comprar (agotadas / ya no existen). */
  function quitarNoDisponibles() {
    var a = analizar();
    var malas = {};
    a.grupos.forEach(function (g) { if (g.info.estado === 'no_disponible' || g.info.estado === 'agotado') malas[g.key] = true; });
    var nuevo = leer().filter(function (it) { return !malas[clave(it)]; });
    guardar(nuevo);
    return nuevo.length;
  }

  global.CarritoCore = {
    estado: estado, UMBRAL_POCO_STOCK: UMBRAL_POCO_STOCK,
    leer: leer, sanear: sanear, agrupar: agrupar, analizar: analizar, reconciliar: reconciliar,
    cuantasMasSePuede: cuantasMasSePuede, topeVariante: topeVariante, vendible: vendible,
    ajustarAlStock: ajustarAlStock, quitarNoDisponibles: quitarNoDisponibles, clave: clave
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.CarritoCore;
})(typeof window !== 'undefined' ? window : globalThis);
