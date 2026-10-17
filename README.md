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
| `_respaldos/` | Copias viejas de páginas (GitHub Pages no las publica) |
| `tests-hoja/`, `tests-reglas/`, `tests-visual/` | Pruebas de desarrollo |

## Publicar
1. Cambios en GitHub Desktop → **Commit to main** → **Push origin**.
2. GitHub Pages actualiza el sitio en 1–2 minutos.

Más detalle en `docs/LEEME_PUBLICAR_GITHUB.txt`.
