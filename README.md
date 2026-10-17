# MAQUINA – Tienda

Tienda estática (HTML + CSS + JavaScript) con Firebase y Google Apps Script. Se publica con GitHub Pages.

## Estructura

| Carpeta / archivo | Qué es |
|---|---|
| `*.html` | Páginas de la tienda (inicio, catálogo, carrito, admin, login, etc.) |
| `css/` | Estilos |
| `js/` | Lógica (`store.js`, `admin.js`, `products.js`, `firebase-config.js`...) |
| `img/` | Imágenes y logos |
| `firestore.rules` | Reglas de seguridad de Firestore |
| `apps-script/` | Script de Google Apps Script (se pega en script.google.com; no es parte del sitio) |
| `docs/` | Guías y notas (LEEME, GUIA, reglas) |
| `scripts/verificar.py` y `.github/` | Verificación automática antes de publicar (ver `docs/FLUJO_GIT.txt`) |
| `tests-hoja/`, `tests-reglas/`, `tests-visual/` | Pruebas de desarrollo |

## Publicar
Trabaja en una rama, abre un Pull Request y espera el ✅ de «Verificar sitio» antes de unirlo a `main`. Pasos en `docs/FLUJO_GIT.txt`.

## Respaldo
Panel admin → **Descargar respaldo** (ver `docs/RESPALDO_FIRESTORE.txt`).

Más detalle en `docs/LEEME_PUBLICAR_GITHUB.txt`.
