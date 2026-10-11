/* PRUEBA SEGURA de la integración con la hoja de cálculo.
   Carga el Apps Script REAL (APPS_SCRIPT_pegar_en_script.google.com.txt) en un
   simulador en memoria: hoja, correo y Firestore FALSOS. No usa red ni credenciales
   y no toca ningún dato real.   Uso:  node tests-hoja/test-hoja-simulada.js        */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const codigoGs = fs.readFileSync(path.join(__dirname, '..', 'APPS_SCRIPT_pegar_en_script.google.com.txt'), 'utf8');

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
  const correos = []; const firestore = {}; const fetchs = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => hojas[n] || null, insertSheet: n => Hoja(n, []) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: o => correos.push(o) },
    ContentService: { createTextOutput: t => ({ t }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@test.com' }) },
    UrlFetchApp: { fetch: url => {
      fetchs.push(url);
      const id = decodeURIComponent(url.split('/pedidos/')[1]);
      const d = firestore[id];
      if (d === 'ERROR500') return { getResponseCode: () => 500, getContentText: () => '' };
      if (!d) return { getResponseCode: () => 404, getContentText: () => '' };
      const campos = {}; if (d.estado) campos.estado = { stringValue: d.estado };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ fields: campos }) };
    } },
  };
  vm.createContext(ctx); vm.runInContext(codigoGs, ctx);
  const post = obj => vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(obj) } }).t;
  return { ctx, hojas, correos, firestore, fetchs, post };
}

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
  E.firestore[ID('NEW001')] = { estado: 'pendiente' };
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
  assert.strictEqual(P.grid[3][14], 'Confirmado');
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
  const filas = P.getLastRow(); E.post({ tipo: 'pedido_eliminado', id: ID('BBB222') });
  assert.strictEqual(P.getLastRow(), filas - 1); assert.ok(!P.grid.some(f => f[0] === 'BBB222')); assert.ok(P.grid.some(f => f[0] === 'AAA111'));
});
t('contacto_nuevo sigue creando su pestaña y sin duplicar', () => {
  const d = { tipo: 'contacto_nuevo', codigo: 'CT0001', fecha: Date.now(), nombre: 'Ana Prueba', correo: 'a@x.com', telefono: '3000000000', asunto: 'Hola', mensaje: 'Mensaje de prueba largo', estado: 'nuevo' };
  E.post(d); E.post(d); assert.strictEqual(E.hojas['Contactos'].getLastRow(), 2);
});
t('doGet informa la versión publicada', () => { assert.ok(/pedidos-estado-sync/.test(vm.runInContext('doGet', E.ctx)().t)); });

console.log(`\n${ok} pruebas OK` + (process.exitCode ? '  —  HAY FALLOS' : '')); 
