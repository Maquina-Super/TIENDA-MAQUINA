#!/usr/bin/env python3
"""
Verificación rápida del sitio MAQUINA (solo usa Python estándar).
Se ejecuta sola en GitHub (carpeta .github/workflows) con cada cambio,
y también la puedes correr en tu PC:   python scripts/verificar.py

Revisa:
  1. Que no se hayan colado archivos internos de .git (lo que pasó el 16-oct-2026).
  2. Que existan las páginas y carpetas principales.
  3. Que el JavaScript no tenga errores de sintaxis (si hay Node instalado).
  4. Que los enlaces/imágenes/CSS locales apunten a archivos que existen.
  5. Que no se haya subido un archivo gigante por error.
Sale con código 1 si algo está mal (así GitHub marca el cambio en rojo).
"""
import glob, os, re, shutil, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(RAIZ)
errores, avisos = [], []

# 1) Archivos internos de git en la raíz del proyecto
INTERNOS = ['objects', 'hooks', 'refs', 'logs', 'COMMIT_EDITMSG', 'FETCH_HEAD', 'ORIG_HEAD', 'HEAD']
for n in INTERNOS:
    if os.path.exists(n):
        errores.append(f'"{n}" es un archivo interno de .git y NO debe estar en el proyecto '
                       '(suele pasar al copiar la carpeta .git dentro del repositorio o por OneDrive).')

# 2) Estructura mínima
OBLIGATORIOS = ['index.html', 'admin.html', 'carrito.html', 'catalogo.html', 'producto.html',
                'login.html', 'css/estilos.css', 'js/store.js', 'js/products.js',
                'js/firebase-config.js', 'firestore.rules']
for f in OBLIGATORIOS:
    if not os.path.isfile(f):
        errores.append(f'Falta el archivo principal: {f}')

# 2b) Toda página debe declarar su Content-Security-Policy (ver docs/LEEME_CALIDAD_CONFIANZA.txt)
for f in sorted(glob.glob('*.html')):
    if 'Content-Security-Policy' not in open(f, encoding='utf-8', errors='ignore').read():
        errores.append(f'{f} no tiene la etiqueta <meta http-equiv="Content-Security-Policy">.')

# 3) Sintaxis JavaScript
if shutil.which('node'):
    for f in sorted(glob.glob('js/*.js')):
        r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
        if r.returncode != 0:
            errores.append(f'Error de sintaxis en {f}: ' + (r.stderr.strip().splitlines() or ['?'])[-1][:200])
else:
    avisos.append('Node no está instalado: se omitió la revisión de sintaxis de JavaScript.')

# 4) Enlaces locales
PAT = re.compile(r'''(?:href|src)=["']([^"'#?:]+?\.(?:html|css|js|png|jpg|jpeg|webp|svg|xml|txt|ico))["']'''
                 r'''|url\(["']?([^"')?#]+?\.(?:png|jpg|jpeg|webp|svg|woff2?))''', re.I)
for f in sorted(glob.glob('*.html') + glob.glob('js/*.js') + glob.glob('css/*.css')):
    txt = open(f, encoding='utf-8', errors='ignore').read()
    if f.endswith('.css'):
        txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)       # ignorar comentarios
    elif f.endswith('.js'):
        txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
        txt = re.sub(r'(?m)^\s*//.*$', '', txt)
    else:
        txt = re.sub(r'<!--.*?-->', '', txt, flags=re.S)
    base = os.path.dirname(f) if f.endswith('.css') else '.'
    for m in PAT.finditer(txt):
        ruta = m.group(1) or m.group(2)
        if ruta.startswith(('http', '//', 'data:')) or '${' in ruta or '+' in ruta:
            continue
        destino = os.path.normpath(os.path.join(base, ruta.lstrip('/')))
        if not os.path.exists(destino):
            errores.append(f'{f}: apunta a "{ruta}" y ese archivo no existe')

# 5) Archivos demasiado grandes (fuera de .git)
for carpeta, dirs, archivos in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules')]
    for a in archivos:
        p = os.path.join(carpeta, a)
        mb = os.path.getsize(p) / 1024 / 1024
        if mb > 5:
            errores.append(f'{p[2:]} pesa {mb:.1f} MB (límite 5 MB). Comprímelo antes de subirlo.')
        elif mb > 2:
            avisos.append(f'{p[2:]} pesa {mb:.1f} MB; conviene comprimirlo.')

for a in avisos: print('AVISO :', a)
for e in errores: print('ERROR :', e)
if errores:
    print(f'\nResultado: {len(errores)} problema(s). No publiques hasta corregirlos.')
    sys.exit(1)
print('Resultado: todo en orden.')
