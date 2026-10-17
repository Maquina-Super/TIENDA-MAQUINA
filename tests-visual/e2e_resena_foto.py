from common import *
R=[]
def check(n,ok,d=''):
    R.append(bool(ok)); print(('  ✓ ' if ok else '  ✗ ')+n+(f'  [{d}]' if d and not ok else ''))
def docs(pg,pref): return {k:v for k,v in pg.evaluate('window.__FBSTUB.dump()')['docs'].items() if k.startswith(pref)}
def run():
    start_server()
    with sync_playwright() as pw:
        b=pw.chromium.launch()
        for vp in ('movil','escritorio'):
            ctx=b.new_context(viewport=VIEWPORTS[vp],locale='es-CO'); pg=ctx.new_page(); pr=Probe(); attach(ctx,pg,pr)
            print('---',vp)
            pg.goto(f'{BASE}/producto.html?id=1'); pg.wait_for_selector('#ydResenaForm')
            pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('yd_resena_')).forEach(k=>localStorage.removeItem(k))")
            pg.reload(); pg.wait_for_selector('#resFotoInput', state='attached')
            ov=pg.evaluate('document.documentElement.scrollWidth>innerWidth'); check('Sin scroll horizontal',not ov)
            inp=pg.locator('#resFotoInput')
            inp.set_input_files('/tmp/f/doc.txt'); pg.wait_for_timeout(200)
            check('Rechaza .txt',('Formato' in pg.locator('#resMsg').inner_text()) and pg.locator('#resFotoPrev').is_hidden())
            inp.set_input_files('/tmp/f/enorme.png'); pg.wait_for_timeout(300)
            check('Rechaza > 5 MB',('5 MB' in pg.locator('#resMsg').inner_text()) and pg.locator('#resFotoPrev').is_hidden(),pg.locator('#resMsg').inner_text())
            inp.set_input_files('/tmp/f/ok.webp'); pg.wait_for_timeout(500)
            check('WEBP válido: vista previa',pg.locator('#resFotoPrev').is_visible())
            pg.click('#resFotoQuitar'); check('Quitar vuelve al botón',pg.locator('#resFotoBtn').is_visible() and pg.locator('#resFotoPrev').is_hidden())
            # sin foto
            pg.click('#resEstrellas button[data-v="4"]'); pg.fill('#resNombre','Ana'); pg.fill('#resComentario','Muy buena prenda sin foto')
            pg.click('#resEnviar'); pg.wait_for_timeout(1500)
            rs=docs(pg,'resenas/'); fs=docs(pg,'resenas_fotos/')
            check('Sin foto: reseña guardada sin con_foto',len(rs)==1 and 'con_foto' not in list(rs.values())[0] and not fs)
            # con foto (producto 2)
            pg.goto(f'{BASE}/producto.html?id=1'); pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('yd_resena_')).forEach(k=>localStorage.removeItem(k))")
            pg.reload(); pg.wait_for_selector('#resFotoInput', state='attached')
            pg.click('#resEstrellas button[data-v="5"]'); pg.fill('#resNombre','Luis'); pg.fill('#resComentario','Me llegó perfecto, miren la foto')
            pg.locator('#resFotoInput').set_input_files('/tmp/f/ruido.png'); pg.wait_for_timeout(1200)
            check('PNG grande aceptado con vista previa',pg.locator('#resFotoPrev').is_visible(),pg.locator('#resMsg').inner_text())
            pg.click('#resEnviar'); pg.wait_for_timeout(1800)
            rs=docs(pg,'resenas/'); fs=docs(pg,'resenas_fotos/')
            conf=[k for k,v in rs.items() if v.get('con_foto')]
            check('Con foto: reseña con_foto=true',len(conf)==1)
            f=list(fs.values())[0]['foto'] if fs else ''
            check('Con foto: foto JPEG <=400000 y mismo id',len(fs)==1 and conf and list(fs)[0].split('/')[1]==conf[0].split('/')[1] and f.startswith('data:image/jpeg;base64,') and len(f)<=400000,str(len(f)))
            pg.reload(); pg.wait_for_selector('.yd-resena-foto img',timeout=6000)
            check('La foto se ve en la reseña publicada',pg.locator('.yd-resena-foto img').count()==1)
            pg.locator('.yd-resena-foto').click(); pg.wait_for_selector('.yd-resena-lightbox')
            check('Al tocarla se amplía',True); pg.keyboard.press('Escape')
            check('Escape cierra la foto grande',pg.locator('.yd-resena-lightbox').count()==0)
            pg.screenshot(path=f'/tmp/resena_{vp}.png')
            check('Sin errores de JS',not pr.page_errors,str(pr.page_errors))
            ctx.close()
        b.close()
    print(f'\n{sum(R)}/{len(R)} OK'); raise SystemExit(0 if all(R) else 1)
run()
