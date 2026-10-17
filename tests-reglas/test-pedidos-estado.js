// Prueba de las reglas de UPDATE en "pedidos" (gestionPedidoValida). Se corre igual que test.js (ver LEEME.txt):
//   npx firebase emulators:exec --only firestore "node test-pedidos-estado.js"
// Siembra un pedido de PRUEBA en el emulador (nunca toca datos reales).
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'maquina-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 } });
  const ID = 'AbCdEfGhIjKlMnOpQrSt';
  const pedido = {
    nombre_cliente: 'Cliente Prueba', email_cliente: 'prueba@correo.com', telefono_cliente: '3001234567', metodo_pago: 'pse',
    envio_direccion: 'Calle 1 # 2-3', envio_municipio: 'Medellín', costo_envio: 10000, subtotal: 81000, total: 91000,
    items: [{ id: 'prod1', nombre: 'Camiseta', talla: 'M', color: '#151512', precio: 81000 }], detalle: 'Camiseta (M)',
    fecha: '2026-10-01T10:00:00.000Z', estado: 'pendiente', estado_pago: 'por_verificar',
    historial_estados: [{ estado: 'pendiente', usuario: 'sistema', fecha: '2026-10-01T10:00:00.000Z' }],
  };
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().collection('pedidos').doc(ID).set(pedido); });

  const admin = env.authenticatedContext('8CBfiOxDeda0MmtTmSlXYIkfbx82').firestore();   // admin de respaldo (firestore.rules)
  const otro  = env.authenticatedContext('uid-cualquiera').firestore();                  // logueado, NO admin
  const visita = env.unauthenticatedContext().firestore();
  const ref = (db) => db.collection('pedidos').doc(ID);
  const hist = pedido.historial_estados;
  const nueva = { estado: 'confirmado', usuario: 'admin', fecha: '2026-10-02T10:00:00.000Z' };
  const R = []; const t = async (n, p) => { try { await p; R.push(['✅', n]); } catch (e) { R.push(['❌', n + ' -> ' + String(e.message).slice(0, 90)]); } };

  await t('visitante NO puede cambiar el estado', assertFails(ref(visita).update({ estado: 'confirmado', historial_estados: [...hist, nueva] })));
  await t('usuario logueado que NO es admin NO puede cambiar el estado', assertFails(ref(otro).update({ estado: 'confirmado', historial_estados: [...hist, nueva] })));
  await t('admin: cambiar estado + historial (lo que hace el panel) pasa', assertSucceeds(ref(admin).update({ estado: 'confirmado', historial_estados: [...hist, nueva] })));
  await t('admin: estado fuera del flujo ("pagado") se rechaza', assertFails(ref(admin).update({ estado: 'pagado' })));
  const pago = { estado_pago: 'pagado', usuario: 'admin', fecha: '2026-10-03T10:00:00.000Z' };
  await t('visitante NO puede marcar el pago', assertFails(ref(visita).update({ estado_pago: 'pagado', historial_pagos: [pago] })));
  await t('usuario logueado que NO es admin NO puede marcar el pago', assertFails(ref(otro).update({ estado_pago: 'pagado', historial_pagos: [pago] })));
  await t('admin: marcar el pago + historial_pagos (lo que hace el panel) pasa', assertSucceeds(ref(admin).update({ estado_pago: 'pagado', historial_pagos: [pago] })));
  await t('admin: estado de pago fuera de la lista se rechaza', assertFails(ref(admin).update({ estado_pago: 'devuelto' })));
  await t('admin: NO puede borrar entradas del historial de pagos', assertFails(ref(admin).update({ estado_pago: 'por_verificar', historial_pagos: [] })));
  await t('admin: NO puede reescribir una entrada vieja del historial de pagos', assertFails(ref(admin).update({ estado_pago: 'por_verificar', historial_pagos: [{ ...pago, usuario: 'otro' }] })));
  await t('admin: NO puede cambiar el pago junto con el total', assertFails(ref(admin).update({ estado_pago: 'pendiente', total: 1 })));
  await t('admin: puede devolver el pago a por_verificar (queda en el historial)', assertSucceeds(ref(admin).update({ estado_pago: 'por_verificar', historial_pagos: [pago, { estado_pago: 'por_verificar', usuario: 'admin', fecha: '2026-10-04T10:00:00.000Z' }] })));
  await t('admin: historial de pagos gigante (>200) se rechaza', assertFails(ref(admin).update({ estado_pago: 'pagado', historial_pagos: Array.from({ length: 201 }, (_, i) => ({ estado_pago: 'pagado', usuario: 'x', fecha: 'f' + i })) })));
  await t('admin: NO puede cambiar el total', assertFails(ref(admin).update({ total: 1 })));
  await t('admin: NO puede cambiar el subtotal ni el envío', assertFails(ref(admin).update({ subtotal: 1, costo_envio: 0 })));
  await t('admin: NO puede cambiar los productos/precios', assertFails(ref(admin).update({ items: [{ id: 'prod1', nombre: 'Camiseta', talla: 'M', color: '#151512', precio: 1 }] })));
  await t('admin: NO puede cambiar datos del cliente', assertFails(ref(admin).update({ nombre_cliente: 'Otro', email_cliente: 'otro@x.com' })));
  await t('admin: NO puede agregar campos nuevos', assertFails(ref(admin).update({ estado: 'enviado', campo_extra: true })));
  await t('admin: NO puede borrar entradas del historial', assertFails(ref(admin).update({ estado: 'enviado', historial_estados: [] })));
  await t('admin: NO puede reescribir una entrada vieja del historial', assertFails(ref(admin).update({ estado: 'enviado', historial_estados: [{ ...hist[0], usuario: 'otro' }, nueva] })));
  await t('admin: historial gigante (>200) se rechaza', assertFails(ref(admin).update({ estado: 'enviado', historial_estados: [...hist, nueva, ...Array.from({ length: 201 }, (_, i) => ({ estado: 'enviado', usuario: 'x', fecha: 'f' + i }))] })));
  await t('admin: sigue pudiendo cancelar (estado válido)', assertSucceeds(ref(admin).update({ estado: 'cancelado' })));

  console.log(R.map(r => r.join(' ')).join('\n'));
  await env.cleanup();
  process.exit(R.some(r => r[0] === '❌') ? 1 : 0);
})();
