// Prueba de las reglas de PERMISOS del panel (eliminar pedidos, usuarios) y de stock_devuelto. Se corre igual que test.js:
//   npx firebase emulators:exec --only firestore "node test-permisos.js"
// Siembra datos de PRUEBA en el emulador (nunca toca datos reales).
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'maquina-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 } });
  const DUENIO = '8CBfiOxDeda0MmtTmSlXYIkfbx82';      // admin de respaldo (firestore.rules)
  const LIMITADO = 'uidLimitado0000000000';            // admin SIN eliminarPedidos ni usuarios
  const ELIMINA = 'uidElimina000000000000';            // admin con eliminarPedidos
  const GESTOR = 'uidGestor00000000000000';            // admin con usuarios
  const ANTIGUO = 'uidAntiguo0000000000000';           // perfil viejo, sin campo "permisos" (acceso total)
  const pedido = (extra) => ({
    nombre_cliente: 'Cliente Prueba', email_cliente: 'prueba@correo.com', telefono_cliente: '3001234567', metodo_pago: 'contraentrega',
    envio_direccion: 'Calle 1 # 2-3', envio_municipio: 'Medellín', costo_envio: 10000, subtotal: 81000, total: 91000,
    items: [{ id: 'prod1', nombre: 'Camiseta', talla: 'M', color: '#151512', precio: 81000 }], detalle: 'Camiseta (M)',
    fecha: '2026-10-01T10:00:00.000Z', estado: 'pendiente', estado_pago: 'pendiente', ...extra,
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('admin_config').doc('admins').set({ uids: [LIMITADO, ELIMINA, GESTOR, ANTIGUO] });
    await db.collection('admin_usuarios').doc(LIMITADO).set({ correo: 'l@x.com', activo: true, permisos: { pedidos: true, eliminarPedidos: false, usuarios: false } });
    await db.collection('admin_usuarios').doc(ELIMINA).set({ correo: 'e@x.com', activo: true, permisos: { pedidos: true, eliminarPedidos: true, usuarios: false } });
    await db.collection('admin_usuarios').doc(GESTOR).set({ correo: 'g@x.com', activo: true, permisos: { pedidos: true, eliminarPedidos: false, usuarios: true } });
    await db.collection('admin_usuarios').doc(ANTIGUO).set({ correo: 'a@x.com', activo: true });
    await db.collection('admin_usuarios').doc(DUENIO).set({ correo: 'd@x.com', activo: true, superAdmin: true, permisos: { usuarios: true } });
    for (const id of ['AbCdEfGhIjKlMnOpQrS1', 'AbCdEfGhIjKlMnOpQrS2', 'AbCdEfGhIjKlMnOpQrS3', 'AbCdEfGhIjKlMnOpQrS4', 'AbCdEfGhIjKlMnOpQrS5']) {
      await db.collection('pedidos').doc(id).set(pedido());
    }
    await db.collection('productos').doc('prod1').set({ nombre: 'Camiseta', stock: 5 });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const R = []; const t = async (n, p) => { try { await p; R.push(['✅', n]); } catch (e) { R.push(['❌', n + ' -> ' + String(e.message).slice(0, 90)]); } };
  const ped = (db, n) => db.collection('pedidos').doc('AbCdEfGhIjKlMnOpQrS' + n);

  // ---- eliminar pedidos ----
  await t('logueado que NO es admin NO borra pedidos', assertFails(ped(as('uid-cualquiera'), 1).delete()));
  await t('admin SIN permiso eliminarPedidos NO borra (aunque use la consola)', assertFails(ped(as(LIMITADO), 1).delete()));
  await t('admin con permiso eliminarPedidos SÍ borra', assertSucceeds(ped(as(ELIMINA), 1).delete()));
  await t('admin con perfil antiguo (sin "permisos") SÍ borra', assertSucceeds(ped(as(ANTIGUO), 2).delete()));
  await t('dueño SÍ borra', assertSucceeds(ped(as(DUENIO), 3).delete()));

  // ---- stock_devuelto en pedidos ----
  await t('admin: cancelar + stock_devuelto=true pasa', assertSucceeds(ped(as(LIMITADO), 4).update({ estado: 'cancelado', stock_devuelto: true })));
  await t('admin: stock_devuelto que no es booleano se rechaza', assertFails(ped(as(LIMITADO), 5).update({ estado: 'cancelado', stock_devuelto: 'si' })));
  await t('admin: NO puede agregar otros campos nuevos', assertFails(ped(as(LIMITADO), 5).update({ estado: 'cancelado', campo_extra: 1 })));
  await t('admin: puede devolver stock al producto (lo que hace el panel)', assertSucceeds(as(LIMITADO).collection('productos').doc('prod1').update({ stock: 6 })));

  // ---- que un admin no se de más permisos ----
  const miPerfil = (uid) => as(uid).collection('admin_usuarios').doc(uid);
  await t('admin limitado NO puede darse permisos a sí mismo', assertFails(miPerfil(LIMITADO).update({ permisos: { pedidos: true, eliminarPedidos: true, usuarios: true } })));
  await t('admin limitado NO puede borrar su propio perfil (para recrearlo)', assertFails(miPerfil(LIMITADO).delete()));
  await t('admin limitado SÍ puede guardar sus contadores de intentos', assertSucceeds(miPerfil(LIMITADO).update({ devIntentosFallidos: 1 })));
  await t('admin limitado NO puede escribir admin_config (agregar admins)', assertFails(as(LIMITADO).collection('admin_config').doc('admins').set({ uids: [LIMITADO, 'otro'] })));
  await t('admin limitado NO puede escribir panel_codigos', assertFails(as(LIMITADO).collection('panel_codigos').doc('x@x.com').set({ codigo: '123456', uid: 'x' })));
  await t('admin limitado NO puede editar el perfil de otro', assertFails(as(LIMITADO).collection('admin_usuarios').doc(ELIMINA).update({ permisos: { eliminarPedidos: false } })));

  // ---- gestión de usuarios (permiso "usuarios") ----
  await t('admin con permiso usuarios SÍ edita permisos de otro', assertSucceeds(as(GESTOR).collection('admin_usuarios').doc(LIMITADO).update({ permisos: { pedidos: true, eliminarPedidos: false, usuarios: false } })));
  await t('admin con permiso usuarios NO se da permisos a sí mismo', assertFails(miPerfil(GESTOR).update({ permisos: { pedidos: true, eliminarPedidos: true, usuarios: true } })));
  await t('admin con permiso usuarios NO toca el perfil de un dueño', assertFails(as(GESTOR).collection('admin_usuarios').doc(DUENIO).update({ activo: false })));
  await t('admin con permiso usuarios SÍ agrega admins a admin_config', assertSucceeds(as(GESTOR).collection('admin_config').doc('admins').set({ uids: [LIMITADO, ELIMINA, GESTOR, ANTIGUO, 'nuevo'] })));
  await t('dueño SÍ edita el perfil de otro', assertSucceeds(as(DUENIO).collection('admin_usuarios').doc(GESTOR).update({ activo: true })));

  console.log(R.map(r => r.join(' ')).join('\n'));
  await env.cleanup();
  process.exit(R.some(r => r[0] === '❌') ? 1 : 0);
})();
