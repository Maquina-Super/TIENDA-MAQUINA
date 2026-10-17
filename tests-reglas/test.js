const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'maquina-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });

  // Sembrar un producto real, saltándose las reglas (como admin)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('productos').doc('prod1').set({
      nombre: 'Camiseta Voltage',
      categoria: 'Camisetas',
      precio: 90000,
      descuento: 10, // 10% -> precio final 81000
      preciosTalla: { XL: 95000 }, // con descuento -> 85500
      colores: ['#151512'],
      tallas: ['M', 'XL'],
      stock: 20,
      activo: true,
    });
  });

  const cliente = testEnv.unauthenticatedContext();
  const db = cliente.firestore();

  let resultados = [];

  // 1) Pedido con precio CORRECTO (talla M, con descuento 10%: 90000*0.9=81000)
  const pedidoOk = {
    items: [{ id: 'prod1', nombre: 'Camiseta Voltage', talla: 'M', color: '#151512', precio: 81000 }],
    subtotal: 81000, costo_envio: 8000, total: 89000,
    nombre_cliente: 'Juan Pérez', email_cliente: 'juan@correo.com', detalle: 'Camiseta Voltage (M)',
  };
  try { await assertSucceeds(db.collection('pedidos').add(pedidoOk)); resultados.push('✅ Pedido con precio correcto: ACEPTADO (esperado)'); }
  catch (e) { resultados.push('❌ Pedido con precio correcto: RECHAZADO (no debería) -> ' + e.message); }

  // 2) Pedido con precio MANIPULADO (dice que cuesta 1000 en vez de 81000)
  const pedidoManipulado = {
    items: [{ id: 'prod1', nombre: 'Camiseta Voltage', talla: 'M', color: '#151512', precio: 1000 }],
    subtotal: 1000, costo_envio: 8000, total: 9000,
    nombre_cliente: 'Atacante', email_cliente: 'x@x.com', detalle: 'Camiseta Voltage (M)',
  };
  try { await assertFails(db.collection('pedidos').add(pedidoManipulado)); resultados.push('✅ Pedido con precio manipulado: RECHAZADO (esperado)'); }
  catch (e) { resultados.push('❌ Pedido con precio manipulado: ACEPTADO (esto sería el bug) -> ' + e.message); }

  // 3) Pedido con precio de talla especial correcto (XL con precio propio + descuento: 95000*0.9=85500)
  const pedidoTallaEspecial = {
    items: [{ id: 'prod1', nombre: 'Camiseta Voltage', talla: 'XL', color: '#151512', precio: 85500 }],
    subtotal: 85500, costo_envio: 8000, total: 93500,
    nombre_cliente: 'Ana Ruiz', email_cliente: 'ana@correo.com', detalle: 'Camiseta Voltage (XL)',
  };
  try { await assertSucceeds(db.collection('pedidos').add(pedidoTallaEspecial)); resultados.push('✅ Precio por talla (XL) correcto: ACEPTADO (esperado)'); }
  catch (e) { resultados.push('❌ Precio por talla (XL) correcto: RECHAZADO (no debería) -> ' + e.message); }

  // 4) total no cuadra con subtotal+envio
  const pedidoTotalMal = {
    items: [{ id: 'prod1', nombre: 'Camiseta Voltage', talla: 'M', color: '#151512', precio: 81000 }],
    subtotal: 81000, costo_envio: 8000, total: 81000, // total mal calculado
    nombre_cliente: 'Juan', email_cliente: 'juan@correo.com', detalle: 'x',
  };
  try { await assertFails(db.collection('pedidos').add(pedidoTotalMal)); resultados.push('✅ Total mal calculado: RECHAZADO (esperado)'); }
  catch (e) { resultados.push('❌ Total mal calculado: ACEPTADO (esto sería el bug) -> ' + e.message); }

  // 5) producto que no existe (id inventado)
  const pedidoProductoFalso = {
    items: [{ id: 'no-existe', nombre: 'Fantasma', talla: 'M', color: '#000', precio: 1 }],
    subtotal: 1, costo_envio: 0, total: 1,
    nombre_cliente: 'Juan', email_cliente: 'juan@correo.com', detalle: 'x',
  };
  try { await assertFails(db.collection('pedidos').add(pedidoProductoFalso)); resultados.push('✅ Producto inventado: RECHAZADO (esperado)'); }
  catch (e) { resultados.push('❌ Producto inventado: ACEPTADO (esto sería el bug) -> ' + e.message); }

  // 6) más de 8 prendas distintas
  const itemsGrande = Array.from({length: 9}, () => ({ id: 'prod1', nombre: 'x', talla: 'M', color: '#151512', precio: 81000 }));
  const pedidoGrande = {
    items: itemsGrande, subtotal: 81000*9, costo_envio: 0, total: 81000*9,
    nombre_cliente: 'Juan', email_cliente: 'juan@correo.com', detalle: 'x',
  };
  try { await assertFails(db.collection('pedidos').add(pedidoGrande)); resultados.push('✅ Carrito de 9 prendas: RECHAZADO (esperado, límite 8)'); }
  catch (e) { resultados.push('❌ Carrito de 9 prendas: ACEPTADO (esto sería el bug) -> ' + e.message); }

  // 7) voltage_club: correo válido
  try { await assertSucceeds(db.collection('voltage_club').doc('test@correo.com').set({correo:'test@correo.com', fecha: Date.now()})); resultados.push('✅ Suscripción Voltage Club válida: ACEPTADA'); }
  catch (e) { resultados.push('❌ Suscripción Voltage Club válida: RECHAZADA (no debería) -> ' + e.message); }

  // 8) voltage_club: spam sin @ 
  try { await assertFails(db.collection('voltage_club').doc('basura').set({correo:'no-es-correo', fecha: Date.now()})); resultados.push('✅ Suscripción con correo inválido: RECHAZADA (esperado)'); }
  catch (e) { resultados.push('❌ Suscripción con correo inválido: ACEPTADA (esto sería el bug) -> ' + e.message); }

  console.log('\n========== RESULTADOS ==========');
  resultados.forEach(r => console.log(r));
  console.log('=================================\n');

  await testEnv.cleanup();
  process.exit(resultados.some(r => r.startsWith('❌')) ? 1 : 0);
})();
