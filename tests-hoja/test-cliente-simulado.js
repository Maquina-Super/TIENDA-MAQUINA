/* PRUEBA SEGURA del lado navegador (js/store.js) con un Firestore FALSO en memoria.
   No usa red ni credenciales. Uso:  node tests-hoja/test-cliente-simulado.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

function entorno(docs, { falla, leer } = {}) {
  const avisos = []; const modos = []; let escrituras = 0;
  const ref = id => ({ id, _id: id });
  const fbDb = {
    collection: () => ({
      doc: id => Object.assign(ref(id), { delete: async () => { delete docs[id]; } }),
      orderBy: () => { throw new Error('ya no se debe usar orderBy en pedidos'); },
      get: async () => { if (falla) throw Object.assign(new Error('x'), { code: falla }); return { docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => ({ ...d }) })) }; },
    }),
    runTransaction: async fn => fn({
      get: async r => ({ exists: !!docs[r.id], data: () => ({ ...docs[r.id] }) }),
      update: (r, c) => { escrituras++; Object.entries(c).forEach(([k, v]) => { if (v && v.__v !== undefined) (docs[r.id][k] = docs[r.id][k] || []).push(v.__v); else docs[r.id][k] = v; }); },
    }),
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, head: { appendChild() {} }, readyState: 'complete' },
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fbDb, fbAuth: { currentUser: { uid: 'u1', getIdToken: async () => 'tok.en.admin' }, onAuthStateChanged() {} }, crypto: {}, TextEncoder, setTimeout, clearTimeout, setInterval: () => 0, Date, Promise, JSON, Math, Object, Array, Map, Set, String, Number, Error, RegExp, isNaN, parseInt, parseFloat,
    firebase: { firestore: { FieldValue: { arrayUnion: v => ({ __v: v }), increment: n => n, delete: () => null } } },
    fetch: async (url, o) => {
      const body = JSON.parse(o.body); modos.push(o.mode || 'cors');
      if (!o.mode && leer === 'bloqueado') throw new TypeError('Failed to fetch');   // el navegador no deja leer la respuesta (CORS)
      avisos.push(body);
      if (!o.mode && typeof leer === 'function') return { text: async () => JSON.stringify(leer(body)) };
    },
    navigator: {}, location: { href: '' }, addEventListener() {}, alert() {}, confirm: () => true,
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src.replace(/\bconst APPS_SCRIPT_URL\b/, 'var APPS_SCRIPT_URL') + '\nusuarioAdminActual = () => "admin@test";', ctx);
  return { ctx, avisos, modos, escrituras: () => escrituras, run: c => vm.runInContext(c, ctx) };
}
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n      ' + e.message); process.exitCode = 1; } };
const flush = () => new Promise(r => setImmediate(r));

(async () => {
  console.log('\nPanel de pedidos (js/store.js)');
  await t('cambiar el estado: 1 escritura y 1 aviso a la hoja con el id correcto', async () => {
    const E = entorno({ P1: { estado: 'pendiente', total: 100 } });
    const r = await E.run('actualizarEstadoPedidoAdmin("P1","confirmado")'); await flush();
    assert.ok(r.ok && !r.sinCambio); assert.strictEqual(E.escrituras(), 1);
    assert.strictEqual(E.avisos.length, 1); assert.strictEqual(E.avisos[0].tipo, 'pedido_estado'); assert.strictEqual(E.avisos[0].id, 'P1');
  });
  await t('repetir el mismo estado: sin escritura, sin aviso (no duplica nada)', async () => {
    const E = entorno({ P1: { estado: 'confirmado' } });
    const r = await E.run('actualizarEstadoPedidoAdmin("P1","confirmado")'); await flush();
    assert.ok(r.ok && r.sinCambio); assert.strictEqual(E.escrituras(), 0); assert.strictEqual(E.avisos.length, 0);
  });
  await t('cambiar el estado NO crea documentos nuevos ni toca totales', async () => {
    const docs = { P1: { estado: 'pendiente', total: 100, subtotal: 90 } }; const E = entorno(docs);
    await E.run('actualizarEstadoPedidoAdmin("P1","enviado")');
    assert.deepStrictEqual(Object.keys(docs), ['P1']); assert.strictEqual(docs.P1.total, 100); assert.strictEqual(docs.P1.subtotal, 90);
  });
  await t('pedido inexistente: error claro, sin aviso a la hoja', async () => {
    const E = entorno({}); const r = await E.run('actualizarEstadoPedidoAdmin("NOPE","enviado")'); await flush();
    assert.ok(!r.ok && /no existe/i.test(r.msg)); assert.strictEqual(E.avisos.length, 0);
  });
  await t('lectura incluye pedidos antiguos SIN campo "fecha" y ordena nuevo→viejo', async () => {
    const E = entorno({ A: { fecha: '2026-01-01T00:00:00Z' }, B: { fecha: '2026-09-01T00:00:00Z' }, VIEJO: { total: 5 } });
    const l = await E.run('obtenerPedidosAdmin()');
    assert.deepStrictEqual(l.map(p => p.id), ['B', 'A', 'VIEJO']);
  });
  await t('si la lectura falla, se expone el error (no parece "sin pedidos")', async () => {
    const E = entorno({}, { falla: 'permission-denied' });
    const l = await E.run('obtenerPedidosAdmin()');
    assert.strictEqual(l.length, 0); assert.strictEqual(E.run('errorLecturaPedidos && errorLecturaPedidos.code'), 'permission-denied');
  });

  console.log('\nEstado de pago (js/store.js)');
  await t('cambiar el pago: 1 escritura, historial con quién y cuándo, y 1 aviso pedido_pago con el id', async () => {
    const docs = { P1: { estado: 'confirmado', estado_pago: 'por_verificar', total: 100, subtotal: 90, costo_envio: 10 } }; const E = entorno(docs);
    const r = await E.run('actualizarPagoPedidoAdmin("P1","pagado")'); await flush();
    assert.ok(r.ok && !r.sinCambio); assert.strictEqual(E.escrituras(), 1);
    assert.strictEqual(docs.P1.estado_pago, 'pagado'); assert.strictEqual(docs.P1.historial_pagos.length, 1);
    assert.strictEqual(docs.P1.historial_pagos[0].estado_pago, 'pagado'); assert.strictEqual(docs.P1.historial_pagos[0].usuario, 'admin@test'); assert.ok(docs.P1.historial_pagos[0].fecha);
    assert.deepStrictEqual(E.avisos, [{ tipo: 'pedido_pago', id: 'P1', usuario: 'admin@test' }]);
  });
  await t('cambiar el pago NO toca estado, totales ni crea documentos', async () => {
    const docs = { P1: { estado: 'enviado', estado_pago: 'pendiente', total: 100, subtotal: 90, costo_envio: 10 } }; const E = entorno(docs);
    await E.run('actualizarPagoPedidoAdmin("P1","pagado")');
    assert.deepStrictEqual(Object.keys(docs), ['P1']); assert.strictEqual(docs.P1.estado, 'enviado'); assert.strictEqual(docs.P1.total, 100); assert.strictEqual(docs.P1.subtotal, 90); assert.ok(!docs.P1.historial_estados);
  });
  await t('repetir el mismo pago (doble clic): sin escritura, sin aviso, sin historial duplicado', async () => {
    const docs = { P1: { estado: 'pendiente', estado_pago: 'pagado' } }; const E = entorno(docs);
    const r = await E.run('actualizarPagoPedidoAdmin("P1","pagado")'); await flush();
    assert.ok(r.ok && r.sinCambio); assert.strictEqual(E.escrituras(), 0); assert.strictEqual(E.avisos.length, 0); assert.ok(!docs.P1.historial_pagos);
  });
  await t('un estado de pago inválido se rechaza antes de tocar Firestore', async () => {
    const docs = { P1: { estado: 'pendiente', estado_pago: 'pendiente' } }; const E = entorno(docs);
    for (const malo of ['devuelto', '', 'PAGADO', undefined]) { const r = await E.run('actualizarPagoPedidoAdmin("P1",' + JSON.stringify(malo) + ')'); assert.ok(!r.ok); }
    await flush(); assert.strictEqual(E.escrituras(), 0); assert.strictEqual(E.avisos.length, 0);
  });
  await t('pago de un pedido inexistente: error claro y sin aviso', async () => {
    const E = entorno({}); const r = await E.run('actualizarPagoPedidoAdmin("NOPE","pagado")'); await flush();
    assert.ok(!r.ok && /no existe/i.test(r.msg)); assert.strictEqual(E.avisos.length, 0);
  });
  await t('pago sin sesión del panel: se rechaza sin tocar nada', async () => {
    const docs = { P1: { estado: 'pendiente', estado_pago: 'pendiente' } }; const E = entorno(docs);
    E.run('fbAuth.currentUser = null'); const r = await E.run('actualizarPagoPedidoAdmin("P1","pagado")'); await flush();
    assert.ok(!r.ok && /sesi/i.test(r.msg)); assert.strictEqual(E.escrituras(), 0); assert.strictEqual(E.avisos.length, 0);
  });

  console.log('\nSincronizar pedidos con la hoja (js/store.js)');
  const idsDe = n => Array.from({ length: n }, (_, i) => ({ id: ('PEDIDOPRUEBA' + String(i).padStart(8, '0')).slice(0, 20) }));
  await t('con respuesta legible: manda tandas de 8 con el token del admin y suma el resultado real', async () => {
    const E = entorno({}, { leer: b => ({ ok: true, agregados: 1, actualizados: b.ids.length - 1, inexistentes: 0, errores: 0 }) });
    const prog = []; const r = await E.ctx.sincronizarPedidosConHoja(idsDe(20).concat([{ id: 'raro' }, {}, null]), (h, tot) => prog.push([h, tot]));
    assert.ok(r.ok); assert.strictEqual(r.total, 20); assert.strictEqual(r.confirmados, 20); assert.strictEqual(r.sinConfirmar, 0); assert.strictEqual(r.fallidos, 0);
    assert.strictEqual(E.avisos.length, 3); assert.deepStrictEqual(E.avisos.map(a => a.ids.length), [8, 8, 4]);
    E.avisos.forEach(a => { assert.strictEqual(a.tipo, 'pedidos_sincronizar'); assert.strictEqual(a.idToken, 'tok.en.admin'); });
    assert.strictEqual(r.agregados, 3); assert.strictEqual(r.actualizados, 17); assert.deepStrictEqual(prog[prog.length - 1], [20, 20]);
  });
  await t('si el navegador no deja leer la respuesta (CORS): reenvía a ciegas, sin duplicar, y lo dice (sinConfirmar)', async () => {
    const E = entorno({}, { leer: 'bloqueado' });
    const r = await E.ctx.sincronizarPedidosConHoja(idsDe(20));
    assert.ok(r.ok); assert.strictEqual(r.confirmados, 0); assert.strictEqual(r.sinConfirmar, 20); assert.strictEqual(r.fallidos, 0);
    assert.strictEqual(E.avisos.length, 3, 'cada tanda llega una sola vez');
    assert.deepStrictEqual(E.modos, ['cors', 'no-cors', 'no-cors', 'no-cors'], 'solo la primera tanda se intenta con cors; luego ya no insiste');
  });
  await t('si el script devuelve texto que no es JSON (versión vieja): reenvía a ciegas, no inventa resultados', async () => {
    const E = entorno({}, { leer: () => 'ok' });
    const r = await E.ctx.sincronizarPedidosConHoja(idsDe(5));
    assert.ok(r.ok); assert.strictEqual(r.confirmados, 0); assert.strictEqual(r.sinConfirmar, 5); assert.strictEqual(r.agregados, 0);
  });
  await t('si Google rechaza el token: devuelve ok:false con el motivo y no sigue mandando tandas', async () => {
    const E = entorno({}, { leer: () => ({ ok: false, error: 'Sin permiso: entra de nuevo al panel.' }) });
    const r = await E.ctx.sincronizarPedidosConHoja(idsDe(20));
    assert.ok(!r.ok && /Sin permiso/.test(r.msg)); assert.strictEqual(E.avisos.length, 1);
  });
  await t('sin sesión del panel o sin pedidos: no envía nada', async () => {
    const E = entorno({}, { leer: () => ({ ok: true }) });
    assert.strictEqual((await E.ctx.sincronizarPedidosConHoja([])).total, 0);
    E.run('fbAuth.currentUser = null'); const r = await E.ctx.sincronizarPedidosConHoja(idsDe(3));
    assert.ok(!r.ok && /sesi/i.test(r.msg)); assert.strictEqual(E.avisos.length, 0);
  });

  console.log('\nAvisos al Apps Script (seguridad)');
  await t('borrar pedido: el aviso lleva el token del admin', async () => {
    const E = entorno({ P1: { estado: 'pendiente' } });
    const r = await E.run('eliminarPedidoAdmin("P1")'); await flush();
    assert.ok(r.ok); assert.strictEqual(E.avisos.length, 1);
    assert.deepStrictEqual(E.avisos[0], { tipo: 'pedido_eliminado', id: 'P1', idToken: 'tok.en.admin' });
  });
  await t('aviso del drop: lleva token, asunto y mensaje, y NO la lista de correos', async () => {
    const E = entorno({});
    E.run('obtenerSuscriptoresVoltageClub = async () => [{ correo: "a@b.com" }, { correo: "c@d.com" }]');
    const r = await E.run('avisarDropVoltageClub("Drop", "Sale hoy")'); await flush();
    assert.ok(r.ok && r.cantidad === 2); assert.strictEqual(E.avisos.length, 1);
    assert.deepStrictEqual(E.avisos[0], { tipo: 'aviso_drop_nuevo', idToken: 'tok.en.admin', asunto: 'Drop', mensaje: 'Sale hoy' });
    assert.ok(!('correos' in E.avisos[0]));
  });
  await t('aviso del drop sin sesión de admin: no se envía nada', async () => {
    const E = entorno({});
    E.run('obtenerSuscriptoresVoltageClub = async () => [{ correo: "a@b.com" }]; fbAuth.currentUser = null');
    const r = await E.run('avisarDropVoltageClub("Drop", "Sale hoy")'); await flush();
    assert.ok(!r.ok && /sesi/i.test(r.msg)); assert.strictEqual(E.avisos.length, 0);
  });

  console.log(`\n${ok} pruebas OK` + (process.exitCode ? '  —  HAY FALLOS' : ''));
})();
