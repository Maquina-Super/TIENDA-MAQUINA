import os
from common import *
OUT = os.environ.get('SHOTS', 'capturas'); os.makedirs(OUT, exist_ok=True)
R = []
def check(n, ok, d=''):
    R.append(bool(ok)); print(('  ✓ ' if ok else '  ✗ ') + n + (f'  [{d}]' if d and not ok else ''))
def llenar(page):
    page.fill('#ctNombre', 'Camila Rodríguez'); page.fill('#ctCorreo', 'camila@gmail.com')
    page.click('#ctTelefono'); page.keyboard.type('3001234567', delay=10)
    page.select_option('#ctAsunto', label='Consulta sobre un pedido')
    page.fill('#ctMensaje', 'Hola, quiero saber el estado de mi pedido por favor.'); page.check('#ctAceptoChk', force=True)
def docs(page): return {k: v for k, v in page.evaluate('window.__FBSTUB.dump()')['docs'].items() if k.startswith('mensajes_contacto')}
def run():
    start_server()
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for vp in ('movil', 'escritorio'):
            ctx = b.new_context(viewport=VIEWPORTS[vp], locale='es-CO'); page = ctx.new_page(); probe = Probe(); attach(ctx, page, probe)
            print(f'--- {vp}')
            page.goto(f'{BASE}/servicios.html'); page.wait_for_selector('#formContacto')
            page.evaluate("localStorage.removeItem('maquina_contacto_ultimo')")
            ov = page.evaluate('document.documentElement.scrollWidth > innerWidth')
            check('Sin scroll horizontal', not ov)
            inp = page.locator('#ctFotoInput')
            inp.set_input_files('/tmp/f/doc.txt'); page.wait_for_timeout(200)
            check('Rechaza .txt', 'Formato' in page.locator('#ctFotoErr').inner_text() and page.locator('#ctFotoPrev').is_hidden())
            inp.set_input_files('/tmp/f/enorme.png'); page.wait_for_timeout(300)
            check('Rechaza > 5 MB', '5 MB' in page.locator('#ctFotoErr').inner_text() and page.locator('#ctFotoPrev').is_hidden(), page.locator('#ctFotoErr').inner_text())
            inp.set_input_files('/tmp/f/ok.webp'); page.wait_for_timeout(500)
            check('WEBP válido: vista previa + sin error', page.locator('#ctFotoPrev').is_visible() and page.locator('#ctFotoErr').inner_text() == '')
            page.locator('#ctFotoQuitar').click()
            check('Quitar foto vuelve al estado inicial', page.locator('#ctFotoVacia').is_visible() and page.locator('#ctFotoPrev').is_hidden())
            # ---- SIN foto
            llenar(page); page.click('#ctEnviar'); page.wait_for_timeout(1200)
            d = docs(page); msg = [v for k, v in d.items() if k.startswith('mensajes_contacto/')]
            check('Sin foto: se guarda el mensaje', len(msg) == 1 and 'con_foto' not in msg[0])
            check('Sin foto: no crea documento de foto', not [k for k in d if k.startswith('mensajes_contacto_fotos/')])
            check('Sin foto: pantalla de éxito', 'enviado' in (page.get_attribute('#ctCard', 'class') or ''))
            # ---- CON foto (JPG, 2400x1800 ruidoso → debe reducirse)
            page.evaluate("localStorage.removeItem('maquina_contacto_ultimo')")
            page.click('#ctOtro'); page.wait_for_timeout(200)
            check('Reiniciar limpia la foto', page.locator('#ctFotoPrev').is_hidden())
            llenar(page); page.fill('#ctMensaje', 'Mensaje con foto adjunta para revisar la prenda.')
            inp.set_input_files('/tmp/f/ruido.png'); page.wait_for_timeout(900)
            check('PNG grande aceptado con vista previa', page.locator('#ctFotoPrev').is_visible(), page.locator('#ctFotoErr').inner_text())
            page.screenshot(path=f'{OUT}/contacto_foto_{vp}.png', full_page=False)
            page.click('#ctEnviar'); page.wait_for_timeout(1500)
            d = docs(page)
            msgs = [(k, v) for k, v in d.items() if k.startswith('mensajes_contacto/') and v.get('con_foto')]
            fotos = [(k, v) for k, v in d.items() if k.startswith('mensajes_contacto_fotos/')]
            check('Con foto: mensaje con con_foto=true', len(msgs) == 1)
            check('Con foto: foto guardada con el mismo id', len(fotos) == 1 and msgs and fotos[0][0].split('/')[1] == msgs[0][0].split('/')[1])
            f = fotos[0][1]['foto'] if fotos else ''
            check('Foto es JPEG y <= 700000 caracteres (regla)', f.startswith('data:image/jpeg;base64,') and len(f) <= 700000, str(len(f)))
            check('Con foto: pantalla de éxito', 'enviado' in (page.get_attribute('#ctCard', 'class') or ''))
            check('Sin errores de consola', not probe.page_errors, str(probe.page_errors))
            ctx.close()
        b.close()
    print(f'\n{sum(R)}/{len(R)} OK'); raise SystemExit(0 if all(R) else 1)
run()
