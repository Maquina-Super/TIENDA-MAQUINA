// Prueba de las reglas de "mensajes_contacto". Se corre igual que test.js (ver LEEME.txt):
//   npx firebase emulators:exec --only firestore "node test-contacto.js"
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
(async () => {
  const env = await initializeTestEnvironment({ projectId:'maquina-test', firestore:{ rules: fs.readFileSync('firestore.rules','utf8'), host:'localhost', port:8080 }});
  const db = env.unauthenticatedContext().firestore();
  const ok = { nombre:'Camila Rodríguez', correo:'camila@gmail.com', telefono:'3001234567', asunto:'Pagos', mensaje:'Hola, tengo una duda con mi pedido.', fecha:Date.now(), origen:'servicios.html' };
  const R=[]; const t=async(n,p)=>{ try{ await p; R.push(['✅',n]) }catch(e){ R.push(['❌',n+' -> '+String(e.message).slice(0,90)]) } };
  const col=()=>db.collection('mensajes_contacto');

  await t('mensaje válido se puede crear', assertSucceeds(col().doc('m1').set(ok)));
  await t('reintento IDÉNTICO (mismo id, mismos datos) pasa', assertSucceeds(col().doc('m1').set(ok)));
  await t('modificar un mensaje ya enviado se rechaza', assertFails(col().doc('m1').set({...ok, mensaje:'Cambiado por alguien más.'})));
  await t('sin campo "origen" también es válido', (()=>{const {origen,...x}=ok; return assertSucceeds(col().doc('m2').set(x));})());
  await t('campo extra no permitido se rechaza', assertFails(col().doc('m3').set({...ok, admin:true})));
  await t('falta un campo obligatorio se rechaza', (()=>{const {telefono,...x}=ok; return assertFails(col().doc('m4').set(x));})());
  await t('correo inválido se rechaza', assertFails(col().doc('m5').set({...ok, correo:'sin-arroba'})));
  await t('correo con espacios se rechaza', assertFails(col().doc('m5b').set({...ok, correo:'a b@x.com'})));
  await t('nombre demasiado largo se rechaza', assertFails(col().doc('m6').set({...ok, nombre:'x'.repeat(81)})));
  await t('mensaje corto (<10) se rechaza', assertFails(col().doc('m7').set({...ok, mensaje:'hola'})));
  await t('mensaje gigante (>1000) se rechaza', assertFails(col().doc('m8').set({...ok, mensaje:'a'.repeat(1001)})));
  await t('mensaje de exactamente 1000 pasa', assertSucceeds(col().doc('m9').set({...ok, mensaje:'a'.repeat(1000)})));
  await t('tipos incorrectos (fecha string) se rechaza', assertFails(col().doc('m10').set({...ok, fecha:'hoy'})));
  await t('un visitante NO puede leer un mensaje', assertFails(col().doc('m1').get()));
  await t('un visitante NO puede listar mensajes', assertFails(col().get()));
  await t('un visitante NO puede borrar', assertFails(col().doc('m1').delete()));
  // regresión: las reglas de otras colecciones siguen igual
  await t('(regresión) voltage_club sigue abierto para crear', assertSucceeds(db.collection('voltage_club').doc('a@b.com').set({correo:'a@b.com',fecha:1})));
  await t('(regresión) voltage_club sigue cerrado para leer', assertFails(db.collection('voltage_club').get()));
  await t('(regresión) pedidos sigue cerrado para listar', assertFails(db.collection('pedidos').get()));
  R.forEach(r=>console.log(r.join(' ')));
  console.log('\nFALLAS:', R.filter(r=>r[0]==='❌').length, 'de', R.length);
  await env.cleanup();
})();
