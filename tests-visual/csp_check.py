"""Revisa que la Content-Security-Policy de cada página no bloquee nada propio.
Carga las páginas con Firebase simulado y falla si el navegador reporta violaciones de CSP.
Ejecutar:  python3 csp_check.py      (límite: no prueba Firebase/reCAPTCHA reales, ver LEEME.txt)"""
import sys
from common import *

PAGES = ['index.html','productos.html','categorias.html','catalogo.html','favoritos.html','producto.html?id=1',
         'quienes-somos.html','servicios.html','carrito.html','seguimiento.html','legal.html','login.html',
         'registro.html','recuperar.html','admin.html','404.html']

def main():
    start_server()
    malos = 0
    with sync_playwright() as pw:
        for pg in PAGES:
            b, ctx, page, probe = launch(pw, 'escritorio')
            vio = []
            page.on('console', lambda m: vio.append(m.text[:220]) if 'Content Security Policy' in m.text else None)
            try:
                page.goto(f'{BASE}/{pg}', wait_until='load', timeout=20000)
                page.wait_for_timeout(1500)
            except Exception as e:
                vio.append('no cargó: ' + str(e)[:120])
            finally:
                b.close()
            print(('OK    ' if not vio else 'FALLA ') + pg)
            for v in vio: print('      ', v)
            malos += bool(vio)
    sys.exit(1 if malos else 0)

if __name__ == '__main__':
    main()
