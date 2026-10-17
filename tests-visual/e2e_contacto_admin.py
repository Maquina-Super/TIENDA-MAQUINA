import json, os, re
from common import *

OUT = os.environ.get('SHOTS', 'capturas')
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  [{detail}]' if detail and not ok else ''))

def regla_contacto_valido(d):
    """Espejo de contactoValido() en firestore.rules"""
    perm = {'nombre','correo','telefono','asunto','mensaje','fecha','origen'}
    req = {'nombre','correo','telefono','asunto','mensaje','fecha'}
    k = set(d.keys())
    return (k <= perm and req <= k
        and isinstance(d['nombre'], str) and 3 <= len(d['nombre']) <= 80
        and isinstance(d['correo'], str) and len(d['correo']) <= 120 and re.match(r'^[^@ ]+@[^@ ]+[.][^@ ]+$', d['correo'])
        and isinstance(d['telefono'], str) and 7 <= len(d['telefono']) <= 20
        and isinstance(d['asunto'], str) and 2 <= len(d['asunto']) <= 60
        and isinstance(d['mensaje'], str) and 10 <= len(d['mensaje']) <= 1000
        and isinstance(d['fecha'], (int, float)))

def llenar(page, nombre='Camila Rodríguez', correo='camila@gmail.com', tel='300 123 4567',
           asunto='Consulta sobre un pedido', msg='Hola, quiero saber el estado de mi pedido por favor.'):
    page.fill('#ctNombre', nombre); page.fill('#ctCorreo', correo)
    page.click('#ctTelefono'); page.keyboard.type(tel.replace(' ', ''), delay=15)
    page.select_option('#ctAsunto', label=asunto)
    page.fill('#ctMensaje', msg); page.check('#ctAceptoChk', force=True)

def run():
    start_server()
    admin_user = {'admin@maquina.com': {'uid': 'uid_admin01', 'email': 'admin@maquina.com', 'pass': 'Admin1234'}}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport=VIEWPORTS['movil'], locale='es-CO')
        page = ctx.new_page(); probe = Probe(); attach(ctx, page, probe)

        print('A) Validaciones del formulario de contacto')
        page.goto(f'{BASE}/servicios.html'); page.wait_for_selector('#formContacto')
        page.evaluate("localStorage.removeItem('maquina_contacto_ultimo')")
        page.click('#ctEnviar'); page.wait_for_timeout(400)
        errs = page.evaluate("[...document.querySelectorAll('.ct-error')].filter(e=>e.textContent.trim()).length")
        check('Envío vacío: marca los 6 campos con error', errs == 6, str(errs))
        check('Envío vacío: aviso general visible', page.locator('#ctAviso').is_visible())
        check('Los campos inválidos tienen aria-invalid', page.evaluate("document.querySelectorAll('[aria-invalid=true]').length") >= 5)
        page.screenshot(path=f'{OUT}/contacto_errores_movil.png')
        # honeypot: no debe guardar nada
        llenar(page); page.evaluate("document.getElementById('ctWeb').value='soy bot'"); page.click('#ctEnviar'); page.wait_for_timeout(800)
        n = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('mensajes_contacto/')])
        check('Honeypot: un bot no guarda nada', n == 0, str(n))
        page.goto(f'{BASE}/servicios.html'); page.wait_for_selector('#formContacto')

        print('B) Fallo de red y reintento sin duplicar')
        llenar(page)
        page.evaluate("window.__FBCFG={failWrites:'unavailable'}")
        page.click('#ctEnviar'); page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/contacto_error_red_movil.png')
        check('Fallo: aviso de error visible y comprensible', page.locator('#ctAviso').is_visible() and len(page.locator('#ctAvisoTxt').inner_text()) > 20, page.locator('#ctAvisoTxt').inner_text())
        check('Fallo: el botón vuelve a estar habilitado', page.locator('#ctEnviar').is_enabled())
        check('Fallo: los datos escritos se conservan', page.input_value('#ctNombre') == 'Camila Rodríguez')
        n = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('mensajes_contacto/')])
        check('Fallo: no se guardó nada', n == 0)
        page.evaluate("window.__FBCFG={}")
        page.click('#ctEnviar'); page.wait_for_selector('#ctCard.enviado', timeout=8000)
        page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/contacto_exito_movil.png')
        codigo = page.locator('#ctCodigo').inner_text()
        check('Éxito: tarjeta de confirmación con código de 6 caracteres', re.match(r'^[A-Z0-9]{6}$', codigo) is not None, codigo)
        db = page.evaluate('window.__FBSTUB.dump()')
        msgs = {k: v for k, v in db['docs'].items() if k.startswith('mensajes_contacto/')}
        check('Se guardó exactamente 1 mensaje en Firestore', len(msgs) == 1, str(len(msgs)))
        mid, m = list(msgs.items())[0] if msgs else ('', {})
        check('El documento cumple las reglas de Firestore (espejo)', m and regla_contacto_valido(m), json.dumps(m, ensure_ascii=False)[:200])
        check('El ID coincide con el código mostrado', mid.split('/')[-1][-6:].upper() == codigo, f"{mid} vs {codigo}")
        check('Teléfono guardado solo con dígitos', m.get('telefono') == '3001234567', str(m.get('telefono')))
        av = [a for a in probe.apps_script if a.get('tipo') == 'contacto_nuevo']
        check('Se avisó UNA vez al Apps Script (tipo contacto_nuevo)', len(av) == 1, str(len(av)))
        if av:
            a = av[0]
            check('Aviso lleva id, código, estado y todos los campos', all(a.get(k) for k in ['id','codigo','estado','nombre','correo','telefono','asunto','mensaje','fecha']), str(list(a.keys())))
        check('Sin errores de JS en el flujo', not probe.page_errors, str(probe.page_errors))

        print('C) Anti-duplicado y espera entre envíos')
        page.click('#ctOtro'); page.wait_for_timeout(300)
        llenar(page, msg='Otro mensaje diferente para probar la espera entre envíos.')
        page.click('#ctEnviar'); page.wait_for_timeout(500)
        txt = page.locator('#ctAvisoTxt').inner_text()
        check('Segundo envío inmediato: pide esperar', 'espera' in txt.lower(), txt)

        print('D) El mensaje aparece en el panel admin y se gestiona')
        ctx.close()
        ctx2 = b.new_context(viewport=VIEWPORTS['escritorio'], locale='es-CO')
        # copiar el estado de Firestore simulado al nuevo contexto (mismo "servidor")
        p2 = ctx2.new_page(); probe2 = Probe(); attach(ctx2, p2, probe2)
        p2.goto(f'{BASE}/admin.html'); p2.wait_for_selector('#formAdminLogin')
        p2.evaluate("""(args)=>{window.__FBSTUB.seed(args.docs, args.users)}""", {'docs': msgs, 'users': admin_user})
        p2.goto(f'{BASE}/admin.html'); p2.wait_for_selector('#formAdminLogin')
        p2.fill('#adminUsuario', 'admin@maquina.com'); p2.fill('#adminClave', 'Admin1234')
        p2.click('.gl-submit'); p2.wait_for_selector('#adminDashView', state='visible', timeout=10000)
        p2.wait_for_timeout(1200)
        p2.screenshot(path=f'{OUT}/admin_resumen_escritorio.png', full_page=False)
        p2.click('#tabBtnMensajes'); p2.wait_for_timeout(1500)
        p2.screenshot(path=f'{OUT}/admin_mensajes_escritorio.png', full_page=True)
        body = p2.locator('#tablaMensajesBody').inner_text()
        check('Panel → Mensajes muestra el mensaje enviado', 'Camila' in body and 'camila@gmail.com' in body, body[:120])
        p2.locator('#tablaMensajesBody tr').first.click(); p2.wait_for_timeout(700)
        check('Detalle muestra el mismo código que vio el cliente', codigo in p2.inner_text('#msgModalTitulo'), p2.inner_text('#msgModalTitulo'))
        p2.screenshot(path=f'{OUT}/admin_mensaje_detalle_escritorio.png')
        check('Detalle del mensaje abre', p2.locator('#msgModalCuerpo').is_visible())
        check('Detalle muestra el texto del mensaje', 'estado de mi pedido' in p2.inner_text('#msgModalCuerpo'))
        p2.keyboard.press('Escape'); p2.wait_for_timeout(300)
        p2.evaluate("document.getElementById('btnSincronizarHoja').click()"); p2.wait_for_timeout(800)
        sync = [a for a in probe2.apps_script if a.get('tipo') == 'contactos_sincronizar']
        check('Sincronizar con la hoja envía el mensaje al Apps Script', sync and len(sync[0].get('contactos', [])) == 1, str(probe2.apps_script)[:200])
        check('Panel sin errores de JS', not probe2.page_errors, str(probe2.page_errors))
        ctx2.close(); b.close()
    bad = [r for r in results if not r[1]]
    print(f'\nRESUMEN contacto/admin: {len(results)-len(bad)}/{len(results)} OK')

if __name__ == '__main__':
    run()
