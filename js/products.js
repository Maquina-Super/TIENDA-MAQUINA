/* ============================================================
   CATÁLOGO DE PRODUCTOS
   Esto reemplaza a la tabla "productos" de la base de datos.
   Para agregar, quitar o editar un producto, edita este arreglo.

   colores: lista de códigos HEX
   tallas : lista de tallas disponibles
   icono  : hoodie | tee | cap | pants | jacket | shorts
   badge  : "nuevo" | "pocas" | "vendido" | null
   foto   : foto general del producto (opcional)
   fotos  : foto específica por color, ej: { "#151512": "img/negra.jpg" }
            se sube desde admin.html, columna "Fotos por color".
            Si el cliente hace clic en un color que tiene foto propia,
            la imagen del producto cambia a esa foto.
   ============================================================ */

const PRODUCTS = [
  { id: 1, nombre: "Buso Volt",        categoria: "Busos",       genero: ["hombre","mujer"], precio: 189900, precio_anterior: 229900, icono: "hoodie", colores: ["#dfe8da", "#151512", "#e7d9ee"], tallas: ["S","M","L","XL"],    badge: "pocas",  stock: 6,  activo: true },
  { id: 2, nombre: "Buso Static",      categoria: "Busos",       genero: ["hombre","mujer"], precio: 179900, precio_anterior: null,   icono: "hoodie", colores: ["#151512", "#faf9f5", "#eceae3"], tallas: ["S","M","L","XL"],    badge: "nuevo",  stock: 20, activo: true },
  { id: 3, nombre: "Buso Amp",         categoria: "Busos",       genero: ["hombre","mujer"], precio: 194900, precio_anterior: null,   icono: "hoodie", colores: ["#e7d9ee", "#151512"],             tallas: ["S","M","L","XL"],    badge: null,     stock: 10, activo: true },
  { id: 4, nombre: "Camiseta Bolt",    categoria: "Camisetas",   genero: ["hombre","mujer"], precio: 79900,  precio_anterior: null,   icono: "tee",    colores: ["#faf9f5", "#151512", "#f3e0da"], tallas: ["S","M","L","XL"],    badge: "nuevo",  stock: 30, activo: true },
  { id: 5, nombre: "Gorra Static",     categoria: "Gorras",      genero: ["hombre","mujer"], precio: 69900,  precio_anterior: null,   icono: "cap",    colores: ["#151512", "#e7d9ee"],             tallas: ["Única"],              badge: null,     stock: 25, activo: true },
  { id: 6, nombre: "Cargo Circuit",    categoria: "Pantalones",  genero: ["hombre"],         precio: 159900, precio_anterior: null,   icono: "pants",  colores: ["#151512", "#eceae3"],             tallas: ["28","30","32","34"], badge: "pocas",  stock: 6,  activo: true },
  { id: 7, nombre: "Chaqueta Voltage", categoria: "Chaquetas",   genero: ["hombre","mujer"], precio: 249900, precio_anterior: 299900, icono: "jacket", colores: ["#151512", "#dfe8da"],             tallas: ["S","M","L","XL"],    badge: "pocas",  stock: 5,  activo: true },
  { id: 8, nombre: "Shorts Drip",      categoria: "Shorts",      genero: ["hombre","mujer"], precio: 99900,  precio_anterior: null,   icono: "shorts", colores: ["#151512", "#f5ecd6"],             tallas: ["S","M","L","XL"],    badge: null,     stock: 18, activo: true },
];

/** Bajo qué "sección" del menú (Ropa / Accesorios) cae cada categoría.
    Se usa para armar el menú desplegable de Hombre/Mujer/Niño/Niña,
    tipo el de las tiendas grandes: cada género tiene sus columnas de
    Ropa y Accesorios con las categorías que sí tienen productos. */
const GRUPOS_CATEGORIA = {
  "Ropa": ["Busos", "Camisetas", "Pantalones", "Chaquetas", "Shorts"],
  "Accesorios": ["Gorras"],
};

/** Los 4 géneros que aparecen en el menú de arriba del sitio. */
const GENEROS_MENU = [
  { id: "hombre", etiqueta: "Hombre" },
  { id: "mujer",  etiqueta: "Mujer" },
  { id: "nino",   etiqueta: "Niño" },
  { id: "nina",   etiqueta: "Niña" },
];

/** Productos activos que pertenecen a un género dado ("hombre", "mujer", "nino", "nina") */
function productosPorGenero(genero) {
  return productosActivos().filter(p => Array.isArray(p.genero) && p.genero.includes(genero));
}

/** Arma, para un género dado, qué categorías tiene en cada grupo
    (Ropa / Accesorios), listas para pintar el menú desplegable.
    Devuelve algo como: [{ grupo: "Ropa", categorias: ["Busos","Camisetas"] }, ...]
    Solo incluye grupos que sí tienen al menos una categoría con productos. */
function categoriasPorGeneroAgrupadas(genero) {
  const cats = new Set(productosPorGenero(genero).map(p => p.categoria));
  return Object.keys(GRUPOS_CATEGORIA)
    .map(grupo => ({ grupo, categorias: GRUPOS_CATEGORIA[grupo].filter(c => cats.has(c)) }))
    .filter(g => g.categorias.length > 0);
}

/** Devuelve solo los productos activos, leyendo el catálogo editable
    (maquina_catalogo en localStorage) que el admin puede modificar
    desde admin.html. Si por algún motivo esa función no existe
    todavía, cae de vuelta al catálogo de fábrica PRODUCTS. */
function productosActivos() {
  const lista = typeof getCatalogo === 'function' ? getCatalogo() : PRODUCTS;
  return lista.filter(p => p.activo);
}

/** Busca un producto por id (los ids vienen como string desde el DOM, por eso == ) */
function buscarProducto(id) {
  const lista = typeof getCatalogo === 'function' ? getCatalogo() : PRODUCTS;
  return lista.find(p => p.id == id) || null;
}

/** Lista de categorías presentes en el catálogo, ordenadas alfabéticamente */
function categoriasDisponibles() {
  const set = new Set(productosActivos().map(p => p.categoria));
  return Array.from(set).sort();
}

/* ============================================================
   ZONAS DE ENVÍO
   Costo de envío según dónde queda el municipio/zona del
   cliente. Para agregar o editar zonas, edita este arreglo.
   ============================================================ */
const ZONAS_ENVIO = [
  { id: "medellin",     nombre: "Medellín (zona urbana)",                    costo: 8000  },
  { id: "metro",        nombre: "Área metropolitana (Bello, Itagüí, Envigado, Sabaneta, La Estrella, Copacabana)", costo: 10000 },
  { id: "oriente",      nombre: "Oriente antioqueño (Rionegro, Marinilla, La Ceja, El Retiro)",  costo: 15000 },
  { id: "otro_antioquia", nombre: "Otro municipio de Antioquia",             costo: 18000 },
  { id: "vereda",       nombre: "Vereda / zona rural",                       costo: 20000 },
  { id: "otra_ciudad",  nombre: "Otra ciudad de Colombia",                   costo: 25000 },
];

/** Devuelve la lista completa de zonas de envío disponibles */
function zonasEnvio() {
  return ZONAS_ENVIO;
}

/* ============================================================
   MUNICIPIOS DE ANTIOQUIA (los 125) -> zona de envío
   Sirve para el buscador "ciudad o municipio" del carrito: el
   cliente escribe su municipio y el sistema ya sabe qué zona
   (y qué costo de envío) le corresponde.
   Para cambiar el costo de un municipio, muévelo de lista:
   cada lista apunta a una zona de ZONAS_ENVIO de arriba.
   ============================================================ */
const _MUNICIPIOS_METRO   = ["Bello", "Itagüí", "Envigado", "Sabaneta", "La Estrella", "Copacabana"];
const _MUNICIPIOS_ORIENTE = ["Rionegro", "Marinilla", "La Ceja", "El Retiro"];
const _MUNICIPIOS_ANTIOQUIA = [
  "Abejorral", "Abriaquí", "Alejandría", "Amagá", "Amalfi", "Andes", "Angelópolis", "Angostura", "Anorí", "Anzá",
  "Apartadó", "Arboletes", "Argelia", "Armenia", "Barbosa", "Bello", "Belmira", "Betania", "Betulia", "Briceño",
  "Buriticá", "Cáceres", "Caicedo", "Caldas", "Campamento", "Cañasgordas", "Caracolí", "Caramanta", "Carepa",
  "Carolina del Príncipe", "Caucasia", "Chigorodó", "Cisneros", "Ciudad Bolívar", "Cocorná", "Concepción",
  "Concordia", "Copacabana", "Dabeiba", "Donmatías", "Ebéjico", "El Bagre", "El Carmen de Viboral", "El Peñol",
  "El Retiro", "El Santuario", "Entrerríos", "Envigado", "Fredonia", "Frontino", "Giraldo", "Girardota",
  "Gómez Plata", "Granada", "Guadalupe", "Guarne", "Guatapé", "Heliconia", "Hispania", "Itagüí", "Ituango",
  "Jardín", "Jericó", "La Ceja", "La Estrella", "La Pintada", "La Unión", "Liborina", "Maceo", "Marinilla",
  "Medellín", "Montebello", "Murindó", "Mutatá", "Nariño", "Nechí", "Necoclí", "Olaya", "Peque", "Pueblorrico",
  "Puerto Berrío", "Puerto Nare", "Puerto Triunfo", "Remedios", "Rionegro", "Sabanalarga", "Sabaneta", "Salgar",
  "San Andrés de Cuerquia", "San Carlos", "San Francisco", "San Jerónimo", "San José de la Montaña",
  "San Juan de Urabá", "San Luis", "San Pedro de los Milagros", "San Pedro de Urabá", "San Rafael", "San Roque",
  "San Vicente Ferrer", "Santa Bárbara", "Santa Fe de Antioquia", "Santa Rosa de Osos", "Santo Domingo",
  "Segovia", "Sonsón", "Sopetrán", "Támesis", "Tarazá", "Tarso", "Titiribí", "Toledo", "Turbo", "Uramita",
  "Urrao", "Valdivia", "Valparaíso", "Vegachí", "Venecia", "Vigía del Fuerte", "Yalí", "Yarumal", "Yolombó",
  "Yondó", "Zaragoza",
];

/** Devuelve los municipios de Antioquia como [{ nombre, zona, costo }] */
function municipiosAntioquia() {
  return _MUNICIPIOS_ANTIOQUIA.map(nombre => {
    let zona = "otro_antioquia";
    if (nombre === "Medellín") zona = "medellin";
    else if (_MUNICIPIOS_METRO.includes(nombre)) zona = "metro";
    else if (_MUNICIPIOS_ORIENTE.includes(nombre)) zona = "oriente";
    return { nombre, zona, costo: costoEnvio(zona) };
  });
}

/** Devuelve el costo de envío de una zona por su id (0 si no existe) */
function costoEnvio(zonaId) {
  const zona = ZONAS_ENVIO.find(z => z.id === zonaId);
  return zona ? zona.costo : 0;
}
