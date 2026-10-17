/* PRUEBA SEGURA de la integración con la hoja de cálculo.
   Carga el Apps Script REAL (APPS_SCRIPT_pegar_en_script.google.com.txt) en un
   simulador en memoria: hoja, correo y Firestore FALSOS. No usa red ni credenciales
   y no toca ningún dato real.   Uso:  node tests-hoja/test-hoja-simulada.js        */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const codigoGs = fs.readFileSync(path.join(__dirname, '..', 'SCRIPT_COMPLETO_MAQUINA.gs.txt'), 'utf8');

/* Codifica un valor como lo hace la API REST de Firestore. */
function aFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aFs) } };
  const f = {}; Object.keys(v).forEach(k => { f[k] = aFs(v[k]); }); return { mapValue: { fields: f } };
}

function crearEntorno(filasIniciales, encabezados) {
  const hojas = {};
  function Hoja(nombre, grid) {
    const h = { nombre, grid, frozen: 0 };
    const asegura = (r, c) => { while (h.grid.length < r) h.grid.push([]); for (let i = 0; i < r; i++) while (h.grid[i].length < c) h.grid[i].push(''); };
    h.getLastRow = () => { let u = 0; h.grid.forEach((f, i) => { if (f.some(v => v !== '' && v != null)) u = i + 1; }); return u; };
    h.getLastColumn = () => { let u = 0; h.grid.forEach(f => f.forEach((v, j) => { if (v !== '' && v != null) u = Math.max(u, j + 1); })); return u; };
    h.maxCols = 26; h.getMaxColumns = () => h.maxCols; h.insertColumnAfter = () => { h.maxCols++; };
    h.getMaxRows = () => 1000;
    h.setFrozenRows = n => { h.frozen = n; };
    h.appendRow = fila => { const r = h.getLastRow() + 1; asegura(r, fila.length); fila.forEach((v, j) => h.grid[r - 1][j] = v); };
    h.deleteRow = r => { h.grid.splice(r - 1, 1); };
    h.getRange = (r, c, nr = 1, nc = 1) => { const rango = {
      getDisplayValues: () => { asegura(r + nr - 1, c + nc - 1); return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = h.grid[r - 1 + i][c - 1 + j]; return v instanceof Date ? v.toISOString() : String(v == null ? '' : v); })); },
      getValues: () => { asegura(r + nr - 1, c + nc - 1); return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => h.grid[r - 1 + i][c - 1 + j])); },
      setValues: vals => { asegura(r + vals.length - 1, c + vals[0].length - 1); vals.forEach((f, i) => f.forEach((v, j) => h.grid[r - 1 + i][c - 1 + j] = v)); },
      setValue: v => { asegura(r, c); h.grid[r - 1][c - 1] = v; },
      setNumberFormat: () => rango, setFontWeight: () => rango, getFontWeight: () => 'bold',
    }; ['setValues', 'setValue'].forEach(k => { const f = rango[k]; rango[k] = (...a) => { f(...a); return rango; }; }); return rango; };
    hojas[nombre] = h; return h;
  }
  const grid = [encabezados].concat(filasIniciales).map(f => f.slice());
  Hoja('Pedidos', grid);
  const correos = []; const firestore = {}; const fetchs = []; const cache = {}; let cuota = 100;
  const voltageClub = ['cliente1@x.com', 'cliente2@x.com', 'a@b.com,victima@x.com', 'no-es-correo']; // las dos últimas son basura
  const panelCodigos = { 'admin@tienda.com': '123456' };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => hojas[n] || null, insertSheet: n => Hoja(n, []) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: o => { correos.push(o); cuota -= 1 + (o.bcc ? String(o.bcc).split(',').length : 0); }, getRemainingDailyQuota: () => cuota },
    ContentService: { createTextOutput: t => ({ t }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@test.com' }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    Utilities: { base64EncodeWebSafe: t => Buffer.from(String(t)).toString('base64url') },
    UrlFetchApp: { fetch: (url, opc) => {
      fetchs.push(url);
      const resp = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj || {}) });
      const token = opc && opc.headers && opc.headers.Authorization && opc.headers.Authorization.replace('Bearer ', '');
      const rutaDoc = url.split('/documents/')[1];
      // --- reglas falsas: solo el token ADMIN_TOKEN es admin (list de pedidos / voltage_club)
      if (/^pedidos\?/.test(rutaDoc) || /^voltage_club\?/.test(rutaDoc)) {
        if (!token) return resp(403); if (token !== ADMIN_TOKEN) return resp(403);
        if (/^voltage_club/.test(rutaDoc)) {
          const docs = voltageClub.map(c => ({ fields: { correo: { stringValue: c } } }));
          return resp(200, { documents: docs });
        }
        return resp(200, {});
      }
      if (/^panel_codigos\//.test(rutaDoc)) {                       // get abierto, como en las reglas reales
        const d = panelCodigos[decodeURIComponent(rutaDoc.split('/')[1])];
        return d === undefined ? resp(404) : resp(200, { fields: { codigo: { stringValue: d } } });
      }
      const id = decodeURIComponent(url.split('/pedidos/')[1]);
      const d = firestore[id];
      if (d === 'ERROR500') return { getResponseCode: () => 500, getContentText: () => '' };
      if (!d) return { getResponseCode: () => 404, getContentText: () => '' };
      const campos = {}; Object.keys(d).forEach(k => { campos[k] = aFs(d[k]); });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ fields: campos }) };
    } },
  };
  vm.createContext(ctx); vm.runInContext(codigoGs, ctx);
  // Simula a la tienda legítima: primero crea el pedido en Firestore y DESPUÉS manda el aviso.
  // Con obj.__falso = true no se crea nada en Firestore (aviso inventado).
  const post = obj => {
    if (obj && obj.tipo === 'pedido_nuevo' && obj.pedido && !obj.__falso && !firestore[obj.pedido.id]) {
      const doc = JSON.parse(JSON.stringify(obj.pedido)); delete doc.id; delete doc.codigo_pedido; firestore[obj.pedido.id] = doc;
    }
    return vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(obj) } }).t;
  };
  return { ctx, hojas, correos, firestore, fetchs, post, voltageClub, panelCodigos, cache, setCuota: v => { cuota = v; }, getCuota: () => cuota };
}

const ADMIN_TOKEN = 'aaaa.bbbb.cccc'; const TOKEN_CLIENTE = 'xxxx.yyyy.zzzz';
const ENC = ['N° Pedido', 'Fecha', 'Cliente', 'Correo', 'Teléfono', 'Productos', 'Municipio', 'Dirección', 'Método', 'Subtotal', 'Envío', 'Total', 'Estado de pago', 'Notas internas'];
const hist = (cod, total, nota) => [cod, new Date('2026-01-05'), 'Cliente ' + cod, cod + '@x.com', '3001112233', 'Hoodie (M)', 'Medellín', 'Calle 1', 'Nequi', total - 8000, 8000, total, 'Pagado', nota];
const ID = c => ('ABCDEFGHIJKLMN' + c).slice(-20);            // id de 20 caracteres que termina en el código de 6
const pedidoNuevo = (c, total = 130000) => ({ tipo: 'pedido_nuevo', pedido: { id: ID(c), codigo_pedido: c, fecha: '2026-10-11T10:00:00Z', nombre_cliente: 'Nuevo', email_cliente: 'n@x.com', telefono_cliente: '3000000000', detalle: 'Gorra (U)', envio_municipio: 'Bello', envio_direccion: 'Cra 2 #3-4', metodo_pago: 'contraentrega', subtotal: total - 10000, costo_envio: 10000, total, estado: 'pendiente', estado_pago: 'pendiente', items: [] } });

let ok = 0; const t = (nombre, fn) => { try { fn(); ok++; console.log('  ✓ ' + nombre); } catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); process.exitCode = 1; } };
const copia = g => JSON.parse(JSON.stringify(g));
const celdasDistintas = (a, b) => { const d = []; for (let i = 0; i < Math.max(a.length, b.length); i++) for (let j = 0; j < Math.max((a[i] || []).length, (b[i] || []).length); j++) if (JSON.stringify((a[i] || [])[j] ?? '') !== JSON.stringify((b[i] || [])[j] ?? '')) d.push([i + 1, j + 1]); return d; };

console.log('\n1) Pedidos nuevos y anteriores');
const E = crearEntorno([hist('AAA111', 150000, 'VIP'), hist('BBB222', 90000, ''), hist('CCC333', 210000, 'revisar')], ENC);
const P = E.hojas.Pedidos;
const antes = copia(P.grid);
t('un pedido nuevo agrega UNA fila al final y manda UN correo', () => {
  // la tienda crea el pedido completo en Firestore y luego avisa (lo simula E.post)
  assert.strictEqual(E.post(pedidoNuevo('NEW001')), 'ok');
  assert.strictEqual(P.getLastRow(), 5); assert.strictEqual(E.correos.length, 1); assert.strictEqual(P.grid[4][0], 'NEW001');
});
t('las filas históricas (A–M y la columna ajena N) quedan idénticas', () => {
  const d = celdasDistintas(antes, P.grid).filter(([r]) => r <= 4);
  assert.deepStrictEqual(d, [[1, 15]], 'solo debe cambiar el encabezado nuevo en O1; cambió: ' + JSON.stringify(d));
});
t('la columna de estado se crea DESPUÉS de la última usada (O), sin pisar "Notas internas" (N)', () => {
  assert.strictEqual(P.grid[0][13], 'Notas internas'); assert.strictEqual(P.grid[0][14], 'Estado del pedido');
  assert.strictEqual(P.grid[3][13], 'revisar'); assert.strictEqual(P.grid[4][14], 'Pendiente');
});
t('reenviar el MISMO pedido (reintento) no duplica fila ni correo', () => {
  E.post(pedidoNuevo('NEW001')); E.post(pedidoNuevo('NEW001'));
  assert.strictEqual(P.getLastRow(), 5); assert.strictEqual(E.correos.length, 1);
});

console.log('\n2) Cambio de estado');
t('cambiar el estado escribe SOLO una celda; totales y datos no cambian', () => {
  const previo = copia(P.grid);
  E.firestore[ID('BBB222')] = { estado: 'enviado' };
  E.post({ tipo: 'pedido_estado', id: ID('BBB222') });
  const d = celdasDistintas(previo, P.grid);
  assert.deepStrictEqual(d, [[3, 15]]); assert.strictEqual(P.grid[2][14], 'Enviado');
  assert.strictEqual(P.getLastRow(), 5); assert.strictEqual(P.grid[2][11], 90000);
});
t('repetir el aviso (doble clic / reintento) no cambia nada más ni crea filas', () => {
  const previo = copia(P.grid);
  E.post({ tipo: 'pedido_estado', id: ID('BBB222') }); E.post({ tipo: 'pedido_estado', id: ID('BBB222') });
  assert.deepStrictEqual(celdasDistintas(previo, P.grid), []); assert.strictEqual(P.getLastRow(), 5);
});
t('el estado FALSEADO en el aviso se ignora: manda el de Firestore', () => {
  E.firestore[ID('CCC333')] = { estado: 'confirmado' };
  E.post({ tipo: 'pedido_estado', id: ID('CCC333'), estado: 'entregado', usuario: 'hacker' });
  assert.strictEqual(P.grid[3][14], 'Listo');
});
t('avisos desordenados: queda siempre el estado real final', () => {
  E.firestore[ID('CCC333')] = { estado: 'cancelado' };
  E.post({ tipo: 'pedido_estado', id: ID('CCC333'), estado: 'confirmado' });   // llega "viejo", pero se lee el real
  assert.strictEqual(P.grid[3][14], 'Cancelado');
});
t('pedido antiguo sin campo "estado" en Firestore => "Pendiente"', () => {
  E.firestore[ID('AAA111')] = {}; E.post({ tipo: 'pedido_estado', id: ID('AAA111') });
  assert.strictEqual(P.grid[1][14], 'Pendiente');
});

console.log('\n3) Errores identificables y casos raros');
const errores = () => (E.hojas['Errores_Pedidos'] ? E.hojas['Errores_Pedidos'].grid.slice(1) : []);
t('pedido que no está en la hoja: NO crea fila y queda anotado en Errores_Pedidos', () => {
  const filas = P.getLastRow(); E.firestore[ID('ZZZ999')] = { estado: 'enviado' };
  E.post({ tipo: 'pedido_estado', id: ID('ZZZ999') });
  assert.strictEqual(P.getLastRow(), filas); assert.strictEqual(errores().length, 1);
  assert.strictEqual(errores()[0][1], 'pedido_estado'); assert.ok(/no está en la hoja/.test(errores()[0][3]));
});
t('Firestore caído (500): no toca la hoja y lo anota', () => {
  const previo = copia(P.grid); E.firestore[ID('BBB222')] = 'ERROR500';
  E.post({ tipo: 'pedido_estado', id: ID('BBB222') });
  assert.deepStrictEqual(celdasDistintas(previo, P.grid), []); assert.strictEqual(errores().length, 2);
  E.firestore[ID('BBB222')] = { estado: 'enviado' };
});
t('id inválido o pedido inexistente en Firestore: se ignora sin tocar nada', () => {
  const previo = copia(P.grid);
  E.post({ tipo: 'pedido_estado', id: '123' }); E.post({ tipo: 'pedido_estado' }); E.post({ tipo: 'pedido_estado', id: ID('NOEXIS') });
  assert.deepStrictEqual(celdasDistintas(previo, P.grid), []);
});
t('código repetido en 2 filas: no adivina, no cambia ninguna y lo anota', () => {
  const E2 = crearEntorno([hist('DUP001', 100000, ''), hist('DUP001', 200000, '')], ENC);
  E2.firestore[ID('DUP001')] = { estado: 'enviado' }; const previo = copia(E2.hojas.Pedidos.grid);
  E2.post({ tipo: 'pedido_estado', id: ID('DUP001') });
  assert.deepStrictEqual(celdasDistintas(previo, E2.hojas.Pedidos.grid), []);
  assert.ok(/aparece en 2 filas/.test(E2.hojas['Errores_Pedidos'].grid[1][3]));
});
t('si falla escribir el estado inicial, el pedido igual se registra y se manda el correo', () => {
  const E3 = crearEntorno([], ENC); const h = E3.hojas.Pedidos; const orig = h.getRange;
  h.getRange = (r, c, a, b) => { if (r === 1 && c > 14) throw new Error('hoja protegida'); return orig(r, c, a, b); };
  E3.post(pedidoNuevo('PRO001')); assert.strictEqual(h.getLastRow(), 2); assert.strictEqual(E3.correos.length, 1);
  assert.ok(E3.hojas['Errores_Pedidos'].grid[1][3].includes('hoja protegida'));
});
t('hoja SIN columna ajena: la columna de estado queda en N, justo tras M', () => {
  const E4 = crearEntorno([hist('SOL001', 50000, undefined).slice(0, 13)], ENC.slice(0, 13));
  E4.firestore[ID('SOL001')] = { estado: 'entregado' }; E4.post({ tipo: 'pedido_estado', id: ID('SOL001') });
  assert.strictEqual(E4.hojas.Pedidos.grid[0][13], 'Estado del pedido'); assert.strictEqual(E4.hojas.Pedidos.grid[1][13], 'Entregado');
});

console.log('\n4) No se rompió lo que ya existía');
t('pedido_eliminado borra solo la fila de ese pedido', () => {
  delete E.firestore[ID('BBB222')];   // el panel borra primero en Firestore y DESPUÉS avisa
  const filas = P.getLastRow(); E.post({ tipo: 'pedido_eliminado', id: ID('BBB222'), idToken: ADMIN_TOKEN });
  assert.strictEqual(P.getLastRow(), filas - 1); assert.ok(!P.grid.some(f => f[0] === 'BBB222')); assert.ok(P.grid.some(f => f[0] === 'AAA111'));
});
t('contacto_nuevo sigue creando su pestaña y sin duplicar', () => {
  const d = { tipo: 'contacto_nuevo', codigo: 'CT0001', fecha: Date.now(), nombre: 'Ana Prueba', correo: 'a@x.com', telefono: '3000000000', asunto: 'Hola', mensaje: 'Mensaje de prueba largo', estado: 'nuevo' };
  E.post(d); E.post(d); assert.strictEqual(E.hojas['Contactos'].getLastRow(), 2);
});
t('doGet informa la versión publicada', () => { assert.ok(/avisos-protegidos/.test(vm.runInContext('doGet', E.ctx)().t)); });


console.log('\n5) Seguridad: nadie puede usar el script con avisos inventados');
const filasDe = E_ => E_.hojas.Pedidos.grid.map(f => f[0]);
t('pedido_eliminado SIN token: no borra nada', () => {
  const E5 = crearEntorno([hist('AAA111', 1, ''), hist('BBB222', 1, '')], ENC);
  E5.post({ tipo: 'pedido_eliminado', id: ID('BBB222') });
  assert.ok(filasDe(E5).includes('BBB222'));
});
t('pedido_eliminado con token de un CLIENTE (no admin): no borra nada', () => {
  const E5 = crearEntorno([hist('BBB222', 1, '')], ENC);
  E5.post({ tipo: 'pedido_eliminado', id: ID('BBB222'), idToken: TOKEN_CLIENTE });
  assert.ok(filasDe(E5).includes('BBB222'));
});
t('pedido_eliminado con token admin pero el pedido AÚN EXISTE en Firestore: no borra', () => {
  const E5 = crearEntorno([hist('BBB222', 1, '')], ENC); E5.firestore[ID('BBB222')] = { estado: 'pendiente' };
  E5.post({ tipo: 'pedido_eliminado', id: ID('BBB222'), idToken: ADMIN_TOKEN });
  assert.ok(filasDe(E5).includes('BBB222'));
});
t('id inventado cuyos últimos 6 caracteres coinciden con un pedido real (el hueco del solo-404): sin token NO borra', () => {
  const E5 = crearEntorno([hist('BBB222', 1, '')], ENC);               // 404 en Firestore porque el id no existe
  E5.post({ tipo: 'pedido_eliminado', id: 'ZZZZZZZZZZZZZZBBB222' });
  assert.ok(filasDe(E5).includes('BBB222'));
});
t('pedido_eliminado de un admin con el pedido ya borrado: sí borra (flujo normal del panel)', () => {
  const E5 = crearEntorno([hist('AAA111', 1, ''), hist('BBB222', 1, '')], ENC);
  E5.post({ tipo: 'pedido_eliminado', id: ID('BBB222'), idToken: ADMIN_TOKEN });
  assert.deepStrictEqual(filasDe(E5).slice(1), ['AAA111']);
});
t('aviso_drop_nuevo SIN token o con token de cliente: no manda ningún correo', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'aviso_drop_nuevo', asunto: 'Gana', mensaje: 'phishing', correos: ['victima@x.com'] });
  E5.post({ tipo: 'aviso_drop_nuevo', asunto: 'Gana', mensaje: 'phishing', correos: ['victima@x.com'], idToken: TOKEN_CLIENTE });
  assert.strictEqual(E5.correos.length, 0);
});
t('aviso_drop_nuevo de admin: usa los correos de FIRESTORE, ignora los de la petición y descarta basura', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'aviso_drop_nuevo', asunto: 'Drop', mensaje: 'Sale hoy', correos: ['victima@x.com'], idToken: ADMIN_TOKEN });
  assert.strictEqual(E5.correos.length, 1);
  assert.strictEqual(E5.correos[0].bcc, 'cliente1@x.com,cliente2@x.com');
  assert.ok(!/victima/.test(E5.correos[0].bcc));
  assert.strictEqual(E5.correos[0].subject, 'MAQUINA — Drop');
});
t('aviso_drop_nuevo: asunto/mensaje desmesurados se ignoran', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'aviso_drop_nuevo', asunto: 'x'.repeat(200), mensaje: 'ok', idToken: ADMIN_TOKEN });
  E5.post({ tipo: 'aviso_drop_nuevo', asunto: 'ok', mensaje: 'x'.repeat(6000), idToken: ADMIN_TOKEN });
  assert.strictEqual(E5.correos.length, 0);
});
t('codigo_panel_recuperacion: ignora el código y el destino inventados; no manda a quien no es del panel', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'codigo_panel_recuperacion', correo: 'victima@x.com', codigo: 'Entra aquí: http://phishing' });
  assert.strictEqual(E5.correos.length, 0);
});
t('codigo_panel_recuperacion de un correo real del panel: manda SU código de Firestore, aunque la petición traiga otro', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'codigo_panel_recuperacion', correo: 'Admin@Tienda.com', codigo: 'texto falso' });
  assert.strictEqual(E5.correos.length, 1);
  assert.strictEqual(E5.correos[0].to, 'admin@tienda.com');
  assert.ok(/123456/.test(E5.correos[0].body) && !/texto falso/.test(E5.correos[0].body));
});
t('codigo_panel_recuperacion: segundo pedido a la misma dirección en 10 min no manda otro correo', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'codigo_panel_recuperacion', correo: 'admin@tienda.com' });
  E5.post({ tipo: 'codigo_panel_recuperacion', correo: 'admin@tienda.com' });
  assert.strictEqual(E5.correos.length, 1);
});
t('codigo_panel_recuperacion: correos con comas/barras o enormes se descartan antes de tocar Firestore', () => {
  const E5 = crearEntorno([], ENC);
  E5.post({ tipo: 'codigo_panel_recuperacion', correo: 'admin@tienda.com,otro@x.com' });
  E5.post({ tipo: 'codigo_panel_recuperacion', correo: 'a/b@x.com' });
  assert.strictEqual(E5.correos.length, 0); assert.strictEqual(E5.fetchs.length, 0);
});


console.log('\n6) Cuota de correos: un flujo de avisos falsos no deja sin correos a los pedidos reales');
const bienvenida = c => ({ tipo: 'voltage_club_bienvenida', correo: c });
const contacto = (n, correo) => ({ tipo: 'contacto_nuevo', codigo: 'CT' + String(n).padStart(4, '0'), fecha: Date.now(), nombre: 'Persona ' + n, correo, telefono: '3000000000', asunto: 'Hola', mensaje: 'Mensaje de prueba largo', estado: 'nuevo' });
t('bienvenida: la misma dirección solo recibe 1 correo por ventana', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 0; i < 10; i++) E6.post(bienvenida('victima@x.com'));
  assert.strictEqual(E6.correos.length, 1);
});
t('bienvenida: con direcciones distintas el tope global es 30', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 0; i < 200; i++) E6.post(bienvenida('u' + i + '@x.com'));
  assert.strictEqual(E6.correos.length, 30);
});
t('bienvenida: direcciones basura (comas, sin @) no se envían', () => {
  const E6 = crearEntorno([], ENC);
  E6.post(bienvenida('a@b.com,c@d.com')); E6.post(bienvenida('sinarroba')); E6.post(bienvenida(''));
  assert.strictEqual(E6.correos.length, 0);
});
t('contacto: spam desde la misma dirección se corta en 5 correos (los mensajes sí se guardan en la hoja)', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 1; i <= 12; i++) E6.post(contacto(i, 'spam@x.com'));
  assert.strictEqual(E6.correos.length, 5);
  assert.strictEqual(E6.hojas['Contactos'].getLastRow(), 13);
});
t('RESERVA: con la cuota en el límite de la reserva (30) los avisos que no son pedidos NO se envían', () => {
  const E6 = crearEntorno([], ENC); E6.setCuota(30);
  E6.post(bienvenida('a@x.com')); E6.post(contacto(1, 'a@x.com')); E6.post({ tipo: 'codigo_panel_recuperacion', correo: 'admin@tienda.com' });
  E6.post({ tipo: 'aviso_drop_nuevo', asunto: 'D', mensaje: 'M', idToken: ADMIN_TOKEN });
  assert.strictEqual(E6.correos.length, 0);
});
t('RESERVA: con cuota 31 sí sale 1 bienvenida; con 30 ya no', () => {
  const E6 = crearEntorno([], ENC); E6.setCuota(31);
  E6.post(bienvenida('a@x.com')); E6.post(bienvenida('b@x.com'));
  assert.strictEqual(E6.correos.length, 1);
});
t('los pedidos reales SÍ usan la reserva: con cuota 5 el correo de confirmación sale', () => {
  const E6 = crearEntorno([hist('AAA111', 1, '')], ENC); E6.setCuota(5);
  E6.post(pedidoNuevo('NEW111'));
  assert.strictEqual(E6.correos.length, 1); assert.ok(E6.hojas.Pedidos.grid.some(f => f[0] === 'NEW111'));
});
t('pedido real con cuota 0: la fila queda en la hoja, no se manda correo y queda anotado en Errores_Pedidos', () => {
  const E6 = crearEntorno([], ENC); E6.setCuota(0);
  E6.post(pedidoNuevo('NEW222'));
  assert.strictEqual(E6.correos.length, 0); assert.ok(E6.hojas.Pedidos.grid.some(f => f[0] === 'NEW222'));
  const err = E6.hojas['Errores_Pedidos']; assert.ok(err && /NO se envió/.test(err.grid[1][3]));
});
t('inundación de avisos falsos: la cuota NUNCA baja de la reserva y aún alcanza para confirmar un pedido', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 0; i < 300; i++) {
    E6.post(bienvenida('f' + i + '@x.com')); E6.post(contacto(i, 'f' + i + '@x.com'));
    E6.post({ tipo: 'codigo_panel_recuperacion', correo: 'admin@tienda.com' });
    E6.post({ tipo: 'aviso_drop_nuevo', asunto: 'D', mensaje: 'M', idToken: TOKEN_CLIENTE });
  }
  assert.ok(E6.getCuota() >= 30, 'cuota restante: ' + E6.getCuota());
  E6.post(pedidoNuevo('REAL01'));
  assert.ok(E6.correos.some(c => c.to === 'n@x.com'));
});
t('pedido_nuevo: la misma dirección no puede pasar de 5 correos por hora', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 0; i < 9; i++) E6.post(pedidoNuevo('PN' + String(i).padStart(4, '0')));
  assert.strictEqual(E6.correos.length, 5);
});
t('drop grande: envía tandas hasta tocar la reserva, para, y te avisa por correo que quedó incompleto', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 0; i < 120; i++) E6.voltageClub.push('s' + i + '@x.com');   // +2 válidos de base = 122 destinatarios
  E6.post({ tipo: 'aviso_drop_nuevo', asunto: 'Drop', mensaje: 'Sale hoy', idToken: ADMIN_TOKEN });
  const tandas = E6.correos.filter(c => c.bcc);
  assert.strictEqual(tandas.length, 1); assert.strictEqual(tandas[0].bcc.split(',').length, 45);
  assert.ok(E6.getCuota() >= 30 - 1, 'cuota: ' + E6.getCuota());
  const aviso = E6.correos.find(c => /incompleto/.test(c.subject)); assert.ok(aviso && aviso.to === 'dueno@test.com');
});
t('drop: más de 5 avisos por hora se descartan (aunque venga con token de admin)', () => {
  const E6 = crearEntorno([], ENC);
  for (let i = 0; i < 9; i++) E6.post({ tipo: 'aviso_drop_nuevo', asunto: 'D' + i, mensaje: 'M', idToken: ADMIN_TOKEN });
  assert.strictEqual(E6.correos.filter(c => c.bcc).length, 5);
});


console.log('\n7) pedido_nuevo: fila y correo salen del pedido REAL de Firestore, no del aviso');
const idPN = c => ('ABCDEFGHIJKLMN' + c).slice(-20);
t('estado_pago FALSEADO ("pagado") en el aviso: el correo NO dice "Pago confirmado" y la hoja no dice "Pagado"', () => {
  const E7 = crearEntorno([], ENC);
  const aviso = pedidoNuevo('PAG001'); aviso.pedido.metodo_pago = 'nequi';
  E7.post(aviso);                                                       // Firestore queda con estado_pago "pendiente"
  const falso = JSON.parse(JSON.stringify(aviso)); falso.pedido.estado_pago = 'pagado'; falso.pedido.id = idPN('PAG002'); falso.pedido.codigo_pedido = 'PAG002';
  E7.firestore[idPN('PAG002')] = (() => { const d = JSON.parse(JSON.stringify(aviso.pedido)); delete d.id; delete d.codigo_pedido; d.estado_pago = 'por_verificar'; return d; })();
  E7.post(Object.assign(falso, { __falso: true }));                     // el navegador "dice" pagado, Firestore dice por_verificar
  assert.strictEqual(E7.correos.length, 2);
  E7.correos.forEach(c => { assert.ok(!/Pago confirmado/.test(c.subject), c.subject); assert.ok(!/Pagado/.test(c.body.split('\n').filter(l => /Estado del pago/.test(l)).join(''))); });
  const filaM = E7.hojas.Pedidos.grid.slice(1).map(f => f[12]); assert.ok(filaM.every(x => !/^Pagado/.test(x)), filaM.join('|'));
});
t('total, correo, nombre y código FALSEADOS en el aviso: se usan los reales de Firestore', () => {
  const E7 = crearEntorno([], ENC);
  const real = pedidoNuevo('REAL77', 130000); E7.post(real);            // crea el documento real
  const mentira = JSON.parse(JSON.stringify(real));
  Object.assign(mentira.pedido, { total: 1, subtotal: 1, email_cliente: 'victima@x.com', nombre_cliente: 'ESTAFA', codigo_pedido: 'HACK99', metodo_pago: 'tarjeta' });
  E7.post(mentira);                                                     // mismo id: ya está en la hoja
  assert.strictEqual(E7.correos.length, 1); assert.strictEqual(E7.correos[0].to, 'n@x.com');
  const fila = E7.hojas.Pedidos.grid[1];
  assert.strictEqual(fila[0], 'REAL77'); assert.strictEqual(fila[2], 'Nuevo'); assert.strictEqual(fila[11], 130000);
});
t('aviso con datos mentirosos sobre un pedido real NUEVO: el correo va al correo real y con el total real', () => {
  const E7 = crearEntorno([], ENC);
  const real = pedidoNuevo('REAL88', 90000);
  E7.firestore[idPN('REAL88')] = (() => { const d = JSON.parse(JSON.stringify(real.pedido)); delete d.id; delete d.codigo_pedido; return d; })();
  const mentira = JSON.parse(JSON.stringify(real)); Object.assign(mentira.pedido, { total: 5, email_cliente: 'victima@x.com', codigo_pedido: 'HACK99', estado_pago: 'pagado' }); mentira.__falso = true;
  E7.post(mentira);
  assert.strictEqual(E7.correos.length, 1); assert.strictEqual(E7.correos[0].to, 'n@x.com');
  assert.ok(/90\.000/.test(E7.correos[0].body) && !/\$5\n/.test(E7.correos[0].body));
  assert.ok(!/Pago confirmado/.test(E7.correos[0].subject));
  assert.strictEqual(E7.hojas.Pedidos.grid[1][0], 'REAL88'); assert.strictEqual(E7.hojas.Pedidos.grid[1][11], 90000);
});
t('pedido INVENTADO (no existe en Firestore): no escribe fila ni manda correo', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('FAKE01'); a.pedido.email_cliente = 'victima@x.com'; a.__falso = true; E7.post(a);
  assert.strictEqual(E7.correos.length, 0); assert.strictEqual(E7.hojas.Pedidos.getLastRow(), 1);
});
t('avisos sin pedido, sin id o con id raro: se ignoran sin tocar nada', () => {
  const E7 = crearEntorno([], ENC);
  E7.post({ tipo: 'pedido_nuevo' }); E7.post({ tipo: 'pedido_nuevo', pedido: {} });
  E7.post({ tipo: 'pedido_nuevo', pedido: { id: '../../otra/cosa' } }); E7.post({ tipo: 'pedido_nuevo', pedido: { id: 'corto' } });
  assert.strictEqual(E7.correos.length, 0); assert.strictEqual(E7.hojas.Pedidos.getLastRow(), 1); assert.strictEqual(E7.fetchs.length, 0);
});
t('Firestore caído (500) al leer el pedido: no escribe nada y lo anota en Errores_Pedidos', () => {
  const E7 = crearEntorno([], ENC);
  E7.firestore[idPN('CAIDO1')] = 'ERROR500';
  const a = pedidoNuevo('CAIDO1'); a.__falso = true; E7.post(a);
  assert.strictEqual(E7.correos.length, 0); assert.strictEqual(E7.hojas.Pedidos.getLastRow(), 1);
  assert.ok(E7.hojas['Errores_Pedidos'] && /500/.test(E7.hojas['Errores_Pedidos'].grid[1][3]));
});
t('texto con fórmula en Firestore (nombre "=HYPERLINK...") queda como texto en la hoja', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('FORM01'); a.pedido.nombre_cliente = '=HYPERLINK("http://x","clic")'; a.pedido.envio_direccion = '+cmd|calc'; E7.post(a);
  const fila = E7.hojas.Pedidos.grid[1];
  assert.ok(fila[2].startsWith("'=")); assert.ok(fila[7].startsWith("'+"));
});
t('fecha inválida en Firestore: la fila se escribe igual con una fecha válida', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('FECH01'); a.pedido.fecha = 'esto no es una fecha'; E7.post(a);
  const f = E7.hojas.Pedidos.grid[1][1]; assert.strictEqual(Object.prototype.toString.call(f), '[object Date]'); assert.ok(!isNaN(f.getTime()));
});
t('los items y totales del correo salen del documento de Firestore (con foto, talla y precio)', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('ITEM01', 150000); a.pedido.items = [{ id: 'p1', nombre: 'Hoodie Voltage', talla: 'M', precio: 140000, foto: 'https://x.test/h.jpg' }]; E7.post(a);
  const c = E7.correos[0]; assert.ok(/Hoodie Voltage — talla M — \$140\.000/.test(c.body)); // La foto va ADJUNTA dentro del correo (cid), no como enlace: el script la descarga de la tienda.
  assert.ok(E7.fetchs.some(u => /x\.test\/h\.jpg/.test(u)));
});
t('correo CONTRAENTREGA: dice "Contraentrega" y NUNCA "pago exitoso"', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('CONT01'); a.pedido.items = [{ id: 'p1', nombre: 'Gorra', talla: 'U', precio: 120000 }]; E7.post(a);
  const c = E7.correos[0];
  assert.ok(/Contraentrega, pedido #CONT01/.test(c.subject)); assert.ok(/CONTRAENTREGA|Contraentrega/.test(c.htmlBody));
  assert.ok(!/exitoso|Pago confirmado/i.test(c.subject + c.body + c.htmlBody));
});
t('correo TARJETA sin verificar: dice "por verificar" y NO "exitoso"', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('TARJ01'); a.pedido.metodo_pago = 'tarjeta'; a.pedido.estado_pago = 'por_verificar'; a.pedido.items = [{ id: 'p1', nombre: 'Gorra', talla: 'U', precio: 120000 }]; E7.post(a);
  const c = E7.correos[0];
  assert.ok(/por verificar/i.test(c.subject)); assert.ok(!/exitoso/i.test(c.subject + c.body + c.htmlBody));
});
t('correo con pago YA confirmado (estado_pago = pagado): dice "Pago exitoso"', () => {
  const E7 = crearEntorno([], ENC);
  const a = pedidoNuevo('PAGO01'); a.pedido.metodo_pago = 'tarjeta'; a.pedido.estado_pago = 'pagado'; a.pedido.items = [{ id: 'p1', nombre: 'Gorra', talla: 'U', precio: 120000 }]; E7.post(a);
  const c = E7.correos[0];
  assert.ok(/Pago exitoso, pedido #PAGO01/.test(c.subject)); assert.ok(/Pago exitoso/.test(c.htmlBody));
});
t('borrar pedido: el script responde JSON con cuántas filas borró (y rechaza sin token)', () => {
  const E7 = crearEntorno([hist('DEL001', 100000, '')], ENC);
  const r = E7.post({ tipo: 'pedido_eliminado', id: ID('DEL001'), idToken: 'sin.permiso.x' });
  assert.ok(!JSON.parse(r).ok); assert.strictEqual(E7.hojas.Pedidos.getLastRow(), 2);
});

console.log('\n8) Estado de pago y sincronizar pedidos con la hoja');
const J = txt => JSON.parse(txt);
t('pedido_pago: escribe SOLO la columna M con el pago REAL de Firestore (no crea filas ni toca lo demás)', () => {
  const E8 = crearEntorno([], ENC); const H = E8.hojas.Pedidos;
  E8.post(pedidoNuevo('PAGO01'));
  assert.strictEqual(H.grid[1][12], 'Pendiente (contraentrega)');
  const previo = copia(H.grid);
  E8.firestore[ID('PAGO01')].estado_pago = 'pagado';
  E8.firestore[ID('PAGO01')].historial_pagos = [{ estado_pago: 'pagado', usuario: 'admin', fecha: '2026-10-12T10:00:00Z' }];
  assert.strictEqual(E8.post({ tipo: 'pedido_pago', id: ID('PAGO01') }), 'ok');
  assert.deepStrictEqual(celdasDistintas(previo, H.grid), [[2, 13]]);
  assert.strictEqual(H.grid[1][12], 'Pagado'); assert.strictEqual(H.getLastRow(), 2); assert.strictEqual(E8.correos.length, 1); // el único correo es el de la confirmación del pedido
});
t('pedido_pago: volver a \"por verificar\" vuelve a reflejarse; repetir el aviso no cambia nada', () => {
  const E8 = crearEntorno([], ENC); const H = E8.hojas.Pedidos;
  const a = pedidoNuevo('PAGO02'); a.pedido.metodo_pago = 'nequi'; E8.post(a);
  E8.firestore[ID('PAGO02')].estado_pago = 'pagado'; E8.post({ tipo: 'pedido_pago', id: ID('PAGO02') });
  E8.firestore[ID('PAGO02')].estado_pago = 'por_verificar'; E8.post({ tipo: 'pedido_pago', id: ID('PAGO02') });
  assert.strictEqual(H.grid[1][12], 'Por verificar (transferencia Nequi)');
  const previo = copia(H.grid); E8.post({ tipo: 'pedido_pago', id: ID('PAGO02') }); E8.post({ tipo: 'pedido_pago', id: ID('PAGO02') });
  assert.deepStrictEqual(celdasDistintas(previo, H.grid), []);
});
t('pedido_pago: lo que diga el aviso se ignora (un \"pagado\" falso no marca nada)', () => {
  const E8 = crearEntorno([], ENC); const H = E8.hojas.Pedidos;
  E8.post(pedidoNuevo('PAGO03'));
  E8.post({ tipo: 'pedido_pago', id: ID('PAGO03'), estado_pago: 'pagado', pedido: { estado_pago: 'pagado' } });
  assert.strictEqual(H.grid[1][12], 'Pendiente (contraentrega)');
});
t('pedido_pago: id inválido, pedido inexistente o que no está en la hoja: no escribe nada (y lo anota)', () => {
  const E8 = crearEntorno([], ENC); const H = E8.hojas.Pedidos;
  E8.post(pedidoNuevo('PAGO04'));
  const previo = copia(H.grid);
  E8.post({ tipo: 'pedido_pago', id: 'corto' }); E8.post({ tipo: 'pedido_pago' }); E8.post({ tipo: 'pedido_pago', id: ID('NOEXIS') });
  E8.firestore[ID('HUERFA')] = { estado: 'pendiente', estado_pago: 'pagado' };            // existe en Firestore pero nunca llegó a la hoja
  E8.post({ tipo: 'pedido_pago', id: ID('HUERFA') });
  assert.deepStrictEqual(celdasDistintas(previo, H.grid), []); assert.strictEqual(H.getLastRow(), 2);
  const err = E8.hojas.Errores_Pedidos; assert.ok(err && err.grid.some(f => /HUERFA/.test(String(f[2]))), 'debe quedar en Errores_Pedidos');
});

t('pedidos_sincronizar: sin token, con token de cliente o inventado -> rechazado y no escribe nada', () => {
  const E8 = crearEntorno([], ENC); const H = E8.hojas.Pedidos;
  E8.firestore[ID('SYN001')] = pedidoNuevo('SYN001').pedido; delete E8.firestore[ID('SYN001')].id; delete E8.firestore[ID('SYN001')].codigo_pedido;
  [undefined, TOKEN_CLIENTE, 'no-es-token'].forEach(tok => {
    const r = J(E8.post({ tipo: 'pedidos_sincronizar', ids: [ID('SYN001')], idToken: tok }));
    assert.strictEqual(r.ok, false);
  });
  assert.strictEqual(H.getLastRow(), 1); assert.strictEqual(E8.correos.length, 0);
});
t('pedidos_sincronizar: agrega los pedidos que faltan SIN correo, los que ya están no se duplican', () => {
  const E8 = crearEntorno([hist('AAA111', 150000, 'VIP')], ENC); const H = E8.hojas.Pedidos;
  ['SYN002', 'SYN003'].forEach(c => { const d = pedidoNuevo(c).pedido; delete d.id; delete d.codigo_pedido; E8.firestore[ID(c)] = d; });
  E8.firestore[ID('AAA111')] = { estado: 'enviado', estado_pago: 'pagado' };
  const ids = [ID('SYN002'), ID('SYN003'), ID('AAA111')];
  const r = J(E8.post({ tipo: 'pedidos_sincronizar', ids, idToken: ADMIN_TOKEN }));
  assert.deepStrictEqual(r, { ok: true, agregados: 2, actualizados: 1, inexistentes: 0, errores: 0 });
  assert.strictEqual(H.getLastRow(), 4); assert.strictEqual(E8.correos.length, 0, 'no debe mandar correos a los clientes');
  const r2 = J(E8.post({ tipo: 'pedidos_sincronizar', ids, idToken: ADMIN_TOKEN }));       // repetir no duplica
  assert.deepStrictEqual(r2, { ok: true, agregados: 0, actualizados: 3, inexistentes: 0, errores: 0 });
  assert.strictEqual(H.getLastRow(), 4);
});
t('pedidos_sincronizar: deja al día \"Estado del pedido\" y no pisa la columna M escrita a mano si el pago no se gestionó en el panel', () => {
  const E8 = crearEntorno([hist('AAA111', 150000, 'VIP'), hist('BBB222', 90000, '')], ENC); const H = E8.hojas.Pedidos;
  E8.firestore[ID('AAA111')] = { estado: 'entregado', estado_pago: 'pendiente' };            // M dice \"Pagado\" (escrito a mano): se respeta
  E8.firestore[ID('BBB222')] = { estado: 'confirmado', estado_pago: 'pagado', metodo_pago: 'nequi', historial_pagos: [{ estado_pago: 'pagado', usuario: 'admin', fecha: 'f' }] };
  H.grid[2][12] = 'Por verificar (transferencia Nequi)';                                     // BBB222 se gestionó en el panel: manda Firestore
  J(E8.post({ tipo: 'pedidos_sincronizar', ids: [ID('AAA111'), ID('BBB222')], idToken: ADMIN_TOKEN }));
  assert.strictEqual(H.grid[1][14], 'Entregado'); assert.strictEqual(H.grid[2][14], 'Listo');
  assert.strictEqual(H.grid[1][12], 'Pagado'); assert.strictEqual(H.grid[2][12], 'Pagado');
  assert.strictEqual(H.grid[1][13], 'VIP', 'la columna ajena N no se toca'); assert.strictEqual(H.grid[1][11], 150000);
});
t('pedidos_sincronizar: un pedido que falla no frena a los demás y queda en Errores_Pedidos; los inexistentes se cuentan', () => {
  const E8 = crearEntorno([], ENC); const H = E8.hojas.Pedidos;
  const d = pedidoNuevo('SYN004').pedido; delete d.id; delete d.codigo_pedido; E8.firestore[ID('SYN004')] = d;
  E8.firestore[ID('MALO01')] = 'ERROR500';
  const r = J(E8.post({ tipo: 'pedidos_sincronizar', ids: [ID('MALO01'), ID('SYN004'), ID('NOEXI2'), 'raro', 123], idToken: ADMIN_TOKEN }));
  assert.deepStrictEqual(r, { ok: true, agregados: 1, actualizados: 0, inexistentes: 1, errores: 1 });
  assert.strictEqual(H.getLastRow(), 2);
  assert.ok(E8.hojas.Errores_Pedidos.grid.some(f => /pedidos_sincronizar/.test(String(f[1])) && /MALO01/.test(String(f[2]))));
});
t('pedidos_sincronizar: procesa como máximo 15 ids por llamada', () => {
  const E8 = crearEntorno([], ENC);
  const ids = []; for (let i = 0; i < 20; i++) { const c = 'LOT' + String(i).padStart(3, '0'); const d = pedidoNuevo(c).pedido; delete d.id; delete d.codigo_pedido; E8.firestore[ID(c)] = d; ids.push(ID(c)); }
  const r = J(E8.post({ tipo: 'pedidos_sincronizar', ids, idToken: ADMIN_TOKEN }));
  assert.strictEqual(r.agregados, 15); assert.strictEqual(E8.hojas.Pedidos.getLastRow(), 16);
});

console.log(`\n${ok} pruebas OK` + (process.exitCode ? '  —  HAY FALLOS' : '')); 
