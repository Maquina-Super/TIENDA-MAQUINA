/* ================================================================
   ÍNDICE RÁPIDO DE ESTE ARCHIVO (store.js)
   ------------------------------------------------------------------
   Es un archivo largo porque hace de "backend" del sitio (todo lo
   que normalmente viviría en PHP/MySQL vive acá, hablando con
   Firebase). Guía rápida de en qué línea (aprox.) está cada cosa,
   para no tener que scrollear a ciegas. Los números se van a correr
   un poco cada vez que se edite algo arriba, es solo para orientarse.

     · Avisos por correo/Telegram (Apps Script) ......... línea ~12
     · Catálogo de productos (leer/pintar) .............. línea ~56
     · Precio por talla y con descuento ................. línea ~130
     · Stock por color ................................... línea ~154
     · Stock por talla .................................... línea ~222
     · Admin: editar producto (precio, stock, etc.) ...... línea ~288
     · Carrito de compras .................................. línea ~433
     · Favoritos / lista de deseos ......................... línea ~482
     · Orden del catálogo (destacados, nuevo, etc.) ........ línea ~510
     · Pedidos: crear, descontar stock, consultar .......... línea ~529
     · Solicitudes de servicio (cambios/garantías) ......... línea ~664
     · Suscriptores Voltage Club ............................ línea ~712
     · Aviso de drop nuevo a suscriptores ................... línea ~748
     · Usuarios (login / registro de clientes) .............. línea ~787
     · Recuperar contraseña ................................... línea ~879
     · Config del "próximo drop" (cuenta regresiva) .......... línea ~397
     · Sesión de admin (Firebase Auth real) ................... línea ~983
     · Permisos de cada usuario del panel ....................... línea ~1164
     · Gestión de usuarios del panel (pestaña "Usuarios") ....... línea ~1507
     · Candado de "una sesión a la vez" por usuario .............. línea ~1016
     · Código de desarrollador (con bloqueo por intentos) ......... línea ~1073
     · Menú "Ver/Cambiar foto" del panel: está en js/admin.js, no acá
   ================================================================ */

/* ============================================================
   ALMACENAMIENTO LOCAL (localStorage)
   Reemplaza $_SESSION['carrito'] y las tablas MySQL: pedidos,
   solicitudes_servicio, suscriptores, usuarios.

   Importante: todo esto vive en el navegador de cada visitante.
   Si el mismo cliente entra desde otro celular o borra el
   historial, no va a ver lo mismo. Es igual de "real" que el
   panel admin.html del proyecto de la barbería.
   ============================================================ */

/* URL de tu Google Apps Script (Parte 5 de la guía). Termina en /exec */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwoYELoUZftVoVD6cFV1SWj485vo-bImn6oK8IBTBKV5Z4brMDyWeCsn5ezfy-PFOU/exec";

/** Avisa a Google Apps Script (Sheet + Telegram) de un pedido nuevo o de
    un problema. Nunca bloquea la compra: si falla el envío del aviso
    (ej. no configuraste APPS_SCRIPT_URL, o no hay internet), solo se
    registra en la consola y la tienda sigue funcionando normal. */
function enviarAviso(payload) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT") return;
  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  }).catch((e) => console.error("No se pudo enviar el aviso:", e));
}

const LS_KEYS = {
  carrito: "maquina_carrito",
  pedidos: "maquina_pedidos",
  solicitudes: "maquina_solicitudes",
  suscriptores: "maquina_suscriptores",
  usuarios: "maquina_usuarios",
  sesion: "maquina_sesion",
  productos: "maquina_catalogo",
  admin: "maquina_admin",
  sesionAdmin: "maquina_sesion_admin",
  favoritos: "maquina_favoritos",
  clubCorreo: "maquina_club_correo_guardado",
};

function _leer(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (e) {
    return [];
  }
}
function _guardar(key, valor) {
  localStorage.setItem(key, JSON.stringify(valor));
}

/* ============================================================
   CATÁLOGO (productos editables por el admin)
   PRODUCTS (definido en js/products.js) es solo el catálogo "de
   fábrica" / semilla. La primera vez que alguien abre la tienda
   en su navegador, se copia a localStorage. Desde ahí el panel
   admin.html puede cambiar precio, % de descuento y stock, y
   esos cambios se reflejan en la tienda sin tocar código.

   El catálogo ahora vive en Firestore (colección "productos"), no
   en localStorage. Así, un cambio de precio/stock/foto que hagas
   en admin.html desde cualquier computador o celular se ve igual
   en todos lados, incluida la tienda que ven tus clientes.

   Como todo Firestore es asíncrono, cada página lo carga UNA vez
   al abrir (con await cargarCatalogo()) a una copia en memoria
   (_catalogoCache). De ahí en adelante, getCatalogo() y el resto
   de funciones de este bloque leen/escriben esa copia de forma
   normal (sincrónica) y en segundo plano avisan a Firestore del
   cambio, sin bloquear la interfaz. ============================================================ */
let _catalogoCache = [];

/** Carga el catálogo desde Firestore a la memoria (_catalogoCache).
    Si la colección "productos" está vacía (primera vez que se usa
    la tienda), la siembra con el catálogo de fábrica (PRODUCTS, de
    js/products.js). Cada página HTML debe hacer
    "await cargarCatalogo();" al iniciar, ANTES de llamar a
    productosActivos(), buscarProducto(), obtenerProductosAdmin(),
    etc. — si no, esas funciones van a devolver una lista vacía. */
async function cargarCatalogo() {
  try {
    const snap = await fbDb.collection('productos').get();
    if (snap.empty) {
      const base = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(p => ({
        ...p,
        descuento: 0, // % que pone el admin (0 a 90). 0 = sin descuento.
      }));
      const batch = fbDb.batch();
      base.forEach(p => {
        const { id, ...datos } = p;
        batch.set(fbDb.collection('productos').doc(String(id)), datos);
      });
      await batch.commit();
      _catalogoCache = base;
    } else {
      _catalogoCache = snap.docs.map(d => {
        const datos = d.data();
        return { ...datos, id: isNaN(d.id) ? d.id : Number(d.id) };
      });
    }
  } catch (e) {
    console.error('Error cargando el catálogo desde Firestore:', e);
    // Si falla internet, al menos que la tienda muestre el catálogo de fábrica
    _catalogoCache = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(p => ({ ...p, descuento: 0 }));
  }
  return _catalogoCache;
}
/** Lectura sincrónica del catálogo ya cargado en memoria (ver
    cargarCatalogo más arriba). */
function getCatalogo() {
  return _catalogoCache;
}
/** Guarda en Firestore, en segundo plano, los datos de UN producto.
    No se espera (no bloquea): la pantalla ya se actualizó con el
    cambio en _catalogoCache antes de llamar a esto. */
function _guardarProductoEnNube(producto) {
  const { id, ...datos } = producto;
  fbDb.collection('productos').doc(String(id)).set(datos, { merge: true })
    .catch(e => console.error('Error guardando el producto en la nube:', e));
}
/** Precio final ya aplicado el % de descuento que puso el admin */
function precioConDescuento(p) {
  const d = Number(p.descuento) || 0;
  const base = Number(p.precio) || 0;
  if (d <= 0) return base;
  return Math.round(base * (1 - d / 100));
}
/** Precio BASE (sin descuento) de una talla específica. Si el admin no le
    puso un precio propio a esa talla, se usa el precio general del producto.
    Así, una camiseta puede costar distinto en S/M que en L/XL. */
function precioBaseTalla(p, talla) {
  const t = p.preciosTalla || {};
  if (talla != null && t[talla] !== undefined && t[talla] !== null && t[talla] !== '') {
    return Number(t[talla]) || 0;
  }
  return Number(p.precio) || 0;
}
/** Precio final de una talla específica, ya con el % de descuento aplicado */
function precioConDescuentoTalla(p, talla) {
  const d = Number(p.descuento) || 0;
  const base = precioBaseTalla(p, talla);
  if (d <= 0) return base;
  return Math.round(base * (1 - d / 100));
}
/** Rango {min,max} de precios finales del producto entre todas sus tallas.
    Si todas las tallas cuestan lo mismo, min === max. */
function rangoPrecioTallas(p) {
  const tallas = p.tallas && p.tallas.length ? p.tallas : [null];
  const finales = tallas.map(t => precioConDescuentoTalla(p, t));
  return { min: Math.min(...finales), max: Math.max(...finales) };
}
/* ---------- STOCK POR COLOR ----------
   p.stockColores es un objeto opcional { "#hex": cantidad, ... }.
   Si un producto todavía no tiene ese desglose (productos viejos,
   o el admin no lo configuró), se sigue usando p.stock como una
   sola bolsa compartida entre todos los colores — así nada se
   rompe con el catálogo que ya tenías. p.stock SIEMPRE queda
   sincronizado como la suma de todos los colores cuando sí hay
   desglose, para que el resto del código (que ya leía p.stock)
   siga funcionando sin tocar nada más. */

/** Stock disponible de UN color específico de un producto. */
function stockColor(p, color) {
  if (p && p.stockColores && Object.prototype.hasOwnProperty.call(p.stockColores, color)) {
    return Math.max(0, Number(p.stockColores[color]) || 0);
  }
  return Math.max(0, Number(p && p.stock) || 0);
}
/** true si un color específico ya no tiene unidades */
function colorAgotado(p, color) {
  return stockColor(p, color) <= 0;
}
/** Stock total del producto: si hay desglose por talla se usa ese
    (es el más específico para saber qué se está agotando), si no
    hay pero sí hay desglose por color se usa la suma de colores,
    y si no hay ninguno de los dos se usa el número general. */
function stockTotalProducto(p) {
  if (p && p.stockTallas && Object.keys(p.stockTallas).length) {
    return Object.values(p.stockTallas).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  }
  if (p && p.stockColores && Object.keys(p.stockColores).length) {
    return Object.values(p.stockColores).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  }
  return Math.max(0, Number(p && p.stock) || 0);
}
/** true si no queda stock de ese producto (en NINGÚN color/talla) */
/** A partir de cuántas unidades totales se considera "poco stock"
    (aviso amarillo, antes de llegar a 0 = agotado del todo). */
const STOCK_BAJO_UMBRAL = 3;

/** Nivel de stock de un producto para pintar el aviso correcto en el
    panel: 'agotado' (0 unidades), 'bajo' (quedan pocas, <= umbral) u
    'ok' (stock normal). */
function nivelStockProducto(p) {
  const total = stockTotalProducto(p);
  if (total <= 0) return 'agotado';
  if (total <= STOCK_BAJO_UMBRAL) return 'bajo';
  return 'ok';
}

function estaAgotado(p) {
  return stockTotalProducto(p) <= 0;
}
/** Guarda desde el panel admin el stock de cada color de un producto.
    "stockColores" es un objeto { "#hex": cantidad, ... } con TODOS
    los colores del producto (no solo el que se editó). */
function actualizarStockColoresAdmin(id, stockColores) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  const limpio = {};
  Object.keys(stockColores).forEach(c => {
    limpio[c] = Math.max(0, Math.floor(Number(stockColores[c]) || 0));
  });
  p.stockColores = limpio;
  p.stock = stockTotalProducto(p);
  _guardarProductoEnNube(p);
  return p;
}

/* ---------- STOCK POR TALLA ----------
   Mismo mecanismo que el stock por color, pero por talla: así
   sabes exactamente cuántas unidades quedan de cada talla exacta
   (S, M, L, 5L, 12, lo que sea que uses). p.stockTallas es un
   objeto opcional { "talla": cantidad, ... }. Es independiente del
   desglose por color: puedes usar uno, el otro, los dos o ninguno
   (y seguir con el número único p.stock). */

/** Stock disponible de UNA talla específica de un producto. */
function stockTalla(p, talla) {
  if (p && p.stockTallas && Object.prototype.hasOwnProperty.call(p.stockTallas, talla)) {
    return Math.max(0, Number(p.stockTallas[talla]) || 0);
  }
  return Math.max(0, Number(p && p.stock) || 0);
}
/** true si una talla específica ya no tiene unidades */
function tallaAgotada(p, talla) {
  return stockTalla(p, talla) <= 0;
}
/** Guarda desde el panel admin el stock de cada talla de un producto.
    "stockTallas" es un objeto { "talla": cantidad, ... } con TODAS
    las tallas del producto (no solo la que se editó). */
function actualizarStockTallasAdmin(id, stockTallas) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  const limpio = {};
  Object.keys(stockTallas).forEach(t => {
    limpio[t] = Math.max(0, Math.floor(Number(stockTallas[t]) || 0));
  });
  p.stockTallas = limpio;
  p.stock = stockTotalProducto(p);
  _guardarProductoEnNube(p);
  return p;
}
/** Baja 1 unidad de stock por cada prenda que venga en el carrito
    (se llama al confirmar una compra). Descuenta del color exacto
    que se compró si el producto tiene desglose por color, y
    siempre mantiene p.stock (el total) sincronizado. Actualiza la
    memoria local al toque, y en la nube usa incrementos atómicos
    (increment(-1)) para que dos compras casi simultáneas no se
    pisen entre sí. */
function descontarStockCarrito(carrito) {
  carrito.forEach(item => {
    const p = _catalogoCache.find(x => x.id == item.id);
    if (!p) return;
    const cambiosNube = {};
    let tocoAlgunDesglose = false;
    const usaColores = p.stockColores && Object.prototype.hasOwnProperty.call(p.stockColores, item.color);
    if (usaColores) {
      p.stockColores[item.color] = Math.max(0, Number(p.stockColores[item.color]) - 1);
      cambiosNube[`stockColores.${item.color}`] = firebase.firestore.FieldValue.increment(-1);
      tocoAlgunDesglose = true;
    }
    const usaTallas = p.stockTallas && Object.prototype.hasOwnProperty.call(p.stockTallas, item.talla);
    if (usaTallas) {
      p.stockTallas[item.talla] = Math.max(0, Number(p.stockTallas[item.talla]) - 1);
      cambiosNube[`stockTallas.${item.talla}`] = firebase.firestore.FieldValue.increment(-1);
      tocoAlgunDesglose = true;
    }
    p.stock = tocoAlgunDesglose ? stockTotalProducto(p) : Math.max(0, Number(p.stock) - 1);
    cambiosNube.stock = firebase.firestore.FieldValue.increment(-1);
    fbDb.collection('productos').doc(String(item.id)).update(cambiosNube)
      .catch(e => console.error('Error descontando stock en la nube:', e));
  });
}

/* ---------- ADMIN: gestión de inventario, precio y descuentos ---------- */
/** Todos los productos (activos e inactivos), para el panel admin */
function obtenerProductosAdmin() {
  return getCatalogo();
}
/** Edita nombre/precio/descuento/stock/activo de un producto existente.
    "cambios" es un objeto con solo los campos que se van a actualizar. */
function actualizarProductoAdmin(id, cambios) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  if (cambios.nombre !== undefined) p.nombre = String(cambios.nombre).trim() || p.nombre;
  if (cambios.categoria !== undefined) p.categoria = String(cambios.categoria).trim() || p.categoria;
  if (cambios.precio !== undefined) p.precio = Math.max(0, Number(cambios.precio) || 0);
  if (cambios.descuento !== undefined) p.descuento = Math.min(90, Math.max(0, Number(cambios.descuento) || 0));
  if (cambios.stock !== undefined) p.stock = Math.max(0, Math.floor(Number(cambios.stock) || 0));
  if (cambios.activo !== undefined) p.activo = !!cambios.activo;
  if (cambios.preciosTalla !== undefined) p.preciosTalla = cambios.preciosTalla;
  if (cambios.foto !== undefined) p.foto = cambios.foto;
  if (cambios.badge !== undefined) p.badge = cambios.badge;            // "nuevo" = New Drop, o null
  if (cambios.descripcion !== undefined) p.descripcion = String(cambios.descripcion).trim();
  _guardarProductoEnNube(p);
  return p;
}
/** Guarda (o borra, si dataUrl es null) la foto de UN color específico
    de un producto. Así, si el mismo buso existe en blanco y negro, cada
    color puede tener su propia foto real y la tienda cambia la imagen
    cuando el cliente hace clic en el color. */
function actualizarFotoColorAdmin(id, color, dataUrl) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  if (!p.fotos) p.fotos = {};
  if (dataUrl) {
    p.fotos[color] = dataUrl;
  } else {
    delete p.fotos[color];
  }
  _guardarProductoEnNube(p);
  return p;
}
/** Guarda (o borra, si dataUrl es null) la foto DE ESPALDAS de UN
    color específico de un producto. Se usa igual que
    actualizarFotoColorAdmin, pero para la foto trasera: en la
    tienda, el cliente puede pasar el mouse (o tocar en celular)
    sobre la tarjeta del producto para ver esta foto y las tallas
    disponibles, tal como se ve la prenda de espaldas. */
function actualizarFotoTraseraColorAdmin(id, color, dataUrl) {
  const p = _catalogoCache.find(x => x.id == id);
  if (!p) return null;
  if (!p.fotosTrasera) p.fotosTrasera = {};
  if (dataUrl) {
    p.fotosTrasera[color] = dataUrl;
  } else {
    delete p.fotosTrasera[color];
  }
  _guardarProductoEnNube(p);
  return p;
}
/** Agrega un producto nuevo al catálogo desde el panel admin.
    nuevo.foto (opcional) ya debe venir como dataURL comprimido. */
function agregarProductoAdmin(nuevo) {
  const colores = nuevo.colores && nuevo.colores.length ? nuevo.colores : ['#151512'];
  const tallas = nuevo.tallas && nuevo.tallas.length ? nuevo.tallas : ['S', 'M', 'L', 'XL'];
  // Si mandaron stock por color y/o por talla, eso manda; si no,
  // se reparte el "stock inicial" único como una bolsa compartida.
  const stockColores = nuevo.stockColores && Object.keys(nuevo.stockColores).length
    ? nuevo.stockColores
    : {};
  const stockTallas = nuevo.stockTallas && Object.keys(nuevo.stockTallas).length
    ? nuevo.stockTallas
    : {};
  let stockTotal;
  if (Object.keys(stockTallas).length) {
    stockTotal = Object.values(stockTallas).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  } else if (Object.keys(stockColores).length) {
    stockTotal = Object.values(stockColores).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
  } else {
    stockTotal = Math.max(0, Math.floor(Number(nuevo.stock) || 0));
  }
  const producto = {
    id: Date.now(),
    nombre: (nuevo.nombre || 'Producto nuevo').trim(),
    categoria: (nuevo.categoria || 'Otros').trim(),
    precio: Math.max(0, Number(nuevo.precio) || 0),
    precio_anterior: null,
    descuento: 0,
    icono: nuevo.icono || 'tee',
    foto: nuevo.foto || null,
    fotos: nuevo.fotos || {}, // foto específica por color, ej: {"#151512": "data:..."}
    fotosTrasera: nuevo.fotosTrasera || {}, // foto de espaldas por color
    preciosTalla: nuevo.preciosTalla || {}, // precio específico por talla, ej: {"L": 89900}
    colores: colores,
    tallas: tallas,
    badge: null,
    stock: stockTotal,
    stockColores: stockColores, // {"#hex": cantidad, ...} — vacío = bolsa compartida (stock arriba)
    stockTallas: stockTallas,   // {"talla": cantidad, ...} — vacío = bolsa compartida (stock arriba)
    activo: true,
  };
  _catalogoCache.push(producto);
  _guardarProductoEnNube(producto);
  return producto;
}
/** Elimina un producto del catálogo por completo */
function eliminarProductoAdmin(id) {
  _catalogoCache = _catalogoCache.filter(p => p.id != id);
  fbDb.collection('productos').doc(String(id)).delete()
    .catch(e => console.error('Error eliminando el producto en la nube:', e));
}

/* ============================================================
   CONFIGURACIÓN DEL "PRÓXIMO DROP" (cuenta regresiva de index.html)
   Igual que el catálogo, vive en Firestore (colección "config",
   documento "drop") para que la fecha y los productos que elijas
   en el panel se vean iguales para todos los visitantes, desde
   cualquier computador o celular — no solo en tu navegador.
   ============================================================ */
let _dropConfigCache = { fecha: null, titulo: '', productos: [] };

/** Carga la config del drop desde Firestore a memoria. Cada página
    que la necesite debe hacer "await cargarConfigDrop()" al iniciar,
    igual que se hace con cargarCatalogo(). Si todavía no existe el
    documento (primera vez), deja los valores por defecto de arriba. */
async function cargarConfigDrop() {
  try {
    const doc = await fbDb.collection('config').doc('drop').get();
    if (doc.exists) {
      _dropConfigCache = { fecha: null, titulo: '', productos: [], ...doc.data() };
    }
  } catch (e) {
    console.error('Error cargando la configuración del drop:', e);
  }
  return _dropConfigCache;
}
/** Lectura sincrónica de la config ya cargada en memoria. */
function getConfigDrop() {
  return _dropConfigCache;
}
/** Guarda (desde el panel admin) la fecha del próximo drop, el título
    y/o la lista de ids de productos que se muestran cuando el tiempo
    se acaba. "cambios" trae solo los campos que se van a actualizar. */
function guardarConfigDropAdmin(cambios) {
  _dropConfigCache = { ..._dropConfigCache, ...cambios };
  fbDb.collection('config').doc('drop').set(_dropConfigCache, { merge: true })
    .catch(e => console.error('Error guardando la configuración del drop en la nube:', e));
  return _dropConfigCache;
}

/* ---------- CARRITO ---------- */
function getCarrito() {
  return _leer(LS_KEYS.carrito);
}
function totalCarritoCount() {
  return getCarrito().length;
}
function agregarAlCarrito(producto, color, talla) {
  const carrito = getCarrito();
  const colorFinal = color || producto.colores[0];
  carrito.push({
    id: producto.id,
    nombre: producto.nombre,
    categoria: producto.categoria,
    precio: precioConDescuentoTalla(producto, talla),
    icono: producto.icono,
    foto: (producto.fotos && producto.fotos[colorFinal]) || producto.foto || null,
    color: colorFinal,
    talla: talla,
  });
  _guardar(LS_KEYS.carrito, carrito);
  return carrito.length;
}
function eliminarDelCarrito(idx) {
  const carrito = getCarrito();
  carrito.splice(idx, 1);
  _guardar(LS_KEYS.carrito, carrito);
}
/** Quita SOLO una unidad de un producto (mismo id + color + talla) */
function quitarUnidad(id, color, talla) {
  const carrito = getCarrito();
  const idx = carrito.findIndex(it => it.id == id && it.color === color && it.talla === talla);
  if (idx > -1) carrito.splice(idx, 1);
  _guardar(LS_KEYS.carrito, carrito);
  return carrito.length;
}
/** Quita TODAS las unidades de un producto (mismo id + color + talla) */
function eliminarGrupo(id, color, talla) {
  const carrito = getCarrito().filter(it => !(it.id == id && it.color === color && it.talla === talla));
  _guardar(LS_KEYS.carrito, carrito);
  return carrito.length;
}
function limpiarCarrito() {
  _guardar(LS_KEYS.carrito, []);
}
function totalCarritoValor() {
  return getCarrito().reduce((sum, item) => sum + Number(item.precio), 0);
}

/* ---------- FAVORITOS / LISTA DE DESEOS ----------
   Guarda, en localStorage del navegador, los ids de los productos
   que el cliente marcó con el corazón (sin comprarlos todavía). */
function getFavoritos() {
  return _leer(LS_KEYS.favoritos);
}
/** true si el producto (por id) ya está en favoritos */
function esFavorito(id) {
  return getFavoritos().some(f => f == id);
}
/** Agrega o quita un producto de favoritos. Devuelve la lista resultante. */
function toggleFavorito(id) {
  const favs = getFavoritos();
  const idx = favs.findIndex(f => f == id);
  if (idx > -1) favs.splice(idx, 1);
  else favs.push(id);
  _guardar(LS_KEYS.favoritos, favs);
  return favs;
}
function totalFavoritosCount() {
  return getFavoritos().length;
}
/** Productos activos del catálogo que el cliente marcó como favoritos. */
function productosFavoritos() {
  const favs = getFavoritos();
  return productosActivos().filter(p => favs.some(f => f == p.id));
}

/* ---------- ORDEN DEL CATÁLOGO ----------
   "orden" puede ser: 'relevancia' (por defecto, el orden del
   catálogo), 'precio_asc', 'precio_desc' o 'nuevo' (los productos
   agregados más recientemente primero — se asume que un id más
   alto se agregó después). */
function ordenarProductos(lista, orden) {
  const copia = lista.slice();
  switch (orden) {
    case 'precio_asc':
      return copia.sort((a, b) => rangoPrecioTallas(a).min - rangoPrecioTallas(b).min);
    case 'precio_desc':
      return copia.sort((a, b) => rangoPrecioTallas(b).min - rangoPrecioTallas(a).min);
    case 'nuevo':
      return copia.sort((a, b) => Number(b.id) - Number(a.id));
    default:
      return copia;
  }
}

/* ---------- PEDIDOS ----------
   Los pedidos ya NO se guardan en localStorage: quedan en
   Firestore (colección "pedidos"), así que tú los ves todos desde
   cualquier computador entrando al panel admin, sin importar
   desde qué celular compró cada cliente. */
/** Agrupa el carrito por variante exacta (mismo id + color + talla)
    y cuenta cuántas unidades se necesitan de cada una — es lo que
    hay que verificar contra el stock real en la nube antes de
    cobrar, no solo el stock que ya teníamos en caché local. */
function _agruparNecesidadesStock(carrito) {
  const necesidades = {};
  carrito.forEach(item => {
    const key = `${item.id}|${item.color || ''}|${item.talla || ''}`;
    if (!necesidades[key]) necesidades[key] = { id: item.id, color: item.color, talla: item.talla, nombre: item.nombre, cantidad: 0 };
    necesidades[key].cantidad++;
  });
  return necesidades;
}

/** Crea el pedido y descuenta el stock en una sola transacción de
    Firestore: primero LEE el stock real más reciente de cada
    producto involucrado, confirma que alcanza para lo que hay en
    el carrito, y solo si alcanza, descuenta y guarda el pedido —
    todo o nada. Así, si dos personas compran la última unidad casi
    al mismo tiempo, a la segunda se le avisa "ya no queda" en vez
    de dejar el stock en negativo.
    Lanza un Error con .code = 'SIN_STOCK' o 'SIN_PRODUCTO' cuando
    algo del carrito ya no está disponible, para que la pantalla de
    pago pueda mostrar un mensaje claro en vez de uno genérico. */
async function crearPedido(datosCliente) {
  const carrito = getCarrito();
  if (!carrito.length) return null;
  const envio = datosCliente.envio || {};
  const subtotal = totalCarritoValor();
  const costoEnvioPedido = Number(envio.costo || 0);
  const usuario = usuarioActual();
  const pedido = {
    usuario_uid: usuario ? usuario.id : null,
    nombre_cliente: datosCliente.nombre,
    email_cliente: datosCliente.email,
    telefono_cliente: datosCliente.telefono || '',
    metodo_pago: datosCliente.metodoPago || 'contraentrega',
    tarjeta_final: datosCliente.tarjetaFinal || null,
    envio_municipio: envio.municipio || '',
    envio_barrio: envio.barrio || '',
    envio_vereda: envio.vereda || '',
    envio_direccion: envio.direccion || '',
    envio_edificio: envio.edificio || '',
    envio_referencia: envio.referencia || '',
    costo_envio: costoEnvioPedido,
    items: carrito.map(i => ({ id: String(i.id), nombre: i.nombre, talla: i.talla, color: i.color, precio: i.precio, foto: i.foto || null })),
    detalle: carrito.map(i => `${i.nombre} (${i.talla})`).join(" | "),
    subtotal: subtotal,
    total: subtotal + costoEnvioPedido,
    fecha: new Date().toISOString(),
  };

  const necesidades = _agruparNecesidadesStock(carrito);
  const idsUnicos = [...new Set(Object.values(necesidades).map(n => String(n.id)))];
  const pedidoRef = fbDb.collection('pedidos').doc();

  try {
    await fbDb.runTransaction(async (tx) => {
      // 1) Lee el estado MÁS RECIENTE de cada producto (dentro de la
      //    transacción, así Firestore detecta si alguien más lo
      //    cambió al mismo tiempo y reintenta solo).
      const productosPorId = {};
      for (const id of idsUnicos) {
        const snap = await tx.get(fbDb.collection('productos').doc(id));
        productosPorId[id] = snap.exists ? snap.data() : null;
      }

      // 2) Verifica que alcance el stock de CADA variante pedida.
      Object.values(necesidades).forEach(n => {
        const data = productosPorId[String(n.id)];
        if (!data) {
          throw Object.assign(new Error(`"${n.nombre || 'Un producto'}" ya no está disponible.`), { code: 'SIN_PRODUCTO' });
        }
        let disponible;
        if (data.stockColores && Object.prototype.hasOwnProperty.call(data.stockColores, n.color)) {
          disponible = Math.max(0, Number(data.stockColores[n.color]) || 0);
        } else if (data.stockTallas && Object.prototype.hasOwnProperty.call(data.stockTallas, n.talla)) {
          disponible = Math.max(0, Number(data.stockTallas[n.talla]) || 0);
        } else {
          disponible = Math.max(0, Number(data.stock) || 0);
        }
        if (disponible < n.cantidad) {
          const cual = data.nombre || n.nombre || 'un producto';
          throw Object.assign(
            new Error(disponible <= 0
              ? `"${cual}" se agotó justo ahora. Vuelve al carrito y quítalo o cambia de color/talla.`
              : `Solo quedan ${disponible} unidades de "${cual}" y tu carrito pide ${n.cantidad}. Ajusta la cantidad en el carrito.`),
            { code: 'SIN_STOCK' }
          );
        }
      });

      // 3) Ya validado: descuenta stock y crea el pedido, todo en la
      //    misma transacción (o se guardan las dos cosas, o ninguna).
      Object.values(necesidades).forEach(n => {
        const data = productosPorId[String(n.id)];
        const ref = fbDb.collection('productos').doc(String(n.id));
        const cambios = {};
        if (data.stockColores && Object.prototype.hasOwnProperty.call(data.stockColores, n.color)) {
          cambios[`stockColores.${n.color}`] = firebase.firestore.FieldValue.increment(-n.cantidad);
        }
        if (data.stockTallas && Object.prototype.hasOwnProperty.call(data.stockTallas, n.talla)) {
          cambios[`stockTallas.${n.talla}`] = firebase.firestore.FieldValue.increment(-n.cantidad);
        }
        cambios.stock = firebase.firestore.FieldValue.increment(-n.cantidad);
        tx.update(ref, cambios);
      });

      tx.set(pedidoRef, pedido);
    });
  } catch (e) {
    console.error('Error guardando el pedido en Firestore:', e);
    if (!e || !e.code) {
      // Error real de conexión/Firebase (no de stock): avisa al admin
      // igual que antes, pero deja que quien llamó decida el mensaje
      // para el cliente (sin internet, error genérico, etc).
      enviarAviso({ tipo: 'problema', titulo: 'No se pudo guardar un pedido', detalle: String(e && e.message || e) });
    }
    throw e;
  }

  // Refresca el stock en la caché local (en la nube ya quedó
  // descontado dentro de la transacción de arriba) para que la
  // vitrina no siga mostrando unidades que ya se vendieron.
  Object.values(necesidades).forEach(n => {
    const p = _catalogoCache.find(x => x.id == n.id);
    if (!p) return;
    if (p.stockColores && Object.prototype.hasOwnProperty.call(p.stockColores, n.color)) {
      p.stockColores[n.color] = Math.max(0, Number(p.stockColores[n.color]) - n.cantidad);
    }
    if (p.stockTallas && Object.prototype.hasOwnProperty.call(p.stockTallas, n.talla)) {
      p.stockTallas[n.talla] = Math.max(0, Number(p.stockTallas[n.talla]) - n.cantidad);
    }
    p.stock = (p.stockColores && Object.keys(p.stockColores).length) || (p.stockTallas && Object.keys(p.stockTallas).length)
      ? stockTotalProducto(p)
      : Math.max(0, Number(p.stock) - n.cantidad);
  });

  limpiarCarrito();
  // código corto y fácil de leer para el asunto/cuerpo del correo de
  // confirmación (el número "Pedido #7" del panel admin necesita ver
  // TODOS los pedidos para calcularse, así que aquí usamos algo que
  // sí se puede armar al instante, con lo que ya tenemos a mano).
  const codigoPedido = pedidoRef.id.slice(-6).toUpperCase();
  enviarAviso({ tipo: 'pedido_nuevo', pedido: { ...pedido, id: pedidoRef.id, codigo_pedido: codigoPedido } });
  return { ...pedido, id: pedidoRef.id, codigo_pedido: codigoPedido };
}

/** Estados posibles de un pedido, en el orden en que avanzan.
    Un pedido que todavía no tiene campo "estado" guardado (los
    que se crearon antes de que existiera esto) se trata como
    "pendiente". */
const ESTADOS_PEDIDO = {
  pendiente:  { label: 'Pendiente',  emoji: '🕓' },
  confirmado: { label: 'Confirmado', emoji: '✅' },
  enviado:    { label: 'Enviado',    emoji: '🚚' },
  entregado:  { label: 'Entregado',  emoji: '📦' },
  cancelado:  { label: 'Cancelado',  emoji: '✕' },
};
function estadoPedido(p) {
  return (p.estado && ESTADOS_PEDIDO[p.estado]) ? p.estado : 'pendiente';
}

/** El id de Firestore (ej: "aB3xY9k...") sirve para buscar el pedido
    exacto en la base de datos, pero no es nada práctico para hablar
    con un cliente ("tu pedido aB3xY9k9..." no dice nada). Esta
    función arma un mapa id -> número corto ("Pedido #1", "#2"...)
    numerando los pedidos del más viejo al más nuevo, para que el
    número de cada pedido no cambie con el tiempo aunque entren
    pedidos nuevos después. Se calcula sobre TODA la lista de
    pedidos (sin filtrar), para que el número sea siempre el mismo
    sin importar qué filtro/orden esté aplicado en la tabla. */
function mapaNumerosPedido(todosLosPedidos) {
  const ordenadosPorFecha = [...todosLosPedidos].sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return fa - fb;
  });
  const mapa = new Map();
  ordenadosPorFecha.forEach((p, i) => mapa.set(p.id, i + 1));
  return mapa;
}

/** Trae todos los pedidos guardados en la nube, del más nuevo al
    más viejo. Lo usa el panel admin. */
async function obtenerPedidosAdmin() {
  try {
    const snap = await fbDb.collection('pedidos').orderBy('fecha', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Error leyendo pedidos:', e);
    return [];
  }
}

/** Cambia el estado de un pedido (pendiente/confirmado/enviado/
    entregado/cancelado) en Firestore. Lo usa el panel admin desde
    el selector de estado en la tabla de pedidos. Además:
    - guarda quién hizo el cambio y cuándo, en "historial_estados"
      (así queda registro de quién marcó qué, con varios usuarios
      usando el panel).
    - avisa por Telegram (mismo canal que "pedido nuevo"), para
      que el equipo se entere del cambio sin tener que abrir el
      panel a cada rato. */
async function actualizarEstadoPedidoAdmin(id, estado) {
  if (!ESTADOS_PEDIDO[estado]) return { ok: false, msg: 'Estado inválido.' };
  const usuario = usuarioAdminActual() || 'desconocido';
  const entradaHistorial = { estado, usuario, fecha: new Date().toISOString() };
  try {
    await fbDb.collection('pedidos').doc(id).update({
      estado,
      historial_estados: firebase.firestore.FieldValue.arrayUnion(entradaHistorial),
    });
    enviarAviso({ tipo: 'pedido_estado', id, estado, usuario });
    return { ok: true, entradaHistorial };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** Borra un pedido de Firestore por completo. Quien llama a esto ya
    tuvo que confirmar su propia contraseña antes (ver admin.html),
    así que aquí solo se hace el borrado. */
async function eliminarPedidoAdmin(id) {
  try {
    await fbDb.collection('pedidos').doc(id).delete();
    enviarAviso({ tipo: 'pedido_eliminado', id });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/* ============================================================
   RESEÑAS REALES DE CLIENTES
   ------------------------------------------------------------
   Antes, si un producto no tenía "rating"/"resenas" cargados a
   mano, la tarjeta se inventaba un número solo para no quedar
   coja (ver YD_MOSTRAR_CALIFICACIONES en maquina-ui.js, ya
   apagado). Esto de aquí reemplaza eso por reseñas de verdad:
   cada una se guarda en la colección "resenas", y el promedio del
   producto (p.rating / p.resenas, los mismos campos que ya leía
   todo el código) se recalcula solo cada vez que entra una nueva.
   ============================================================ */

/** Trae las reseñas reales de un producto, más recientes primero. */
async function listarResenas(productoId) {
  try {
    const snap = await fbDb.collection('resenas')
      .where('productoId', '==', String(productoId))
      .orderBy('fecha', 'desc')
      .limit(50)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

/** Guarda una reseña real y actualiza el promedio del producto.
    Un mismo navegador solo puede dejar una reseña por producto
    (se recuerda en localStorage), para frenar el spam sin tener
    que armar un sistema de "solo quien compró" todavía. */
async function crearResena(productoId, nombreInput, estrellasInput, comentarioInput) {
  const id = String(productoId);
  const nombre = String(nombreInput || '').trim().slice(0, 60);
  const comentario = String(comentarioInput || '').trim().slice(0, 500);
  const estrellas = Math.min(5, Math.max(1, Math.round(Number(estrellasInput) || 0)));

  if (!nombre) return { ok: false, msg: 'Escribe tu nombre.' };
  if (!estrellas) return { ok: false, msg: 'Elige cuántas estrellas le das.' };
  if (localStorage.getItem('yd_resena_' + id)) {
    return { ok: false, msg: 'Ya dejaste una reseña para este producto desde este navegador.' };
  }

  try {
    await fbDb.collection('resenas').add({
      productoId: id, nombre, estrellas, comentario,
      fecha: new Date().toISOString(),
    });

    // Recalcula el promedio dentro de una transacción, para que
    // dos reseñas que lleguen casi al mismo tiempo no se pisen.
    const ref = fbDb.collection('productos').doc(id);
    await fbDb.runTransaction(async (t) => {
      const doc = await t.get(ref);
      const actual = doc.exists ? doc.data() : {};
      const conteoActual = Number(actual.resenas) || 0;
      const promActual = Number(actual.rating) || 0;
      const nuevoConteo = conteoActual + 1;
      const nuevoProm = ((promActual * conteoActual) + estrellas) / nuevoConteo;
      t.set(ref, { rating: Number(nuevoProm.toFixed(2)), resenas: nuevoConteo }, { merge: true });
    });

    localStorage.setItem('yd_resena_' + id, '1');
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/* ---------- SOLICITUDES DE SERVICIO (cambios, garantías, quejas) ----------
   extra puede traer:
     foto:      dataURL (jpeg) ya comprimido, o null
     ubicacion: { lat, lng } capturada por geolocalización, o null
   ambos son opcionales y no rompen las llamadas antiguas. */
function guardarSolicitud(servicio, nombre, contacto, descripcion, extra = {}) {
  const solicitudes = _leer(LS_KEYS.solicitudes);
  solicitudes.push({
    id: Date.now(),
    servicio,
    nombre,
    contacto,
    descripcion,
    foto: extra.foto || null,
    ubicacion: extra.ubicacion || null,
    fecha: new Date().toISOString(),
  });
  _guardar(LS_KEYS.solicitudes, solicitudes);
}

/** Comprime una foto (File) a un dataURL jpeg liviano antes de guardarla
    en localStorage. Devuelve una Promise<string|null>. */
function comprimirImagen(file, maxAncho = 900, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'));
      return;
    }
    const lector = new FileReader();
    lector.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = e.target.result;
    };
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(file);
  });
}

/* ---------- SUSCRIPTORES (Voltage Club) ----------
   Colección propia en Firestore ("voltage_club"), separada por
   completo de admin_usuarios/admin_sesiones (las cuentas del
   equipo). Cualquiera puede dejar su correo, pero solo el admin
   puede leer la lista (ver reglas de Firestore). También se guarda
   una copia en este navegador como respaldo, por si no hay
   internet en ese momento. */
async function suscribirVoltageClub(email) {
  const correo = email.trim().toLowerCase();

  const lista = _leer(LS_KEYS.suscriptores);
  if (!lista.includes(correo)) {
    lista.push(correo);
    _guardar(LS_KEYS.suscriptores, lista);
  }

  try {
    await fbDb.collection('voltage_club').doc(correo).set({
      correo,
      fecha: Date.now(),
    }, { merge: true });
    return { ok: true };
  } catch (e) {
    // sin internet: ya quedó guardado localmente, se puede reintentar después
    return { ok: false, msg: 'Se guardó en este dispositivo, pero no se pudo enviar a la nube (revisa tu internet).' };
  }
}

/* Trae la lista completa de correos del Voltage Club desde
   Firestore (solo funciona si quien llama es admin, por las
   reglas). Se usa en el panel. */
async function obtenerSuscriptoresVoltageClub() {
  const snap = await fbDb.collection('voltage_club').orderBy('fecha', 'desc').get();
  return snap.docs.map(d => d.data());
}

/* ---------- Aviso automático de drop nuevo al Voltage Club ----------
   Antes había que copiar la lista de correos y mandarles el mensaje
   tú mismo por fuera (WhatsApp, correo, etc.). Ahora, desde el botón
   "📢 Avisar drop nuevo" en la pestaña Resumen del panel, se junta la
   lista actual de suscriptores y se manda a tu Apps Script, que es
   quien de verdad envía el correo (con la misma cuenta de Gmail que
   ya usas para todo lo demás — ver GUIA_AVISO_DROP_VOLTAGE_CLUB.txt).
   Cada suscriptor va por copia oculta (bcc): nadie ve la lista de
   correos de los demás. */
async function avisarDropVoltageClub(asuntoInput, mensajeInput) {
  const asunto = String(asuntoInput || '').trim();
  const mensaje = String(mensajeInput || '').trim();
  if (!asunto) return { ok: false, msg: 'Escribe un asunto para el correo.' };
  if (!mensaje) return { ok: false, msg: 'Escribe el mensaje del drop.' };

  let suscriptores;
  try {
    suscriptores = await obtenerSuscriptoresVoltageClub();
  } catch (e) {
    return { ok: false, msg: 'No se pudo leer la lista del Voltage Club (revisa tu internet).' };
  }
  const correos = suscriptores.map(s => s.correo).filter(Boolean);
  if (!correos.length) return { ok: false, msg: 'Todavía no hay nadie en el Voltage Club.' };

  enviarAviso({ tipo: 'aviso_drop_nuevo', correos, asunto, mensaje });
  return { ok: true, cantidad: correos.length };
}

/* Guarda el correo del cliente en ESTE navegador (clave aparte,
   nada que ver con el login del panel de administración) para que,
   la próxima vez que entre a la tienda, el campo "tu@correo.com" ya
   venga lleno y no tenga que volver a escribirlo. */
function guardarCorreoClub(email) {
  try { localStorage.setItem(LS_KEYS.clubCorreo, email); } catch (e) { /* no pasa nada si falla */ }
}
function correoClubGuardado() {
  try { return localStorage.getItem(LS_KEYS.clubCorreo) || ''; } catch (e) { return ''; }
}

/* ---------- USUARIOS (login / registro) ----------
   Ahora las cuentas viven en Firebase Authentication (la nube de
   Google), no en este navegador. Cualquier cliente puede entrar
   desde cualquier celular/computador con el mismo correo y
   contraseña, y ni siquiera nosotros vemos su contraseña real
   (Firebase la protege). Los datos extra (nombre, país, fecha de
   nacimiento) se guardan en Firestore, en la colección "usuarios".

   Todas estas funciones ahora son asíncronas (devuelven una
   Promise), porque hablan con internet. Hay que usar
   await/then() al llamarlas. */

/* Cache en memoria (no en localStorage) para que renderHeader()
   pueda seguir leyendo el usuario de forma sincrónica mientras
   llega la respuesta real de Firebase. */
let _usuarioActualCache = null;
const _listenersSesion = [];

function onCambioSesion(callback) {
  _listenersSesion.push(callback);
}

if (typeof fbAuth !== 'undefined') {
  fbAuth.onAuthStateChanged(async (user) => {
    if (!user) {
      _usuarioActualCache = null;
    } else {
      try {
        const doc = await fbDb.collection('usuarios').doc(user.uid).get();
        const datos = doc.exists ? doc.data() : {};
        _usuarioActualCache = {
          id: user.uid,
          nombre: datos.nombre || user.displayName || user.email,
          correo: user.email,
          fechaNacimiento: datos.fechaNacimiento || null,
          pais: datos.pais || null,
        };
      } catch (e) {
        _usuarioActualCache = { id: user.uid, nombre: user.email, correo: user.email };
      }
    }
    _listenersSesion.forEach(cb => cb(_usuarioActualCache));
  });
}

async function registrarUsuario(nombre, correo, contrasena, fechaNacimiento, pais, telefono = null) {
  try {
    const cred = await fbAuth.createUserWithEmailAndPassword(correo, contrasena);
    await cred.user.updateProfile({ displayName: nombre });
    await fbDb.collection('usuarios').doc(cred.user.uid).set({
      nombre, correo, fechaNacimiento, pais,
      telefono: telefono || null,
      creado: new Date().toISOString(),
    });
    // Guarda también teléfono -> correo en una colección aparte
    // ("telefonos"), para que "¿Olvidaste tu contraseña?" pueda
    // encontrar la cuenta cuando el cliente solo recuerda su
    // número (ver más abajo, sección RECUPERAR CONTRASEÑA).
    if (telefono) {
      try {
        await fbDb.collection('telefonos').doc(telefono).set({ correo });
      } catch (e) {
        console.error('No se pudo guardar el teléfono para recuperación:', e);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

async function iniciarSesion(usuarioInput, contrasena) {
  try {
    await fbAuth.signInWithEmailAndPassword(usuarioInput, contrasena);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

/** Lectura sincrónica (usa la última copia que llegó de Firebase).
    Justo al abrir una página puede devolver null un instante
    mientras Firebase confirma la sesión; por eso layout.js también
    escucha onCambioSesion() para repintar el header apenas llega. */
function usuarioActual() {
  return _usuarioActualCache;
}

function cerrarSesion() {
  return fbAuth.signOut();
}

/* ---------- RECUPERAR CONTRASEÑA ----------
   Dos caminos, según con qué se registró el cliente:

   1) CORREO: se manda directo el correo de restablecimiento de
      Firebase (enviarRecuperacionCorreo). Es un solo paso.

   2) TELÉFONO: primero hay que probar que esa persona SÍ es dueña
      del número (se manda un SMS con código, igual que en el
      registro). Una vez confirmado el código, se busca en la
      colección "telefonos" a qué correo pertenece ese número, y
      se le manda el enlace de restablecimiento a ESE correo (no
      se le entrega la contraseña ni se inicia sesión directo).
      Esto solo encuentra cuentas registradas con teléfono DESPUÉS
      de que se agregó esta función, porque la colección
      "telefonos" se llena en registrarUsuario(). */

/** Manda el correo de restablecimiento de Firebase a un correo
    que el cliente escribe a mano. Por seguridad, Firebase nunca
    revela si el correo existe o no: la llamada "funciona" igual;
    si existe, le llega el enlace. */
async function enviarRecuperacionCorreo(correo) {
  try {
    await fbAuth.sendPasswordResetEmail(correo);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

/** Paso 1 de recuperación por teléfono: manda un SMS con código
    (reutiliza Firebase Phone Auth, igual que el registro).
    recaptchaVerifier lo crea la página (firebase.auth.RecaptchaVerifier).
    Devuelve el confirmationResult para usarlo en el paso 2. */
async function enviarCodigoRecuperacionTelefono(telefono, recaptchaVerifier) {
  try {
    const confirmationResult = await fbAuth.signInWithPhoneNumber(telefono, recaptchaVerifier);
    return { ok: true, confirmationResult };
  } catch (e) {
    console.error('Error enviando SMS de recuperación:', e);
    let msg = 'No se pudo enviar el SMS. Revisa el número e inténtalo de nuevo.';
    if (e && e.code === 'auth/invalid-phone-number') msg = 'Ese número no parece válido.';
    if (e && e.code === 'auth/too-many-requests') msg = 'Demasiados intentos, espera un momento.';
    return { ok: false, msg };
  }
}

/** Paso 2 de recuperación por teléfono: confirma el código SMS,
    busca el correo dueño de ese número, y le manda el enlace de
    restablecimiento a ese correo (nunca lo muestra completo). */
async function confirmarCodigoRecuperacionTelefono(confirmationResult, codigo, telefono) {
  try {
    await confirmationResult.confirm(codigo);
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    const msg = e && e.code === 'auth/code-expired'
      ? 'El código expiró, pide uno nuevo.'
      : 'Código incorrecto, inténtalo de nuevo.';
    return { ok: false, msg };
  }
  try {
    const doc = await fbDb.collection('telefonos').doc(telefono).get();
    // El teléfono ya cumplió su función (probar que es suyo); esa
    // sesión temporal por SMS no es la cuenta real del cliente.
    try { await fbAuth.signOut(); } catch (_) {}
    if (!doc.exists || !doc.data().correo) {
      return { ok: false, msg: 'No encontramos ninguna cuenta con ese número. Si te registraste hace tiempo, prueba con la opción "Correo".' };
    }
    const correo = doc.data().correo;
    await fbAuth.sendPasswordResetEmail(correo);
    return { ok: true, correoTapado: taparCorreo(correo) };
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    console.error('Error buscando cuenta por teléfono:', e);
    return { ok: false, msg: 'Ocurrió un error buscando tu cuenta. Intenta de nuevo.' };
  }
}

/** Tapa un correo para mostrarlo sin revelarlo completo,
    ej: "juanperez@gmail.com" -> "ju*******@gmail.com" */
function taparCorreo(correo) {
  const partes = String(correo).split('@');
  if (partes.length < 2) return correo;
  const [usuario, dominio] = partes;
  const visible = usuario.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(3, usuario.length - 2))}@${dominio}`;
}

function traducirErrorFirebase(e) {
  const codigo = e && e.code;
  const mapa = {
    'auth/email-already-in-use': 'Ese correo ya está registrado.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    'auth/network-request-failed': 'No hay conexión a internet.',
  };
  return mapa[codigo] || 'Ocurrió un error, intenta de nuevo.';
}

/* ============================================================
   SESIÓN DE ADMIN (panel del vendedor) — con FIREBASE AUTH REAL
   ------------------------------------------------------------
   Cada persona del equipo entra con una cuenta REAL de Firebase
   Authentication (correo + contraseña), creada desde la consola
   de Firebase (Authentication -> Users -> Add user) por quien ya
   tenga acceso al panel. Eso es lo que permite que las reglas de
   Firestore (ver firestore.rules, función isAdmin()) puedan
   distinguir de verdad "alguien del equipo" de "un visitante
   cualquiera que abre la consola del navegador" — mirando su UID,
   no un usuario/contraseña guardado en la misma base de datos que
   se quiere proteger.

   Además de la cuenta en Firebase Auth, cada persona tiene un
   documento en Firestore (colección "admin_usuarios", con ID = su
   UID) que guarda: su correo (solo para mostrarlo en el panel),
   si está activo, cuándo se creó y sus permisos (qué pestañas
   puede tocar). Esto NO reemplaza la lista de UID de
   firestore.rules: esa lista es la que de verdad decide quién
   puede leer/escribir en Firestore. El documento en
   "admin_usuarios" es solo para permisos y para que el panel
   sepa qué mostrarle a cada quien.

   PARA DAR ACCESO A ALGUIEN NUEVO DEL EQUIPO:
   1) Créale su cuenta en Firebase Auth (consola -> Authentication
      -> Users -> Add user) y copia su UID.
   2) Desde la pestaña "Usuarios" de este panel, crea su perfil
      pegando ese mismo UID y su correo, y marca sus permisos.
   Con eso ya queda con acceso real a Firestore: el panel agrega
   su UID solo a la lista admin_config/admins (la que de verdad
   lee la función isAdmin() de firestore.rules) — ya NO hay que
   editar firestore.rules a mano cada vez que entra alguien nuevo.
   Desactivar a alguien desde el panel también le quita el acceso
   real, no solo el login.

   CANDADO DE "UNA SESIÓN A LA VEZ" POR USUARIO
   ------------------------------------------------------------
   Cuando alguien entra, se guarda un "sesionId" al azar en
   Firestore (colección "admin_sesiones", ID = su UID). Mientras
   el panel sigue abierto, cada ADMIN_LATIDO_MS se manda un "aquí
   sigo" a ese documento. Si otra persona (o la misma, desde otro
   dispositivo) intenta entrar con ESA MISMA cuenta mientras el
   candado sigue "vivo", se le avisa que la cuenta está en uso y
   no la deja entrar.

   Si a alguien se le cierra el navegador de golpe y nunca alcanza
   a "Cerrar sesión", el candado se libera SOLO después de
   ADMIN_SESION_VENCE_MS sin latidos.

   Esto es aparte y no afecta el inicio de sesión de los CLIENTES
   en login.html (esos también usan Firebase Auth, pero son
   cuentas totalmente distintas de las del panel admin). */

const ADMIN_LATIDO_MS = 25000;        // cada cuánto avisa "sigo aquí"
const ADMIN_SESION_VENCE_MS = 70000;  // sin latidos por más de esto = candado libre

/* Bloqueo del código de acceso al panel: después de este número de
   intentos SEGUIDOS con el código mal (con la contraseña ya bien
   verificada), la cuenta queda bloqueada por este rato. Esto es lo
   que evita que alguien que ya se robó una contraseña se siente a
   probar códigos de 6 números uno por uno. */
const CODIGO_PANEL_MAX_INTENTOS = 5;
const CODIGO_PANEL_BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos

/* Código extra que solo debería conocer el desarrollador (o quien
   tú le digas). Se pide, además de estar logueado en el panel,
   para: crear usuarios nuevos, editar sus permisos, activar/
   desactivar, eliminar, y cambiar la contraseña propia. Así,
   aunque alguien ya esté adentro del panel viendo inventario y
   pedidos, no puede tocar usuarios ni contraseñas sin este código
   aparte.
   OJO: como este es un sitio estático (sin servidor propio), este
   código queda visible para cualquiera que abra el código fuente
   de la página. No es una barrera de seguridad real contra alguien
   que sepa programación — es más bien un candado para que un
   miembro común del equipo no entre a tocar usuarios/contraseñas
   por accidente o sin permiso.

   Se guarda como huella SHA-256 (hash), no en texto plano. Para
   CAMBIAR el código de desarrollador: calcula el SHA-256 del
   código nuevo (por ejemplo, pegándolo en la consola del navegador:
   `crypto.subtle.digest('SHA-256', new TextEncoder().encode('TU_CODIGO_NUEVO')).then(b=>console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))`
   ) y pega el resultado abajo, reemplazando CODIGO_DESARROLLADOR_HASH. */
const CODIGO_DESARROLLADOR_HASH = "95f5e4e4377dd8ede9fee4f9840c9d039a5c5bf953a2db6014c26f11a6070c04";

/** Saca el SHA-256 de un texto y lo devuelve en hexadecimal. */
async function _sha256Hex(texto) {
  const datos = new TextEncoder().encode(String(texto || ""));
  const buffer = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Verifica el código de desarrollador CONTANDO los intentos fallidos
    en Firestore (en el documento admin_usuarios del admin que tiene la
    sesión abierta), y bloqueando esa cuenta 15 minutos después de
    varios intentos seguidos con el código mal — el mismo mecanismo que
    ya protege el código de acceso al panel (ver CODIGO_PANEL_MAX_INTENTOS
    más abajo). Así, aunque el hash quede visible en el código fuente
    (inevitable en un sitio estático, ver nota arriba), nadie puede
    sentarse a probarlo mil veces seguidas: al quinto intento fallido
    queda bloqueado un rato.
    Muestra su propio toast con el resultado (intentos que quedan, o
    el aviso de bloqueo), así que quien la llama NO debe mostrar otro
    toast de "código incorrecto" aparte. */
async function verificarCodigoDesarrollador(codigo) {
  const uid = fbAuth.currentUser && fbAuth.currentUser.uid;
  if (!uid) { showToast('Tu sesión no es válida. Vuelve a entrar al panel.', true); return false; }
  if (!codigo) { showToast('Escribe el código de desarrollador.', true); return false; }

  let datos = {};
  try {
    const doc = await fbDb.collection('admin_usuarios').doc(uid).get();
    datos = doc.exists ? doc.data() : {};
  } catch (e) {
    // sin internet no hay forma de contar intentos en la nube: se
    // deja pasar solo si el código es correcto, igual que antes.
    try {
      const ok = (await _sha256Hex(codigo)) === CODIGO_DESARROLLADOR_HASH;
      if (!ok) showToast('Código de desarrollador incorrecto.', true);
      return ok;
    } catch (e2) { return false; }
  }

  const ahora = Date.now();
  if (datos.devBloqueadoHasta && Number(datos.devBloqueadoHasta) > ahora) {
    const minutosFaltan = Math.ceil((Number(datos.devBloqueadoHasta) - ahora) / 60000);
    showToast(`Demasiados intentos con el código de desarrollador. Espera ${minutosFaltan} minuto${minutosFaltan === 1 ? '' : 's'}.`, true);
    return false;
  }

  let correcto = false;
  try { correcto = (await _sha256Hex(codigo)) === CODIGO_DESARROLLADOR_HASH; }
  catch (e) { correcto = false; }

  if (correcto) {
    if (datos.devIntentosFallidos || datos.devBloqueadoHasta) {
      try {
        await fbDb.collection('admin_usuarios').doc(uid).update({
          devIntentosFallidos: 0,
          devBloqueadoHasta: firebase.firestore.FieldValue.delete(),
        });
      } catch (_) {}
    }
    return true;
  }

  const intentos = (Number(datos.devIntentosFallidos) || 0) + 1;
  const cambios = { devIntentosFallidos: intentos };
  let bloqueado = false;
  if (intentos >= CODIGO_PANEL_MAX_INTENTOS) {
    cambios.devIntentosFallidos = 0;
    cambios.devBloqueadoHasta = ahora + CODIGO_PANEL_BLOQUEO_MS;
    bloqueado = true;
  }
  try { await fbDb.collection('admin_usuarios').doc(uid).update(cambios); } catch (_) {}
  if (bloqueado) {
    showToast('Código de desarrollador incorrecto. Por seguridad, queda bloqueado 15 minutos.', true);
  } else {
    showToast(`Código de desarrollador incorrecto (te quedan ${CODIGO_PANEL_MAX_INTENTOS - intentos} intento${CODIGO_PANEL_MAX_INTENTOS - intentos === 1 ? '' : 's'}).`, true);
  }
  return false;
}

/* Contraseña para ENTRAR a la pestaña "Usuarios" (solo para verla).
   Es una contraseña fija (no la de ninguna cuenta) y además solo
   funciona si quien tiene la sesión abierta ahora mismo es
   "superAdmin" (campo guardado en su documento de
   "admin_usuarios") — a cualquier otra persona del panel, aunque
   tenga el permiso "usuarios" marcado, este candado no le deja
   pasar. Se guarda como huella SHA-256. Para cambiarla, calcula el
   hash del texto nuevo (ver instrucciones arriba) y reemplaza
   CLAVE_ACCESO_USUARIOS_HASH. */
const CLAVE_ACCESO_USUARIOS_HASH = "95f5e4e4377dd8ede9fee4f9840c9d039a5c5bf953a2db6014c26f11a6070c04";

async function verificarAccesoTabUsuarios(clave) {
  if (!_esSuperAdminActual() || !clave) return false;
  try {
    return (await _sha256Hex(clave)) === CLAVE_ACCESO_USUARIOS_HASH;
  } catch (e) {
    return false;
  }
}

/* ---------- PERMISOS de cada usuario del panel ----------
   Cada usuario (aparte de correo/contraseña) guarda un objeto
   "permisos" en Firestore que dice qué pestañas/acciones puede
   tocar dentro del panel:
     inventario      -> ver y editar la pestaña Inventario
     pedidos         -> ver la pestaña Pedidos
     eliminarPedidos -> además de verlos, puede borrar pedidos
                        (pide también su propia contraseña al hacerlo)
     drop            -> ver y editar la pestaña Drop
     usuarios        -> ver la pestaña Usuarios (crear/gestionar
                        a otras personas del panel)
   Quien crea o edita a otro usuario elige estas casillas a mano;
   nadie se las da a sí mismo. */
const PERMISOS_DISPONIBLES = ['inventario', 'pedidos', 'eliminarPedidos', 'drop', 'usuarios'];

function permisosTodosActivos() {
  const p = {};
  PERMISOS_DISPONIBLES.forEach(k => { p[k] = true; });
  return p;
}

function permisosNingunoActivo() {
  const p = {};
  PERMISOS_DISPONIBLES.forEach(k => { p[k] = false; });
  return p;
}

/** Convierte lo que hay guardado en Firestore para un usuario en un
    objeto de permisos completo. Si el usuario es de antes de que
    existiera este sistema (no tiene el campo "permisos" guardado),
    se le da acceso total, para que nadie se quede afuera del panel
    de un día para otro por una actualización. */
function normalizarPermisos(datosUsuario) {
  if (!datosUsuario || !datosUsuario.permisos) return permisosTodosActivos();
  const p = datosUsuario.permisos;
  const out = {};
  PERMISOS_DISPONIBLES.forEach(k => { out[k] = !!p[k]; });
  return out;
}

let _adminHeartbeatTimer = null;

function _generarSesionId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Intenta iniciar sesión en el panel con una cuenta REAL de
    Firebase Auth (correo + contraseña) MÁS el código de acceso al
    panel que le asignaron (campo "codigoPanel" en su perfil de
    admin_usuarios, 6 números fijo, lo pone quien administra desde la
    pestaña "Usuarios"). Si la cuenta y la contraseña son correctas
    pero el código no coincide, no la deja entrar. Si a esa cuenta
    todavía no le han asignado ningún código (por ejemplo, el primer
    admin recién creado), se le deja pasar igual, pero conviene que
    le asignen uno cuanto antes desde "Usuarios".
    Si la cuenta es válida pero Firestore no la reconoce como admin
    (su UID no está autorizado, o no tiene perfil creado en
    "admin_usuarios" todavía), se le avisa en vez de dejarla pasar.
    Si es la PRIMERA cuenta que entra y ya está autorizada en las
    reglas pero nunca se le creó su perfil, se le crea uno con todos
    los permisos y marcada como superAdmin — para que quien acaba de
    terminar de configurar Firebase no tenga que crear su propio
    usuario a mano desde ningún lado. */
async function loginAdmin(correoInput, clave, codigoPanelInput) {
  const correo = String(correoInput || '').trim().toLowerCase();
  const codigoPanel = String(codigoPanelInput || '').trim();
  if (!correo || !clave) return { ok: false, msg: 'Escribe correo y contraseña.' };

  let cred;
  try {
    cred = await fbAuth.signInWithEmailAndPassword(correo, clave);
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
  const uid = cred.user.uid;

  let doc;
  try {
    doc = await fbDb.collection('admin_usuarios').doc(uid).get();
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    if (e && e.code === 'permission-denied') {
      return { ok: false, msg: 'Tu cuenta de Firebase es válida, pero todavía no está autorizada en las reglas de Firestore (isAdmin() en firestore.rules). Agrega tu UID ahí y publica las reglas.' };
    }
    return { ok: false, msg: 'No hay conexión a internet.' };
  }

  let datos;
  if (!doc.exists) {
    // Cuenta autorizada en las reglas pero sin perfil todavía: se
    // crea automáticamente con acceso total, para no dejar a nadie
    // sin poder entrar después de publicar las reglas por primera vez.
    datos = { correo, activo: true, creado: new Date().toISOString(), permisos: permisosTodosActivos(), superAdmin: true, codigoPanel: null };
    try {
      await fbDb.collection('admin_usuarios').doc(uid).set(datos);
    } catch (e) {
      try { await fbAuth.signOut(); } catch (_) {}
      return { ok: false, msg: 'No hay conexión a internet.' };
    }
  } else {
    datos = doc.data();
    if (datos.activo === false) {
      try { await fbAuth.signOut(); } catch (_) {}
      return { ok: false, msg: 'Este usuario fue desactivado. Habla con quien administra la tienda.' };
    }
  }

  // Código de acceso al panel: si esta cuenta ya tiene uno asignado,
  // tiene que coincidir con lo que escribió en el login. Después de
  // varios intentos seguidos con el código mal, se bloquea la cuenta
  // un rato — así, aunque alguien ya se haya robado la contraseña,
  // no puede sentarse a probar códigos uno por uno.
  if (datos.codigoPanel) {
    const ahora = Date.now();
    if (datos.codigoBloqueadoHasta && Number(datos.codigoBloqueadoHasta) > ahora) {
      try { await fbAuth.signOut(); } catch (_) {}
      const minutosFaltan = Math.ceil((Number(datos.codigoBloqueadoHasta) - ahora) / 60000);
      return { ok: false, msg: `Demasiados intentos con el código incorrecto. Espera ${minutosFaltan} minuto${minutosFaltan === 1 ? '' : 's'} y vuelve a intentar.` };
    }
    if (codigoPanel !== datos.codigoPanel) {
      const intentos = (Number(datos.codigoIntentosFallidos) || 0) + 1;
      const cambios = { codigoIntentosFallidos: intentos };
      let bloqueado = false;
      if (intentos >= CODIGO_PANEL_MAX_INTENTOS) {
        cambios.codigoIntentosFallidos = 0;
        cambios.codigoBloqueadoHasta = ahora + CODIGO_PANEL_BLOQUEO_MS;
        bloqueado = true;
      }
      try { await fbDb.collection('admin_usuarios').doc(uid).update(cambios); } catch (_) {}
      try { await fbAuth.signOut(); } catch (_) {}
      if (bloqueado) {
        return { ok: false, msg: 'Código incorrecto. Por seguridad, esta cuenta queda bloqueada 15 minutos.' };
      }
      return { ok: false, msg: `Código de acceso incorrecto (te quedan ${CODIGO_PANEL_MAX_INTENTOS - intentos} intento${CODIGO_PANEL_MAX_INTENTOS - intentos === 1 ? '' : 's'}).` };
    }
    // código correcto: si quedaba algún intento fallido anotado, se limpia
    if (datos.codigoIntentosFallidos || datos.codigoBloqueadoHasta) {
      try {
        await fbDb.collection('admin_usuarios').doc(uid).update({
          codigoIntentosFallidos: 0,
          codigoBloqueadoHasta: firebase.firestore.FieldValue.delete(),
        });
      } catch (_) {}
    }
  }

  // ¿ya hay una sesión viva con esta cuenta en otro lado?
  try {
    const sesionDoc = await fbDb.collection('admin_sesiones').doc(uid).get();
    if (sesionDoc.exists) {
      const s = sesionDoc.data();
      const vive = s.ultimoLatido && (Date.now() - s.ultimoLatido) < ADMIN_SESION_VENCE_MS;
      if (vive) {
        try { await fbAuth.signOut(); } catch (_) {}
        return { ok: false, msg: 'Esta cuenta ya está siendo usada ahora mismo en otro dispositivo o pestaña. Pide que te creen tu propia cuenta, o espera a que la otra persona cierre sesión.' };
      }
    }
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    return { ok: false, msg: 'No hay conexión a internet.' };
  }

  const sesionId = _generarSesionId();
  try {
    await fbDb.collection('admin_sesiones').doc(uid).set({
      sesionId,
      ultimoLatido: Date.now(),
      dispositivo: (navigator.userAgent || '').slice(0, 120),
      desde: new Date().toISOString(),
    });
  } catch (e) {
    try { await fbAuth.signOut(); } catch (_) {}
    return { ok: false, msg: 'No hay conexión a internet.' };
  }

  _guardar(LS_KEYS.sesionAdmin, { uid, correo: datos.correo || correo, superAdmin: !!datos.superAdmin, sesionId, fecha: Date.now() });
  _iniciarLatidoAdmin(uid, sesionId);
  return { ok: true, sinCodigoAsignado: !datos.codigoPanel };
}

/** Chequeo rápido y local (para que la pantalla no parpadee
    mientras se confirma con Firestore). La confirmación real de que
    la sesión sigue siendo válida pasa en verificarSesionAdmin(). */
function sesionAdminActiva() {
  try {
    return !!JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.sesionId;
  } catch (e) {
    return false;
  }
}

/** UID de quien tiene la sesión del panel abierta ahora mismo (o
    null). Se usa como identificador interno; para mostrar en
    pantalla usa correoAdminActual(). */
function usuarioAdminActual() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.uid || null;
  } catch (e) {
    return null;
  }
}

/** Correo de quien tiene la sesión del panel abierta ahora mismo
    (para mostrarlo en pantalla, ej. "Conectado como: ..."). */
function correoAdminActual() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.correo || '';
  } catch (e) {
    return '';
  }
}

/** true si quien tiene la sesión abierta ahora mismo quedó
    marcado como superAdmin (solo esa persona puede entrar a la
    pestaña "Usuarios", igual que antes pasaba con el usuario fijo
    "admin"). */
function _esSuperAdminActual() {
  try {
    return !!JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin))?.superAdmin;
  } catch (e) {
    return false;
  }
}

/** Confirma contra Firestore que el "sesionId" guardado en este
    navegador sigue siendo el dueño del candado (que nadie más lo
    tomó) y reactiva el latido. Se usa al abrir admin.html. También
    exige que siga habiendo una sesión real de Firebase Auth
    (fbAuth.currentUser); si Firebase cerró la sesión sola (por
    ejemplo, token vencido), no deja pasar solo con lo que quedó
    guardado en este navegador. */
async function verificarSesionAdmin() {
  let local;
  try { local = JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin) || 'null'); } catch (e) { local = null; }
  if (!local || !local.sesionId || !local.uid) return false;

  // Espera un instante a que Firebase confirme si hay sesión de Auth.
  const user = await new Promise((resolve) => {
    const unsub = fbAuth.onAuthStateChanged((u) => { unsub(); resolve(u); });
  });
  if (!user || user.uid !== local.uid) {
    localStorage.removeItem(LS_KEYS.sesionAdmin);
    return false;
  }

  try {
    const sesionDoc = await fbDb.collection('admin_sesiones').doc(local.uid).get();
    if (!sesionDoc.exists || sesionDoc.data().sesionId !== local.sesionId) {
      localStorage.removeItem(LS_KEYS.sesionAdmin);
      return false;
    }
  } catch (e) {
    // sin internet en este momento: deja pasar con lo que ya había
    // guardado localmente, para no botar a alguien solo por un
    // corte de wifi pasajero.
  }
  _iniciarLatidoAdmin(local.uid, local.sesionId);
  return true;
}

function _iniciarLatidoAdmin(uid, sesionId) {
  _detenerLatidoAdmin();
  _adminHeartbeatTimer = setInterval(async () => {
    try {
      await fbDb.collection('admin_sesiones').doc(uid).set(
        { sesionId, ultimoLatido: Date.now() }, { merge: true }
      );
    } catch (e) { /* sin internet: se intenta de nuevo en el próximo latido */ }
  }, ADMIN_LATIDO_MS);
}
function _detenerLatidoAdmin() {
  if (_adminHeartbeatTimer) clearInterval(_adminHeartbeatTimer);
  _adminHeartbeatTimer = null;
}

/** Cierra sesión (Firebase Auth + candado de Firestore), para que
    esa cuenta pueda volver a entrar desde este u otro navegador. */
async function cerrarSesionAdmin() {
  let local;
  try { local = JSON.parse(localStorage.getItem(LS_KEYS.sesionAdmin) || 'null'); } catch (e) { local = null; }
  _detenerLatidoAdmin();
  localStorage.removeItem(LS_KEYS.sesionAdmin);
  if (local && local.uid) {
    try {
      const sesionDoc = await fbDb.collection('admin_sesiones').doc(local.uid).get();
      if (sesionDoc.exists && sesionDoc.data().sesionId === local.sesionId) {
        await fbDb.collection('admin_sesiones').doc(local.uid).delete();
      }
    } catch (e) { /* no pasa nada si falla: el candado igual se libera solo al vencerse */ }
  }
  try { await fbAuth.signOut(); } catch (e) { /* no pasa nada */ }
}

/** Cambia la contraseña de la cuenta de Firebase Auth que tiene la
    sesión abierta ahora mismo. Como Firebase exige haber iniciado
    sesión "recientemente" para cambios sensibles como este, primero
    se vuelve a confirmar la contraseña actual (reautenticación). */
async function cambiarClaveAdmin(actual, nueva) {
  const user = fbAuth.currentUser;
  if (!user) return { ok: false, msg: 'Tu sesión ya no es válida, vuelve a entrar.' };
  if (!nueva || nueva.length < 6) return { ok: false, msg: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, actual);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nueva);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: traducirErrorFirebase(e) };
  }
}

/** Trae los permisos del usuario que tiene la sesión abierta ahora
    mismo, para saber qué pestañas mostrarle y qué botones dejarle
    usar. Si no hay internet en ese instante, se le da acceso total
    (no se le puede pedir a Firestore, así que mejor no dejarlo
    varado sin poder ver nada). */
async function obtenerPermisosUsuarioActual() {
  const uid = usuarioAdminActual();
  if (!uid) return permisosTodosActivos();
  try {
    const doc = await fbDb.collection('admin_usuarios').doc(uid).get();
    return normalizarPermisos(doc.exists ? doc.data() : null);
  } catch (e) {
    return permisosTodosActivos();
  }
}

/** Confirma que "clave" es la contraseña ACTUAL de la cuenta de
    Firebase Auth con la sesión abierta ahora mismo (no el código de
    desarrollador). Se usa para acciones sensibles y puntuales, como
    borrar un pedido. */
async function verificarClaveAdminActual(clave) {
  const user = fbAuth.currentUser;
  if (!user || !clave) return false;
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, clave);
    await user.reauthenticateWithCredential(cred);
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- GESTIÓN DE USUARIOS DEL PANEL (pestaña "Usuarios") ----------
   Un usuario nuevo lo crea alguien que YA tiene acceso al panel,
   pegando el UID y correo que sacó de Firebase Authentication ->
   Users (ver el aviso al principio de este archivo). Este perfil
   solo guarda permisos/estado; el acceso real a Firestore lo sigue
   dando exclusivamente la lista isAdmin() de firestore.rules. */
async function obtenerUsuariosAdminPanel() {
  try {
    const [usuariosSnap, sesionesSnap] = await Promise.all([
      fbDb.collection('admin_usuarios').orderBy('creado').get(),
      fbDb.collection('admin_sesiones').get(),
    ]);
    const sesiones = {};
    sesionesSnap.docs.forEach(d => { sesiones[d.id] = d.data(); });
    return usuariosSnap.docs.map(d => {
      const s = sesiones[d.id];
      const conectado = !!(s && s.ultimoLatido && (Date.now() - s.ultimoLatido) < ADMIN_SESION_VENCE_MS);
      return { usuario: d.id, ...d.data(), conectado };
    });
  } catch (e) {
    console.error('Error leyendo usuarios del panel:', e);
    return [];
  }
}

/** Agrega/quita un UID de la lista admin_config/admins (la lista
    "de verdad" que lee isAdmin() en firestore.rules). Esto es lo
    que reemplaza tener que editar firestore.rules a mano cada vez
    que entra o sale alguien del equipo. */
async function _agregarUidAListaAdmins(uid) {
  await fbDb.collection('admin_config').doc('admins').set(
    { uids: firebase.firestore.FieldValue.arrayUnion(uid) },
    { merge: true }
  );
}
async function _quitarUidDeListaAdmins(uid) {
  await fbDb.collection('admin_config').doc('admins').set(
    { uids: firebase.firestore.FieldValue.arrayRemove(uid) },
    { merge: true }
  );
}

async function crearUsuarioAdminPanel(uidInput, correoInput, permisos, codigoPanelInput) {
  const uid = String(uidInput || '').trim();
  const correo = String(correoInput || '').trim().toLowerCase();
  const codigoPanel = String(codigoPanelInput || '').trim();
  if (!/^[A-Za-z0-9]{15,40}$/.test(uid)) {
    return { ok: false, msg: 'Ese UID no parece válido. Cópialo tal cual desde Firebase Authentication → Users (columna "User UID").' };
  }
  if (!correo || !correo.includes('@')) return { ok: false, msg: 'Escribe el correo con el que esa persona inició su cuenta de Firebase.' };
  if (!/^[0-9]{6}$/.test(codigoPanel)) {
    return { ok: false, msg: 'El código de acceso al panel debe tener exactamente 6 números.' };
  }
  try {
    const existe = await fbDb.collection('admin_usuarios').doc(uid).get();
    if (existe.exists) return { ok: false, msg: 'Ya existe un perfil del panel con ese UID.' };
    await fbDb.collection('admin_usuarios').doc(uid).set({
      correo, activo: true, creado: new Date().toISOString(),
      permisos: permisos || permisosNingunoActivo(),
      codigoPanel,
    });
    // Le da acceso real a Firestore sin tocar firestore.rules.
    await _agregarUidAListaAdmins(uid);
    // Guarda el código también por correo, para que "olvidé mi
    // código" pueda encontrarlo sin necesitar el UID.
    await fbDb.collection('panel_codigos').doc(correo).set({ codigo: codigoPanel, uid });
    return { ok: true };
  } catch (e) {
    if (e && e.code === 'permission-denied') {
      return { ok: false, msg: 'Firestore rechazó esto. Revisa que tu propio UID esté autorizado (isAdmin() en firestore.rules, ya publicada).' };
    }
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** Cambia las casillas de qué puede hacer un usuario en el panel. */
async function actualizarPermisosUsuarioAdminPanel(uid, permisos) {
  try {
    await fbDb.collection('admin_usuarios').doc(uid).update({ permisos });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** Cambia el código de acceso al panel de un usuario (el que
    loginAdmin() le pide además de correo+contraseña). Actualiza su
    perfil (admin_usuarios) y el documento por correo (panel_codigos)
    que usa la recuperación por correo, para que ambos queden en el
    mismo valor. */
async function cambiarCodigoPanelUsuario(uid, correoInput, nuevoCodigo) {
  const correo = String(correoInput || '').trim().toLowerCase();
  const codigo = String(nuevoCodigo || '').trim();
  if (!/^[0-9]{6}$/.test(codigo)) {
    return { ok: false, msg: 'El código debe tener exactamente 6 números.' };
  }
  try {
    await fbDb.collection('admin_usuarios').doc(uid).update({ codigoPanel: codigo });
    if (correo) await fbDb.collection('panel_codigos').doc(correo).set({ codigo, uid });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

async function cambiarEstadoUsuarioAdminPanel(uid, activo) {
  try {
    await fbDb.collection('admin_usuarios').doc(uid).update({ activo });
    // Desactivar ahora también le quita el acceso real a Firestore
    // (antes solo le bloqueaba volver a iniciar sesión, pero si ya
    // tenía una pestaña abierta seguía pudiendo escribir). Reactivar
    // se lo devuelve.
    if (activo) await _agregarUidAListaAdmins(uid);
    else await _quitarUidDeListaAdmins(uid);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

async function eliminarUsuarioAdminPanel(uid, correoInput) {
  try {
    await fbDb.collection('admin_usuarios').doc(uid).delete();
    await fbDb.collection('admin_sesiones').doc(uid).delete().catch(() => {});
    await _quitarUidDeListaAdmins(uid).catch(() => {});
    const correo = String(correoInput || '').trim().toLowerCase();
    if (correo && correo.includes('@')) {
      await fbDb.collection('panel_codigos').doc(correo).delete().catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'No hay conexión a internet.' };
  }
}

/** "Olvidé mi código de acceso al panel": busca, sabiendo solo el
    correo, el código guardado en "panel_codigos" y lo manda a ese
    mismo correo a través del Apps Script que ya usas para el correo
    de confirmación de pedidos (ver GUIA_CODIGO_PANEL_CORREO.txt para
    agregar ese envío ahí). Nunca muestra el código en pantalla, y
    siempre devuelve el mismo mensaje exista o no ese correo en el
    panel, para no delatar qué correos sí tienen acceso. */
async function recuperarCodigoPanelPorCorreo(correoInput) {
  const correo = String(correoInput || '').trim().toLowerCase();
  const msgGenerico = 'Si ese correo tiene una cuenta en el panel, en unos minutos le llega un correo con su código.';
  if (!correo || !correo.includes('@')) return { ok: false, msg: 'Escribe un correo válido.' };
  try {
    const doc = await fbDb.collection('panel_codigos').doc(correo).get();
    if (doc.exists && doc.data() && doc.data().codigo) {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ tipo: 'codigo_panel_recuperacion', correo, codigo: doc.data().codigo }),
      }).catch(() => {});
    }
  } catch (e) {
    // No se revela nada aunque falle la búsqueda: mismo mensaje.
  }
  return { ok: true, msg: msgGenerico };
}

/** "Olvidé mi contraseña" del panel: usa el mismo sistema de Firebase
    Auth que ya usan los clientes en login.html (un enlace real que
    Firebase manda directo al correo de esa cuenta, para poner una
    contraseña nueva — nada de esto pasa por tu Apps Script). Siempre
    devuelve el mismo mensaje exista o no esa cuenta, para no delatar
    qué correos sí tienen acceso al panel. */
async function recuperarClavePanel(correoInput) {
  const correo = String(correoInput || '').trim().toLowerCase();
  const msgGenerico = 'Si ese correo tiene una cuenta, en unos minutos le llega un enlace de Firebase para poner una contraseña nueva.';
  if (!correo || !correo.includes('@')) return { ok: false, msg: 'Escribe un correo válido.' };
  try {
    await fbAuth.sendPasswordResetEmail(correo);
  } catch (e) {
    // No se revela nada aunque la cuenta no exista: mismo mensaje.
  }
  return { ok: true, msg: msgGenerico };
}

/* ============================================================
   MOSTRAR/OCULTAR CONTRASEÑA (el "ojito")
   ------------------------------------------------------------
   Se aplica solo con CSS/JS a CUALQUIER <input type="password">
   de cualquier página (login, registro, panel admin), así que no
   hay que tocar cada formulario a mano.
   ============================================================ */
function _activarOjitos() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.ojitoListo) return;
    input.dataset.ojitoListo = '1';
    const wrap = document.createElement('span');
    wrap.className = 'campo-clave';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pass-toggle';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Mostrar contraseña');
    btn.textContent = '👁️';
    wrap.appendChild(btn);
    btn.addEventListener('click', () => {
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      btn.textContent = mostrar ? '🙈' : '👁️';
      btn.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    });
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _activarOjitos);
} else {
  _activarOjitos();
}
