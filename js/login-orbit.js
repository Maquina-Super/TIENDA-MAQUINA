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
})();
