// Prueba de las reglas de ventas y conversión: "envío gratis desde $X" (pedidos) y "avisos_stock" (lista de espera).
// Se corre igual que test.js (ver LEEME.txt):
//   npx firebase emulators:exec --only firestore "node test-conversion.js"
// Siembra datos de PRUEBA en el emulador (nunca toca datos reales).
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'maquina-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 } });
  const DUENIO = '8CBfiOxDeda0MmtTmSlXYIkfbx82';   // admin de respaldo (firestore.rules)
  const R = []; const t = async (n, p) => { try { await p; R.push(['✅', n]); } catch (e) { R.push(['❌', n + ' -> ' + String(e.message).slice(0, 110)]); } };
  const sembrarEnvio = (cfg) => env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().collection('config').doc('envio').set(cfg); });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('productos').doc('prod1').set({ nombre: 'Camiseta Voltage', categoria: 'Camisetas', precio: 90000, descuento: 10, colores: ['#151512'], tallas: ['M'], stock: 20, activo: true });
  });
  const db = env.unauthenticatedContext().firestore();
  const item = { id: 'prod1', nombre: 'Camiseta Voltage', talla: 'M', color: '#151512', precio: 81000 };
  const cliente = { nombre_cliente: 'Juan Pérez', email_cliente: 'juan@correo.com', detalle: 'Camiseta Voltage (M)' };
  const pedido = (n, envio) => ({ ...cliente, items: Array(n).fill(item), subtotal: 81000 * n, costo_envio: envio, total: 81000 * n + envio });

  // ---------- envío gratis por monto ----------
  console.log('ENVÍO GRATIS POR MONTO');
  await sembrarEnvio({ costos: [8000, 10000], gratisDesde: 100000 });
  await t('subtotal 81.000 (< 100.000) con envío 0: se rechaza', assertFails(db.collection('pedidos').add(pedido(1, 0))));
  await t('subtotal 162.000 (>= 100.000) con envío 0: se acepta', assertSucceeds(db.collection('pedidos').add(pedido(2, 0))));
  await t('subtotal 162.000 con envío normal 8.000: se acepta', assertSucceeds(db.collection('pedidos').add(pedido(2, 8000))));
  await t('envío inventado 3.000 (no está en la lista): se rechaza', assertFails(db.collection('pedidos').add(pedido(2, 3000))));
  await sembrarEnvio({ costos: [8000, 10000] });
  await t('sin "gratisDesde" configurado: envío 0 se rechaza', assertFails(db.collection('pedidos').add(pedido(2, 0))));
  await sembrarEnvio({ costos: [8000, 10000], gratisDesde: 0 });
  await t('gratisDesde = 0 (desactivado): envío 0 se rechaza', assertFails(db.collection('pedidos').add(pedido(2, 0))));
  await sembrarEnvio({ costos: [8000, 0], gratisDesde: 100000 });
  await t('si una ciudad ya es gratis (0 en costos): envío 0 sigue aceptado', assertSucceeds(db.collection('pedidos').add(pedido(1, 0))));
  await t('un cliente NO puede cambiar config/envio', assertFails(db.collection('config').doc('envio').set({ costos: [0], gratisDesde: 1 })));

  // ---------- lista de espera (avisos_stock) ----------
  console.log('LISTA DE ESPERA (avisos_stock)');
  const aviso = (extra) => ({ producto_id: 'prod1', correo: 'camila@gmail.com', talla: 'M', color: '#151512', fecha: Date.now(), notificado: false, ...extra });
  const col = () => db.collection('avisos_stock');
  await t('aviso válido se puede crear', assertSucceeds(col().doc('prod1__camila@gmail.com').set(aviso())));
  await t('renovar el MISMO aviso (nueva fecha) pasa: pedirlo dos veces no falla', assertSucceeds(col().doc('prod1__camila@gmail.com').set(aviso({ fecha: Date.now() + 1000 }))));
  await t('cambiar el correo de un aviso ya creado se rechaza', assertFails(col().doc('prod1__camila@gmail.com').set(aviso({ correo: 'otro@correo.com' }))));
  await t('cambiar el producto de un aviso ya creado se rechaza', assertFails(col().doc('prod1__camila@gmail.com').set(aviso({ producto_id: 'prod2' }))));
  await t('correo inválido se rechaza', assertFails(col().doc('a2').set(aviso({ correo: 'sin-arroba' }))));
  await t('producto que no existe se rechaza', assertFails(col().doc('a3').set(aviso({ producto_id: 'no-existe' }))));
  await t('campo extra no permitido se rechaza', assertFails(col().doc('a4').set(aviso({ admin: true }))));
  await t('notificado=true al crear se rechaza', assertFails(col().doc('a5').set(aviso({ notificado: true }))));
  await t('falta "notificado" se rechaza', (() => { const { notificado, ...x } = aviso(); return assertFails(col().doc('a6').set(x)); })());
  await t('correo de más de 160 caracteres se rechaza', assertFails(col().doc('a7').set(aviso({ correo: 'a'.repeat(160) + '@x.co' }))));
  await t('sin talla ni color también es válido', (() => { const { talla, color, ...x } = aviso({ correo: 'sin@variante.co' }); return assertSucceeds(col().doc('a8').set(x)); })());
  await t('un visitante NO puede leer un aviso', assertFails(col().doc('prod1__camila@gmail.com').get()));
  await t('un visitante NO puede listar los avisos', assertFails(col().get()));
  await t('un visitante NO puede borrar un aviso', assertFails(col().doc('prod1__camila@gmail.com').delete()));
  const admin = env.authenticatedContext(DUENIO).firestore();
  await t('el admin SÍ puede listar los avisos', assertSucceeds(admin.collection('avisos_stock').get()));
  await t('el admin SÍ puede marcar un aviso como notificado', assertSucceeds(admin.collection('avisos_stock').doc('prod1__camila@gmail.com').update({ notificado: true, notificado_fecha: Date.now() })));
  await t('tras notificar, el cliente puede volver a pedir aviso (re-activa)', assertSucceeds(col().doc('prod1__camila@gmail.com').set(aviso({ fecha: Date.now() + 5000 }))));
  await t('el admin SÍ puede borrar un aviso', assertSucceeds(admin.collection('avisos_stock').doc('a8').delete()));

  R.forEach(r => console.log(r[0], r[1]));
  const mal = R.filter(r => r[0] === '❌').length;
  console.log(`\nRESUMEN reglas de conversión: ${R.length - mal}/${R.length} OK`);
  await env.cleanup(); process.exit(mal ? 1 : 0);
})();
