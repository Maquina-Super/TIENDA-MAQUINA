import json, os, sys
from common import *
OUT = os.environ.get('SHOTS','capturas')
CART = [
 {"id":1,"nombre":"Buso Volt","categoria":"Busos","precio":189900,"icono":"hoodie","foto":None,"color":"#151512","talla":"M"},
 {"id":1,"nombre":"Buso Volt","categoria":"Busos","precio":189900,"icono":"hoodie","foto":None,"color":"#151512","talla":"M"},
 {"id":4,"nombre":"Camiseta Bolt","categoria":"Camisetas","precio":79900,"icono":"tee","foto":None,"color":"#faf9f5","talla":"L"},
]
if __name__=='__main__':
    start_server()
    with sync_playwright() as pw:
        for vp in ('movil','tablet','escritorio'):
            b, ctx, page, probe = launch(pw, vp)
            page.goto(f'{BASE}/index.html'); page.evaluate("c=>localStorage.setItem('maquina_carrito',JSON.stringify(c))", CART)
            page.goto(f'{BASE}/carrito.html'); page.wait_for_timeout(1800)
            page.screenshot(path=f'{OUT}/carrito_lleno_{vp}.png', full_page=True)
            print(vp, 'console:', probe.console_errors[:3], 'pageerr:', probe.page_errors[:3])
            b.close()
