/* ============================================================
   LOGIN DEL PANEL — aro circular de barras (solo visual)
   Dibuja ~84 barras radiales alrededor del formulario, alternando
   lima / morado, y ajusta la escala del escenario a la pantalla.
   NO toca la autenticación ni ningún campo del formulario.
   ============================================================ */
(function () {
  var orbit = document.getElementById('alOrbit');
  var stage = document.getElementById('alStage');
  if (!orbit || !stage) return;

  var TOTAL = 84;        // cantidad de barras (par, para alternar colores)
  var PERIODO = 4;       // segundos de un pulso completo
  var ONDAS = 3;         // cuántas "crestas" de brillo recorren el aro

  var frag = document.createDocumentFragment();
  for (var n = 0; n < TOTAL; n++) {
    var bar = document.createElement('div');
    bar.className = 'al-bar ' + (n % 2 === 0 ? 'is-lime' : 'is-violet');
    bar.style.transform = 'rotate(' + (n * 360 / TOTAL) + 'deg)';
    var i = document.createElement('i');
    i.style.animationDelay = (-(n / TOTAL) * ONDAS * PERIODO).toFixed(3) + 's';
    bar.appendChild(i);
    frag.appendChild(bar);
  }
  orbit.style.setProperty('--al-dur', PERIODO + 's');
  orbit.appendChild(frag);

  // Si la pantalla es baja/angosta, se reduce todo el escenario en bloque
  // (el formulario sigue centrado dentro del aro).
  function ajustarEscala() {
    var s = Math.min(1, window.innerHeight / 780);
    if (window.innerWidth < 380) s = Math.min(s, window.innerWidth / 380);
    s = Math.max(0.55, s);
    stage.style.setProperty('--al-s', s.toFixed(3));
  }
  ajustarEscala();
  window.addEventListener('resize', ajustarEscala);

  // Respaldo para los campos "Correo / Contraseña / Código": si el
  // navegador los autocompleta, a veces no avisa a tiempo con
  // :placeholder-shown y la etiqueta se queda encimada con el texto.
  // Esto la sube a mano en cuanto detecta que el campo tiene valor.
  function subirEtiquetasLlenas() {
    document.querySelectorAll('.nf-field input').forEach(function (inp) {
      var label = inp.nextElementSibling;
      if (!label || label.tagName !== 'LABEL') return;
      if (inp.value && inp.value.length > 0) {
        label.style.top = '0';
        label.style.transform = 'translateY(-50%) scale(0.82)';
        label.style.color = 'var(--adm-lime)';
        label.style.background = '#14141f';
      } else if (document.activeElement !== inp) {
        label.style.top = '';
        label.style.transform = '';
        label.style.color = '';
        label.style.background = '';
      }
    });
  }
  document.querySelectorAll('.nf-field input').forEach(function (inp) {
    inp.addEventListener('input', subirEtiquetasLlenas);
    inp.addEventListener('change', subirEtiquetasLlenas);
    inp.addEventListener('blur', subirEtiquetasLlenas);
  });
  // El autocompletado del navegador rellena los campos después de pintar
  // la página, así que se revisa varias veces al inicio.
  [0, 200, 500, 1000, 1800].forEach(function (ms) {
    setTimeout(subirEtiquetasLlenas, ms);
  });
})();
