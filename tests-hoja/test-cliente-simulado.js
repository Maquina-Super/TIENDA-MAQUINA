/* PRUEBA SEGURA del lado navegador (js/store.js) con un Firestore FALSO en memoria.
   No usa red ni credenciales. Uso:  node tests-hoja/test-cliente-simulado.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

function entorno(docs, { falla } = {}) {
  const avisos = []; let escrituras = 0;
  const ref = id => ({ id, _id: id });
  const fbDb = {
    collection: () => ({
      doc: id => ref(id),
      orderBy: () => { throw new Error('ya no se debe usar orderBy en pedidos'); },
      get: async () => { if (falla) throw Object.assign(new Error('x'), { code: falla }); return { docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => ({ ...d }) })) }; },
    }),
    runTransaction: async fn => fn({
      get: async r => ({ exists: !!docs[r.id], data: () => ({ ...docs[r.id] }) }),
      update: (r, c) => { escrituras++; docs[r.id].estado = c.estado; (docs[r.id].historial_estados = docs[r.id].historial_estados || []).push(c.historial_estados.__v); },
    }),
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, head: { appendChild() {} }, readyState: 'complete' },
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fbDb, fbAuth: { currentUser: { uid: 'u1' }, onAuthStateChanged() {} }, crypto: {}, TextEncoder, setTimeout, clearTimeout, setInterval: () => 0, Date, Promise, JSON, Math, Object, Array, Map, Set, String, Number, Error, RegExp, isNaN, parseInt, parseFloat,
    firebase: { firestore: { FieldValue: { arrayUnion: v => ({ __v: v }), increment: n => n, delete: () => null } } },
    fetch: async (url, o) => { avisos.push(JSON.parse(o.body)); },
    navigator: {}, location: { href: '' }, addEventListener() {}, alert() {}, confirm: () => true,
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src.replace(/\bconst APPS_SCRIPT_URL\b/, 'var APPS_SCRIPT_URL') + '\nusuarioAdminActual = () => "admin@test";', ctx);
  return { ctx, avisos, escrituras: () => escrituras, run: c => vm.runInContext(c, ctx) };
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
  console.log(`\n${ok} pruebas OK` + (process.exitCode ? '  —  HAY FALLOS' : ''));
})();
