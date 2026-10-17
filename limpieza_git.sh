#!/usr/bin/env bash
# Ejecuta esto DENTRO de tu repositorio (carpeta MAQUINA), en una rama nueva:
#   git checkout -b limpieza-repo
#   bash limpieza_git.sh
#   git commit -m "Limpieza: quitar duplicados y archivos sobrantes"
# Luego abre el Pull Request y espera el ✅ de «Verificar sitio».
set -e
git rm -q --ignore-unmatch \
  GUIA_CODIGO_PANEL_CORREO.txt GUIA_CORREO_CONFIRMACION.txt GUIA_MIGRAR_ADMIN_A_AUTH.txt GUIA_VERIFICACION_CODIGO.txt \
  LEEME.txt LEEME_CAMBIOS.txt LEEME_CAMBIOS_ADMIN.txt LEEME_CARRITO.txt LEEME_CHECKOUT.txt LEEME_CONTACTOS_EN_SHEET.txt \
  LEEME_ENVIOS_CIUDADES.txt LEEME_HOJA_ESTADOS.txt LEEME_MENSAJES_CONTACTO.txt LEEME_PAGO_Y_SINCRONIZAR.txt \
  LEEME_PUBLICAR_GITHUB.txt LEEME_REDISENO.txt LEEME_REVISION_FINAL.txt REGLAS_RESENAS.txt FIRESTORE_REGLAS.txt \
  firestore.rules.txt SCRIPT_COMPLETO_MAQUINA.gs.txt \
  carrito.original.html "login - copia.html" \
  img/login-model-v2.jpg img/login-model-old-backup.jpg img/admin-login-bg.png
git rm -rq --ignore-unmatch _respaldos img_backup_prev
echo "Listo. Revisa con: git status"
