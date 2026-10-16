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
  const fcol=()=>db.collection('mensajes_contacto_fotos'); const jpg='data:image/jpeg;base64,'+'A'.repeat(1000);
  await t('mensaje con con_foto=true pasa', assertSucceeds(col().doc('f1').set({...ok, con_foto:true})));
  await t('con_foto=false se rechaza', assertFails(col().doc('f2').set({...ok, con_foto:false})));
  await t('foto JPEG válida se puede crear', assertSucceeds(fcol().doc('f1').set({foto:jpg, fecha:Date.now()})));
  await t('foto que no es JPEG se rechaza', assertFails(fcol().doc('f3').set({foto:'data:text/html;base64,AAAA', fecha:Date.now()})));
  await t('foto > 700000 se rechaza', assertFails(fcol().doc('f4').set({foto:'data:image/jpeg;base64,'+'A'.repeat(700001), fecha:Date.now()})));
  await t('un visitante NO puede leer fotos', assertFails(fcol().doc('f1').get()));
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
  // ---- Gestión desde el panel (admin) ----
  const admin = env.authenticatedContext('8CBfiOxDeda0MmtTmSlXYIkfbx82').firestore();   // admin de respaldo
  const otro  = env.authenticatedContext('uid-cualquiera').firestore();                  // usuario logueado que NO es admin
  const acol = () => admin.collection('mensajes_contacto');
  const ahora = new Date().toISOString();
  await t('admin SÍ puede listar los mensajes', assertSucceeds(acol().orderBy('fecha','desc').limit(1000).get()));
  await t('admin SÍ puede leer un mensaje', assertSucceeds(acol().doc('m1').get()));
  await t('un usuario logueado que NO es admin NO puede listar', assertFails(otro.collection('mensajes_contacto').get()));
  await t('admin: marcar leído + estado "en_revision" + historial', assertSucceeds(acol().doc('m1').update({ leido:true, estado:'en_revision', estado_fecha:ahora, estado_por:'8CBf', historial_estados:[{estado:'en_revision', usuario:'8CBf', fecha:ahora}] })));
  await t('admin: estado "respondido"', assertSucceeds(acol().doc('m1').update({ estado:'respondido', leido:true })));
  await t('admin: estado inventado se rechaza', assertFails(acol().doc('m1').update({ estado:'borrado' })));
  await t('admin: "leido" que no es booleano se rechaza', assertFails(acol().doc('m1').update({ leido:'si' })));
  await t('admin NO puede cambiar lo que escribió el cliente (mensaje)', assertFails(acol().doc('m1').update({ mensaje:'Texto cambiado por un admin' })));
  await t('admin NO puede cambiar el correo del cliente', assertFails(acol().doc('m1').update({ correo:'otro@x.com' })));
  await t('admin NO puede agregar campos raros', assertFails(acol().doc('m1').update({ superadmin:true })));
  await t('un visitante NO puede cambiar el estado', assertFails(col().doc('m1').update({ estado:'respondido' })));
  await t('un usuario logueado que NO es admin NO puede cambiar el estado', assertFails(otro.collection('mensajes_contacto').doc('m1').update({ estado:'respondido' })));
  await t('admin SÍ puede borrar', assertSucceeds(acol().doc('m2').delete()));

  // regresión: las reglas de otras colecciones siguen igual
  await t('(regresión) voltage_club sigue abierto para crear', assertSucceeds(db.collection('voltage_club').doc('a@b.com').set({correo:'a@b.com',fecha:1})));
  await t('(regresión) voltage_club sigue cerrado para leer', assertFails(db.collection('voltage_club').get()));
  await t('(regresión) pedidos sigue cerrado para listar', assertFails(db.collection('pedidos').get()));
  R.forEach(r=>console.log(r.join(' ')));
  console.log('\nFALLAS:', R.filter(r=>r[0]==='❌').length, 'de', R.length);
  await env.cleanup();
})();
