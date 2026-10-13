/* ============================================================================
   RECURRENCIA 2027 - SDIS   |   Logica del aplicativo
   ----------------------------------------------------------------------------
   Flujo:
     Pantalla 1  Subdireccion Local -> Jardin Infantil -> Nivel -> Nombre
     Pantalla 2  Lista de ninas y ninos del nivel, con las preguntas
     Pantalla 3  Confirmacion del envio

   Los datos de las ninas y los ninos se leen de archivos JSON estaticos:
     data/index.json      arbol de subdirecciones, jardines y niveles
     data/sl/<slug>.json  ninas y ninos de esa subdireccion local

   Lo diligenciado se guarda automaticamente en el navegador (pre-guardado)
   y solo viaja a Google Drive cuando se presiona ENVIAR.
   ==========================================================================*/

(function () {
  'use strict';

  /* ======================================================================
     1. ESTADO
     ==================================================================== */

  var CLAVE_BORRADOR = 'rec2027:borrador:';
  var CLAVE_SESION = 'rec2027:sesion';

  var estado = {
    auth: { token: '', usuario: '', nombre: '', rol: '' },
    indice: null,            // contenido de index.json
    cacheSubdir: {},         // { slug: datosDeEsaSubdireccion }
    seleccion: {             // lo elegido en la pantalla 1
      subdireccion: '',
      slug: '',
      codJardin: '',
      jardin: '',
      jardinCorto: '',
      nivel: '',
      aceptoHabeasData: false,   // casilla de proteccion de datos
      fechaAceptacionHD: ''      // momento en que se marco la casilla
    },
    ninos: [],               // lista del nivel seleccionado
    respuestas: {},          // { numDoc: { continua, transitoA, transitoSubdireccion, transitoJardin } }
    filtro: '',
    enviando: false
  };

  /* ======================================================================
     2. ATAJOS
     ==================================================================== */

  function $(id) { return document.getElementById(id); }
  function crear(tag, clase) {
    var el = document.createElement(tag);
    if (clase) { el.className = clase; }
    return el;
  }
  function limpiar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }
  function txt(v) { return v === null || v === undefined ? '' : String(v); }

  function opcion(valor, etiqueta) {
    var o = crear('option');
    o.value = valor;
    o.textContent = etiqueta;
    return o;
  }

  function reiniciarSelect(select, textoInicial, habilitado) {
    limpiar(select);
    select.appendChild(opcion('', textoInicial));
    select.disabled = !habilitado;
    select.value = '';
  }

  function mostrarPantalla(nombre) {
    ['pantallaLogin', 'pantallaCambio', 'pantallaBusqueda', 'pantallaFormulario', 'pantallaFin'].forEach(function (id) {
      $(id).classList.toggle('oculto', id !== nombre);
    });
    $('barraTrabajo').classList.toggle('oculto', nombre !== 'pantallaFormulario');
    var dentro = (nombre === 'pantallaBusqueda' || nombre === 'pantallaFormulario' || nombre === 'pantallaFin');
    $('sesion').classList.toggle('oculto', !dentro || !estado.auth.token);
    window.scrollTo(0, 0);
  }

  function idAleatorio() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'env-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function hoyTexto() {
    var d = new Date();
    function dd(n) { return (n < 10 ? '0' : '') + n; }
    return dd(d.getDate()) + '/' + dd(d.getMonth() + 1) + '/' + d.getFullYear() +
           ' ' + dd(d.getHours()) + ':' + dd(d.getMinutes());
  }

  /* ======================================================================
     3. ARRANQUE
     ==================================================================== */

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    $('tituloApp').textContent = CONFIG.TITULO;
    $('subtituloApp').textContent = CONFIG.SUBTITULO;
    $('introApp').textContent = CONFIG.INTRO;
    document.title = CONFIG.TITULO + ' · SDIS';

    prepararHabeasData();
    conectarEventos();

    if (urlSinConfigurar()) {
      mostrarPantalla('pantallaLogin');
      mensaje('zonaLogin', 'error', 'Falta configurar el servidor',
        'El archivo config.js todavía no tiene la URL de Google Apps Script. El ingreso no funcionará hasta configurarla.');
      return;
    }
    var ses = leerSesionGuardada();
    if (ses && ses.token) {
      estado.auth = ses;
      pintarSesion();
      entrarAlAplicativo();
    } else {
      mostrarPantalla('pantallaLogin');
      $('inpUsuario').focus();
    }
  }

  function urlSinConfigurar() {
    var url = txt(CONFIG.URL_APPS_SCRIPT);
    return (!url || url.indexOf('PEGA_AQUI') === 0 || url.indexOf('/exec') < 0);
  }

  /* ====================================================== API (servidor) */
  function apiPost(cuerpo) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var corte = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.TIMEOUT_ENVIO_SEG * 1000);
    return fetch(CONFIG.URL_APPS_SCRIPT, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        clearTimeout(corte);
        var j; try { j = JSON.parse(t); } catch (e) {
          throw new Error('El servidor respondió algo inesperado. Verifique que la implementación esté publicada para «Cualquier persona».');
        }
        return j;
      })
      .catch(function (e) { clearTimeout(corte); throw e; });
  }

  function apiDatos(accion, extra) {
    var cuerpo = { accion: accion, token: estado.auth.token };
    if (extra) Object.keys(extra).forEach(function (k) { cuerpo[k] = extra[k]; });
    return apiPost(cuerpo).then(function (r) {
      if (!r.ok) {
        if (r.codigo === 'SESION') { forzarRelogin('Su sesión expiró. Vuelva a ingresar.'); throw new Error('SESION'); }
        if (r.codigo === 'DEBE_CAMBIAR') { mostrarCambio(); throw new Error('DEBE_CAMBIAR'); }
        throw new Error(r.error || 'Error del servidor.');
      }
      return r.datos;
    });
  }

  /* ====================================================== LOGIN */
  function alIngresar(e) {
    if (e && e.preventDefault) e.preventDefault();
    var usuario = txt($('inpUsuario').value).trim();
    var clave = $('inpClave').value;
    limpiarZona('zonaLogin');
    if (!usuario || !clave) { mensaje('zonaLogin', 'error', 'Faltan datos', 'Escriba su usuario y contraseña.'); return; }
    $('btnIngresar').disabled = true;
    $('btnIngresar').innerHTML = '<span class="rueda rueda--blanca"></span> Ingresando…';
    apiPost({ accion: 'login', usuario: usuario, contrasena: clave })
      .then(function (r) {
        if (!r.ok) { mensaje('zonaLogin', 'error', 'No se pudo ingresar', r.error || 'Usuario o contraseña incorrectos.'); return; }
        estado.auth = { token: r.token, usuario: r.usuario, nombre: r.nombre, rol: r.rol };
        guardarSesion(); pintarSesion(); $('inpClave').value = '';
        if (r.debeCambiar) { mostrarCambio(); } else { entrarAlAplicativo(); }
      })
      .catch(function (err) { mensaje('zonaLogin', 'error', 'No se pudo ingresar', err.message || 'Error de conexión.'); })
      .then(function () { $('btnIngresar').textContent = 'INGRESAR'; $('btnIngresar').disabled = false; });
  }

  function mostrarCambio() {
    limpiarZona('zonaCambio');
    $('inpNueva').value = ''; $('inpNueva2').value = '';
    $('ayudaNueva').textContent = 'Mínimo ' + (CONFIG.MIN_LARGO_CONTRASENA || 8) + ' caracteres.';
    $('btnGuardarClave').disabled = true;
    mostrarPantalla('pantallaCambio');
    $('inpNueva').focus();
  }
  function validarCambio() {
    var a = $('inpNueva').value, b = $('inpNueva2').value;
    var minimo = CONFIG.MIN_LARGO_CONTRASENA || 8;
    var ayuda = $('ayudaNueva'); var ok = true;
    if (a.length < minimo) { ayuda.textContent = 'Mínimo ' + minimo + ' caracteres.'; ayuda.className = 'campo__ayuda'; ok = false; }
    else if (b && a !== b) { ayuda.textContent = 'Las dos contraseñas no coinciden.'; ayuda.className = 'campo__ayuda campo__ayuda--error'; ok = false; }
    else if (a === b) { ayuda.textContent = 'Las contraseñas coinciden.'; ayuda.className = 'campo__ayuda'; }
    $('btnGuardarClave').disabled = !(ok && a && a === b);
  }
  function alGuardarClave(e) {
    if (e && e.preventDefault) e.preventDefault();
    if ($('btnGuardarClave').disabled) return;
    var nueva = $('inpNueva').value;
    $('btnGuardarClave').disabled = true;
    $('btnGuardarClave').innerHTML = '<span class="rueda rueda--blanca"></span> Guardando…';
    apiPost({ accion: 'cambiar', token: estado.auth.token, nueva: nueva })
      .then(function (r) {
        if (!r.ok) {
          if (r.codigo === 'SESION') { forzarRelogin('Su sesión expiró. Vuelva a ingresar.'); return; }
          mensaje('zonaCambio', 'error', 'No se pudo cambiar', r.error || 'Error.'); return;
        }
        guardarSesion(); entrarAlAplicativo();
      })
      .catch(function (err) { mensaje('zonaCambio', 'error', 'No se pudo cambiar', err.message || 'Error de conexión.'); })
      .then(function () { $('btnGuardarClave').textContent = 'GUARDAR Y CONTINUAR'; validarCambio(); });
  }

  function entrarAlAplicativo() {
    mostrarPantalla('pantallaBusqueda');
    limpiarZona('zonaMensajes');
    pintarBorradores();
    cargarIndice();
    validarPantallaBusqueda();
  }
  function salir() {
    abrirModal({ titulo: 'Cerrar sesión', texto: '¿Desea salir del aplicativo? Los avances pre-guardados quedan en este dispositivo.',
      botones: [ { texto: 'Sí, salir', clase: 'boton--principal', accion: function () { cerrarModal(); hacerSalir(); } },
                 { texto: 'Cancelar', clase: 'boton--secundario', accion: cerrarModal } ] });
  }
  function hacerSalir() {
    estado.auth = { token: '', usuario: '', nombre: '', rol: '' };
    estado.indice = null; estado.cacheSubdir = {}; estado.ninos = []; estado.respuestas = {};
    try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) {}
    $('sesion').classList.add('oculto');
    $('inpUsuario').value = ''; $('inpClave').value = '';
    mostrarPantalla('pantallaLogin'); $('inpUsuario').focus();
  }
  function forzarRelogin(msg) {
    estado.auth = { token: '', usuario: '', nombre: '', rol: '' };
    try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) {}
    $('sesion').classList.add('oculto');
    mostrarPantalla('pantallaLogin');
    if (msg) mensaje('zonaLogin', 'alerta', 'Sesión finalizada', msg);
  }
  function pintarSesion() {
    var a = estado.auth;
    $('sesionInfo').textContent = (a.nombre || a.usuario) + ' · ' + (a.rol || '');
    $('sesion').classList.remove('oculto');
  }
  function guardarSesion() { try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(estado.auth)); } catch (e) {} }
  function leerSesionGuardada() { try { var c = sessionStorage.getItem(CLAVE_SESION); return c ? JSON.parse(c) : null; } catch (e) { return null; } }

  /* --------------------------------------------- Proteccion de datos (Habeas) */

  function hdActivo() {
    return !!(CONFIG.HABEAS_DATA && CONFIG.HABEAS_DATA.ACTIVO);
  }

  function prepararHabeasData() {
    var bloque = $('bloqueHabeas');

    // Si el aviso esta desactivado en config, se oculta y se da por aceptado.
    if (!hdActivo()) {
      if (bloque) { bloque.classList.add('oculto'); }
      estado.seleccion.aceptoHabeasData = true;
      return;
    }

    var hd = CONFIG.HABEAS_DATA;
    $('habeasAvisoCorto').textContent = hd.AVISO_CORTO || '';
    $('habeasDeclaracion').textContent = hd.DECLARACION || '';
    $('btnVerPolitica').textContent = hd.ENLACE_POLITICA || 'Ver la política de datos';

    // Enlace a la politica oficial dentro de la ventana.
    var enlaceOficial = $('politicaEnlaceOficial');
    if (hd.URL_POLITICA) {
      enlaceOficial.href = hd.URL_POLITICA;
    } else {
      enlaceOficial.classList.add('oculto');
    }

    construirPolitica();
  }

  function construirPolitica() {
    var hd = CONFIG.HABEAS_DATA;
    $('politicaTitulo').textContent = hd.TITULO_POLITICA || 'Política de tratamiento de datos';

    var cont = $('politicaCuerpo');
    limpiar(cont);

    (hd.POLITICA || []).forEach(function (sec) {
      var bloque = crear('section', 'politica__seccion');

      if (sec.titulo) {
        var t = crear('h4', 'politica__titulo');
        t.textContent = sec.titulo;
        bloque.appendChild(t);
      }
      (sec.parrafos || []).forEach(function (p) {
        var par = crear('p', 'politica__parrafo');
        par.textContent = p;
        bloque.appendChild(par);
      });
      if (sec.items && sec.items.length) {
        var ul = crear('ul', 'politica__lista');
        sec.items.forEach(function (it) {
          var li = crear('li');
          li.textContent = it;
          ul.appendChild(li);
        });
        bloque.appendChild(ul);
      }
      cont.appendChild(bloque);
    });
  }

  function alMarcarHabeas() {
    var marcado = $('chkHabeas').checked;
    estado.seleccion.aceptoHabeasData = marcado;
    estado.seleccion.fechaAceptacionHD = marcado ? isoAhora_() : '';
    validarPantallaBusqueda();
  }

  function abrirPolitica() {
    $('capaPolitica').classList.remove('oculto');
    $('politicaCuerpo').scrollTop = 0;
    $('btnAceptarPolitica').focus();
  }

  function cerrarPolitica(aceptar) {
    $('capaPolitica').classList.add('oculto');
    // "Entendido" marca la casilla por comodidad; "cerrar" no la toca.
    if (aceptar && hdActivo() && !$('chkHabeas').checked) {
      $('chkHabeas').checked = true;
      alMarcarHabeas();
    }
  }

  function isoAhora_() {
    try { return new Date().toISOString(); } catch (e) { return hoyTexto(); }
  }

  function conectarEventos() {
    $('formLogin').addEventListener('submit', alIngresar);
    $('btnIngresar').addEventListener('click', alIngresar);
    $('formCambio').addEventListener('submit', alGuardarClave);
    $('btnGuardarClave').addEventListener('click', alGuardarClave);
    $('inpNueva').addEventListener('input', validarCambio);
    $('inpNueva2').addEventListener('input', validarCambio);
    $('btnSalir').addEventListener('click', salir);

    $('selSubdireccion').addEventListener('change', alCambiarSubdireccion);
    $('selJardin').addEventListener('change', alCambiarJardin);
    $('selNivel').addEventListener('change', validarPantallaBusqueda);

    $('btnIniciar').addEventListener('click', iniciarDiligenciamiento);

    $('chkHabeas').addEventListener('change', alMarcarHabeas);
    $('btnVerPolitica').addEventListener('click', abrirPolitica);
    $('btnCerrarPolitica').addEventListener('click', function () { cerrarPolitica(false); });
    $('btnAceptarPolitica').addEventListener('click', function () { cerrarPolitica(true); });

    $('btnAtras').addEventListener('click', confirmarSalida);
    $('btnEnviar').addEventListener('click', confirmarEnvio);

    $('inpBuscarNino').addEventListener('input', function () {
      estado.filtro = this.value.trim().toLowerCase();
      pintarListaNinos();
    });

    $('btnTodosSi').addEventListener('click', marcarTodosSi);
    $('btnVolverInicio').addEventListener('click', volverAlInicio);
    $('btnOtroNivel').addEventListener('click', volverAlInicio);
  }

  /* ======================================================================
     4. CARGA DEL INDICE
     ==================================================================== */

  function cargarIndice() {
    if (estado.indice) { llenarSubdirecciones(); $('cargandoIndice').classList.add('oculto'); $('formBusqueda').classList.remove('oculto'); return; }
    $('cargandoIndice').classList.remove('oculto');
    $('formBusqueda').classList.add('oculto');

    apiDatos('index')
      .then(function (datos) {
        estado.indice = datos;
        $('cargandoIndice').classList.add('oculto');
        $('formBusqueda').classList.remove('oculto');
        llenarSubdirecciones();
        pintarBorradores();
        $('resumenBase').textContent =
          datos.totalNinos.toLocaleString('es-CO') + ' niñas y niños · ' +
          datos.subdirecciones.length + ' subdirecciones locales · ' +
          datos.subdirecciones.reduce(function (a, s) { return a + s.nJardines; }, 0) +
          ' jardines infantiles';
      })
      .catch(function (err) {
        $('cargandoIndice').classList.add('oculto');
        if (err.message === 'SESION' || err.message === 'DEBE_CAMBIAR') return;
        mensaje('zonaMensajes', 'error', 'No se pudo cargar la base de datos', 'Detalle técnico: ' + err.message);
      });
  }

  function llenarSubdirecciones() {
    var sel = $('selSubdireccion');
    reiniciarSelect(sel, 'Seleccione la subdirección local…', true);
    estado.indice.subdirecciones.forEach(function (s) {
      sel.appendChild(opcion(s.slug, s.nombre));
    });
  }

  function buscarSubdirPorSlug(slug) {
    var lista = estado.indice.subdirecciones;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].slug === slug) { return lista[i]; }
    }
    return null;
  }

  function buscarSubdirPorNombre(nombre) {
    var lista = estado.indice.subdirecciones;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].nombre === nombre) { return lista[i]; }
    }
    return null;
  }

  /* ======================================================================
     5. PANTALLA 1 - DESPLEGABLES DEPENDIENTES
     ==================================================================== */

  function alCambiarSubdireccion() {
    var slug = $('selSubdireccion').value;

    reiniciarSelect($('selJardin'), 'Primero seleccione la subdirección', false);
    reiniciarSelect($('selNivel'), 'Primero seleccione el jardín', false);
    estado.seleccion.codJardin = '';
    estado.seleccion.jardin = '';
    estado.seleccion.nivel = '';
    validarPantallaBusqueda();

    if (!slug) {
      estado.seleccion.subdireccion = '';
      estado.seleccion.slug = '';
      $('ayudaJardin').textContent = '';
      return;
    }

    var sub = buscarSubdirPorSlug(slug);
    estado.seleccion.subdireccion = sub.nombre;
    estado.seleccion.slug = slug;

    var sel = $('selJardin');
    reiniciarSelect(sel, 'Seleccione el jardín infantil…', true);
    sub.jardines.forEach(function (j) {
      sel.appendChild(opcion(j.cod, j.corto));
    });

    $('ayudaJardin').textContent =
      sub.nJardines + ' jardines en ' + sub.nombre + ' · ' +
      sub.nNinos.toLocaleString('es-CO') + ' niñas y niños';

    // Se precarga el archivo de la subdireccion para que el paso siguiente
    // sea inmediato.
    cargarSubdireccion(slug).catch(function () { /* se reintenta al iniciar */ });
  }

  function alCambiarJardin() {
    var cod = $('selJardin').value;
    reiniciarSelect($('selNivel'), 'Primero seleccione el jardín', false);
    estado.seleccion.nivel = '';
    validarPantallaBusqueda();

    if (!cod) {
      estado.seleccion.codJardin = '';
      estado.seleccion.jardin = '';
      return;
    }

    var sub = buscarSubdirPorSlug(estado.seleccion.slug);
    var jardin = null;
    for (var i = 0; i < sub.jardines.length; i++) {
      if (sub.jardines[i].cod === cod) { jardin = sub.jardines[i]; break; }
    }
    if (!jardin) { return; }

    estado.seleccion.codJardin = jardin.cod;
    estado.seleccion.jardin = jardin.nombre;
    estado.seleccion.jardinCorto = jardin.corto;

    var sel = $('selNivel');
    reiniciarSelect(sel, 'Seleccione el nivel…', true);
    jardin.niveles.forEach(function (n) {
      sel.appendChild(opcion(n.nivel, n.nivel + '  (' + n.n + ' niñas y niños)'));
    });
  }

  function validarPantallaBusqueda() {
    var s = estado.seleccion;
    s.nivel = $('selNivel').value;
    var habeasOk = !hdActivo() || s.aceptoHabeasData;
    var listo = !!(s.subdireccion && s.codJardin && s.nivel && habeasOk);
    $('btnIniciar').disabled = !listo;
    return listo;
  }

  /* ======================================================================
     6. CARGA DE NINAS Y NINOS
     ==================================================================== */

  function cargarSubdireccion(slug) {
    if (estado.cacheSubdir[slug]) {
      return Promise.resolve(estado.cacheSubdir[slug]);
    }
    return apiDatos('sl', { slug: slug }).then(function (datos) {
      estado.cacheSubdir[slug] = datos;
      return datos;
    });
  }

  function iniciarDiligenciamiento() {
    if (!validarPantallaBusqueda()) { return; }

    var s = estado.seleccion;

    $('btnIniciar').disabled = true;
    $('btnIniciar').innerHTML = '<span class="rueda rueda--blanca"></span> Cargando…';

    cargarSubdireccion(s.slug)
      .then(function (datos) {
        var porNivel = datos.jardines[s.jardin];
        estado.ninos = (porNivel && porNivel[s.nivel]) ? porNivel[s.nivel].slice() : [];

        if (!estado.ninos.length) {
          throw new Error('No se encontraron niñas ni niños en este nivel.');
        }

        estado.respuestas = leerBorrador() || {};
        estado.filtro = '';
        $('inpBuscarNino').value = '';

        pintarContexto();
        pintarListaNinos();
        actualizarProgreso();
        limpiarZona('mensajesFormulario');
        mostrarPantalla('pantallaFormulario');
      })
      .catch(function (err) {
        if (err.message !== 'SESION' && err.message !== 'DEBE_CAMBIAR')
          mensaje('zonaMensajes', 'error', 'No se pudo abrir el nivel', err.message);
      })
      .then(function () {
        $('btnIniciar').textContent = 'INICIAR DILIGENCIAMIENTO DE RECURRENCIA';
        validarPantallaBusqueda();
      });
  }

  /* ======================================================================
     7. PANTALLA 2 - CONTEXTO
     ==================================================================== */

  function pintarContexto() {
    var s = estado.seleccion;
    var caja = $('contexto');
    limpiar(caja);

    [
      ['Subdirección', s.subdireccion],
      ['Jardín', s.jardinCorto || s.jardin],
      ['Nivel', s.nivel],
      ['Diligencia', estado.auth.nombre + ' (' + estado.auth.rol + ')']
    ].forEach(function (par) {
      var fila = crear('div', 'contexto__linea');
      var k = crear('span', 'contexto__clave');
      k.textContent = par[0];
      var v = crear('span', 'contexto__valor');
      v.textContent = par[1];
      fila.appendChild(k);
      fila.appendChild(v);
      caja.appendChild(fila);
    });
  }

  /* ======================================================================
     8. PANTALLA 2 - LISTA DE NINAS Y NINOS
     ==================================================================== */

  function pintarListaNinos() {
    var cont = $('listaNinos');
    limpiar(cont);

    var visibles = estado.ninos.filter(function (n) {
      if (!estado.filtro) { return true; }
      return n.nom.toLowerCase().indexOf(estado.filtro) >= 0 ||
             txt(n.id).indexOf(estado.filtro) >= 0;
    });

    if (!visibles.length) {
      var vacio = crear('div', 'vacio');
      vacio.textContent = 'Ninguna niña o niño coincide con «' + estado.filtro + '».';
      cont.appendChild(vacio);
      return;
    }

    var fragmento = document.createDocumentFragment();
    visibles.forEach(function (nino) {
      fragmento.appendChild(construirTarjetaNino(nino, estado.ninos.indexOf(nino) + 1));
    });
    cont.appendChild(fragmento);
  }

  function construirTarjetaNino(nino, numero) {
    var r = estado.respuestas[nino.id] || {};

    var tarjeta = crear('article', 'nino');
    tarjeta.dataset.id = nino.id;

    /* --- Cabeza: numero, nombre y chulo ------------------------------- */
    var cabeza = crear('header', 'nino__cabeza');

    var num = crear('span', 'nino__numero');
    num.textContent = numero;
    cabeza.appendChild(num);

    var nombre = crear('h3', 'nino__nombre');
    nombre.textContent = nino.nom;
    cabeza.appendChild(nombre);

    var chulo = crear('span', 'nino__check');
    chulo.textContent = '✔';
    chulo.setAttribute('aria-hidden', 'true');
    cabeza.appendChild(chulo);

    tarjeta.appendChild(cabeza);

    /* --- Datos que vienen del Excel ----------------------------------- */
    var base = crear('div', 'datos-base');
    base.appendChild(dato('Fecha de nacimiento', nino.fn));
    base.appendChild(dato('Edad a 31/03/2027', nino.e27 + (nino.e27 === '1' ? ' año' : ' años')));
    base.appendChild(dato('Nivel actual', estado.seleccion.nivel));
    base.appendChild(dato('Nivel 2027 por edad', nino.n27));
    tarjeta.appendChild(base);

    /* --- Preguntas a diligenciar -------------------------------------- */
    var preguntas = crear('div', 'nino__preguntas');

    // Pregunta 1: SI / NO
    var p1 = crear('div', 'pregunta');
    var p1t = crear('div', 'pregunta__texto');
    p1t.textContent = '¿Desea continuar con el cupo en el mismo jardín?';
    p1.appendChild(p1t);

    var grupo = crear('div', 'sino');
    grupo.appendChild(botonSiNo(nino.id, 'SI', r.continua === 'SI'));
    grupo.appendChild(botonSiNo(nino.id, 'NO', r.continua === 'NO'));
    p1.appendChild(grupo);
    preguntas.appendChild(p1);

    // Bloque condicional: solo si respondio NO
    var bloque = crear('div', 'transito');
    bloque.dataset.rol = 'transito';
    if (r.continua !== 'NO') { bloque.classList.add('oculto'); }
    construirBloqueTransito(bloque, nino, r);
    preguntas.appendChild(bloque);

    tarjeta.appendChild(preguntas);

    marcarEstadoTarjeta(tarjeta, r);
    return tarjeta;
  }

  function dato(clave, valor) {
    var caja = crear('div', 'dato');
    var k = crear('div', 'dato__clave');
    k.textContent = clave;
    var v = crear('div', 'dato__valor');
    v.textContent = txt(valor) || '—';
    caja.appendChild(k);
    caja.appendChild(v);
    return caja;
  }

  function botonSiNo(idNino, valor, marcado) {
    var etiqueta = crear('label', 'sino__opcion' + (valor === 'NO' ? ' sino__opcion--no' : ''));

    var radio = crear('input');
    radio.type = 'radio';
    radio.name = 'continua-' + idNino;
    radio.value = valor;
    radio.checked = !!marcado;
    radio.addEventListener('change', function () {
      alResponderContinua(idNino, valor);
    });

    var caja = crear('span', 'sino__caja');
    caja.textContent = valor === 'SI' ? 'SÍ' : 'NO';

    etiqueta.appendChild(radio);
    etiqueta.appendChild(caja);
    return etiqueta;
  }

  /* ---------------------------------------- bloque "HARÁ TRÁNSITO A" --- */

  function construirBloqueTransito(bloque, nino, r) {
    limpiar(bloque);

    var titulo = crear('div', 'transito__titulo');
    titulo.textContent = 'Tránsito para 2027';
    bloque.appendChild(titulo);

    // Desplegable de las 4 opciones
    var campoT = crear('div', 'campo campo-transito--ancho');
    var etiqT = crear('label', 'campo__etiqueta');
    etiqT.textContent = 'Hará tránsito a';
    etiqT.htmlFor = 'transito-' + nino.id;
    var selT = crear('select', 'control');
    selT.id = 'transito-' + nino.id;
    selT.appendChild(opcion('', 'Seleccione una opción…'));
    CONFIG.OPCIONES_TRANSITO.forEach(function (o) { selT.appendChild(opcion(o, o)); });
    selT.value = txt(r.transitoA);
    campoT.appendChild(etiqT);
    campoT.appendChild(selT);
    bloque.appendChild(campoT);

    // Subdireccion local de destino
    var campoS = crear('div', 'campo');
    var etiqS = crear('label', 'campo__etiqueta');
    etiqS.textContent = 'Subdirección local';
    etiqS.htmlFor = 'tsub-' + nino.id;
    var selS = crear('select', 'control');
    selS.id = 'tsub-' + nino.id;
    reiniciarSelect(selS, 'Seleccione la subdirección local…', true);
    estado.indice.subdirecciones.forEach(function (s) {
      selS.appendChild(opcion(s.nombre, s.nombre));
    });
    campoS.appendChild(etiqS);
    campoS.appendChild(selS);
    bloque.appendChild(campoS);

    // Jardin infantil de destino (depende de la subdireccion)
    var campoJ = crear('div', 'campo');
    var etiqJ = crear('label', 'campo__etiqueta');
    etiqJ.textContent = 'Jardín infantil';
    etiqJ.htmlFor = 'tjar-' + nino.id;
    var selJ = crear('select', 'control');
    selJ.id = 'tjar-' + nino.id;
    reiniciarSelect(selJ, 'Primero seleccione la subdirección', false);
    campoJ.appendChild(etiqJ);
    campoJ.appendChild(selJ);
    bloque.appendChild(campoJ);

    // Visibilidad inicial de los dos desplegables de destino
    var esSdis = selT.value === CONFIG.OPCION_JARDIN_SDIS;
    campoS.classList.toggle('oculto', !esSdis);
    campoJ.classList.toggle('oculto', !esSdis);

    if (esSdis && r.transitoSubdireccion) {
      selS.value = r.transitoSubdireccion;
      llenarJardinesDestino(selJ, r.transitoSubdireccion);
      if (r.transitoJardin) { selJ.value = r.transitoJardin; }
    }

    /* --------------------------------------------------- eventos --- */

    selT.addEventListener('change', function () {
      var valor = selT.value;
      var abre = valor === CONFIG.OPCION_JARDIN_SDIS;

      campoS.classList.toggle('oculto', !abre);
      campoJ.classList.toggle('oculto', !abre);

      if (!abre) {
        selS.value = '';
        reiniciarSelect(selJ, 'Primero seleccione la subdirección', false);
      }

      guardarRespuesta(nino.id, {
        transitoA: valor,
        transitoSubdireccion: abre ? selS.value : '',
        transitoJardin: ''
      });
      refrescarEstado(nino.id);
    });

    selS.addEventListener('change', function () {
      llenarJardinesDestino(selJ, selS.value);
      guardarRespuesta(nino.id, {
        transitoSubdireccion: selS.value,
        transitoJardin: ''
      });
      refrescarEstado(nino.id);
    });

    selJ.addEventListener('change', function () {
      guardarRespuesta(nino.id, { transitoJardin: selJ.value });
      refrescarEstado(nino.id);
    });
  }

  function llenarJardinesDestino(selJ, nombreSubdir) {
    if (!nombreSubdir) {
      reiniciarSelect(selJ, 'Primero seleccione la subdirección', false);
      return;
    }
    var sub = buscarSubdirPorNombre(nombreSubdir);
    reiniciarSelect(selJ, 'Seleccione el jardín infantil…', true);
    if (!sub) { return; }
    sub.jardines.forEach(function (j) {
      selJ.appendChild(opcion(j.nombre, j.corto));
    });
  }

  /* ======================================================================
     9. RESPUESTAS Y PRE-GUARDADO
     ==================================================================== */

  function alResponderContinua(idNino, valor) {
    var cambios = { continua: valor };
    if (valor === 'SI') {
      cambios.transitoA = '';
      cambios.transitoSubdireccion = '';
      cambios.transitoJardin = '';
    }
    guardarRespuesta(idNino, cambios);

    var tarjeta = document.querySelector('.nino[data-id="' + idNino + '"]');
    if (tarjeta) {
      var bloque = tarjeta.querySelector('[data-rol="transito"]');
      if (valor === 'NO') {
        var nino = buscarNino(idNino);
        construirBloqueTransito(bloque, nino, estado.respuestas[idNino] || {});
        bloque.classList.remove('oculto');
      } else {
        bloque.classList.add('oculto');
      }
    }
    refrescarEstado(idNino);
  }

  function guardarRespuesta(idNino, cambios) {
    var actual = estado.respuestas[idNino] || {};
    Object.keys(cambios).forEach(function (k) { actual[k] = cambios[k]; });
    estado.respuestas[idNino] = actual;
    guardarBorradorConRetardo();
  }

  function buscarNino(id) {
    for (var i = 0; i < estado.ninos.length; i++) {
      if (estado.ninos[i].id === id) { return estado.ninos[i]; }
    }
    return null;
  }

  function respuestaCompleta(r) {
    if (!r || !r.continua) { return false; }
    if (r.continua === 'SI') { return true; }
    if (!r.transitoA) { return false; }
    if (r.transitoA === CONFIG.OPCION_JARDIN_SDIS) {
      return !!(r.transitoSubdireccion && r.transitoJardin);
    }
    return true;
  }

  function marcarEstadoTarjeta(tarjeta, r) {
    var completa = respuestaCompleta(r);
    var iniciada = !!(r && r.continua);
    tarjeta.classList.toggle('respondido', completa);
    tarjeta.classList.toggle('incompleto', iniciada && !completa);
  }

  function refrescarEstado(idNino) {
    var tarjeta = document.querySelector('.nino[data-id="' + idNino + '"]');
    if (tarjeta) {
      marcarEstadoTarjeta(tarjeta, estado.respuestas[idNino]);
    }
    actualizarProgreso();
  }

  function actualizarProgreso() {
    var total = estado.ninos.length;
    var completas = 0;
    var iniciadas = 0;

    estado.ninos.forEach(function (n) {
      var r = estado.respuestas[n.id];
      if (respuestaCompleta(r)) { completas++; }
      else if (r && r.continua) { iniciadas++; }
    });

    $('progresoTexto').innerHTML =
      '<strong>' + completas + ' de ' + total + '</strong> diligenciados' +
      (iniciadas ? ' · ' + iniciadas + ' incompletos' : '');
    $('progresoRelleno').style.width = (total ? (completas / total) * 100 : 0) + '%';
    $('btnEnviar').disabled = completas === 0 || estado.enviando;
  }

  /* --------------------------------------------- guardado en el navegador */

  var temporizadorGuardado = null;

  function guardarBorradorConRetardo() {
    if (temporizadorGuardado) { clearTimeout(temporizadorGuardado); }
    temporizadorGuardado = setTimeout(guardarBorrador, 400);
  }

  function claveBorrador() {
    var s = estado.seleccion;
    return CLAVE_BORRADOR + s.codJardin + '|' + s.nivel;
  }

  function guardarBorrador() {
    var s = estado.seleccion;
    var paquete = {
      subdireccion: s.subdireccion,
      slug: s.slug,
      codJardin: s.codJardin,
      jardin: s.jardin,
      jardinCorto: s.jardinCorto,
      nivel: s.nivel,
      actualizado: hoyTexto(),
      totalNinos: estado.ninos.length,
      respuestas: estado.respuestas
    };
    try {
      localStorage.setItem(claveBorrador(), JSON.stringify(paquete));
      avisoGuardado();
    } catch (e) {
      mensaje('mensajesFormulario', 'alerta', 'No se pudo pre-guardar',
        'El navegador no permitió guardar el avance. Evite cerrar esta ventana ' +
        'antes de enviar.');
    }
  }

  function leerBorrador() {
    try {
      var crudo = localStorage.getItem(claveBorrador());
      if (!crudo) { return null; }
      var paquete = JSON.parse(crudo);
      if (paquete && paquete.respuestas) {
        mensaje('mensajesFormulario', 'info', 'Se recuperó su avance',
          'Encontramos un pre-guardado del ' + paquete.actualizado +
          '. Puede continuar donde quedó.');
        return paquete.respuestas;
      }
    } catch (e) { /* borrador corrupto: se ignora */ }
    return null;
  }

  function borrarBorrador(clave) {
    try { localStorage.removeItem(clave || claveBorrador()); } catch (e) {}
  }

  function avisoGuardado() {
    var el = $('avisoGuardado');
    el.textContent = 'Pre-guardado ✓';
    el.classList.add('visible');
    clearTimeout(avisoGuardado._t);
    avisoGuardado._t = setTimeout(function () {
      el.classList.remove('visible');
    }, 1600);
  }

  /* ----------------------------------------- listado de borradores en inicio */

  function listarBorradores() {
    var lista = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var clave = localStorage.key(i);
        if (clave && clave.indexOf(CLAVE_BORRADOR) === 0) {
          try {
            var p = JSON.parse(localStorage.getItem(clave));
            if (p && p.respuestas && Object.keys(p.respuestas).length) {
              p._clave = clave;
              p._respondidos = Object.keys(p.respuestas).filter(function (k) {
                return respuestaCompleta(p.respuestas[k]);
              }).length;
              lista.push(p);
            }
          } catch (e) { /* ignorar */ }
        }
      }
    } catch (e) { /* ignorar */ }
    return lista;
  }

  function pintarBorradores() {
    var cont = $('borradores');
    var caja = $('tarjetaBorradores');
    limpiar(cont);

    var lista = listarBorradores();
    caja.classList.toggle('oculto', lista.length === 0);
    if (!lista.length) { return; }

    lista.forEach(function (p) {
      var fila = crear('div', 'borrador');

      var info = crear('div', 'borrador__info');
      var t = crear('div', 'borrador__titulo');
      t.textContent = (p.jardinCorto || p.jardin) + ' · ' + p.nivel;
      var m = crear('div', 'borrador__meta');
      m.textContent = p._respondidos + ' de ' + (p.totalNinos || '?') +
                      ' diligenciados · ' + p.actualizado;
      info.appendChild(t);
      info.appendChild(m);

      var acciones = crear('div', 'borrador__acciones');
      var btnSeguir = crear('button', 'boton boton--secundario boton--pequeno');
      btnSeguir.type = 'button';
      btnSeguir.textContent = 'Continuar';
      btnSeguir.addEventListener('click', function () { retomarBorrador(p); });

      var btnBorrar = crear('button', 'enlace-borrar');
      btnBorrar.type = 'button';
      btnBorrar.textContent = 'Descartar';
      btnBorrar.addEventListener('click', function () {
        abrirModal({
          titulo: 'Descartar este avance',
          texto: 'Se borrará el pre-guardado de ' + (p.jardinCorto || p.jardin) +
                 ' · ' + p.nivel + '. Esta acción no se puede deshacer.',
          botones: [
            { texto: 'Sí, descartar', clase: 'boton--principal', accion: function () {
                borrarBorrador(p._clave);
                pintarBorradores();
                cerrarModal();
              } },
            { texto: 'Cancelar', clase: 'boton--secundario', accion: cerrarModal }
          ]
        });
      });

      acciones.appendChild(btnSeguir);
      acciones.appendChild(btnBorrar);

      fila.appendChild(info);
      fila.appendChild(acciones);
      cont.appendChild(fila);
    });
  }

  function retomarBorrador(p) {
    $('selSubdireccion').value = p.slug;
    alCambiarSubdireccion();
    $('selJardin').value = p.codJardin;
    alCambiarJardin();
    $('selNivel').value = p.nivel;
    validarPantallaBusqueda();
    if (!$('btnIniciar').disabled) {
      iniciarDiligenciamiento();
    } else if (hdActivo() && !estado.seleccion.aceptoHabeasData) {
      // Solo falta aceptar protección de datos: lo llevamos a esa casilla.
      $('bloqueHabeas').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      $('selNivel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ======================================================================
     10. ACCION "TODOS SÍ"
     ==================================================================== */

  function marcarTodosSi() {
    var faltan = estado.ninos.filter(function (n) {
      var r = estado.respuestas[n.id];
      return !r || !r.continua;
    });

    if (!faltan.length) {
      mensaje('mensajesFormulario', 'info', 'Nada por marcar',
        'Todas las niñas y los niños ya tienen respuesta.');
      return;
    }

    abrirModal({
      titulo: 'Marcar SÍ a los que faltan',
      texto: 'Se marcará «SÍ, continúa en el mismo jardín» a las ' + faltan.length +
             ' niñas y niños que aún no tienen respuesta. Los que ya respondió no se ' +
             'modifican. Después puede cambiar los que necesite.',
      botones: [
        { texto: 'Sí, marcar ' + faltan.length, clase: 'boton--principal', accion: function () {
            faltan.forEach(function (n) {
              estado.respuestas[n.id] = {
                continua: 'SI', transitoA: '', transitoSubdireccion: '', transitoJardin: ''
              };
            });
            guardarBorrador();
            pintarListaNinos();
            actualizarProgreso();
            cerrarModal();
          } },
        { texto: 'Cancelar', clase: 'boton--secundario', accion: cerrarModal }
      ]
    });
  }

  /* ======================================================================
     11. SALIR DEL FORMULARIO
     ==================================================================== */

  function confirmarSalida() {
    abrirModal({
      titulo: 'Volver a la búsqueda',
      texto: 'Su avance queda pre-guardado en este dispositivo y podrá continuar ' +
             'después. Recuerde que la información solo llega a Drive cuando ' +
             'presiona ENVIAR.',
      botones: [
        { texto: 'Volver a la búsqueda', clase: 'boton--principal', accion: function () {
            guardarBorrador();
            cerrarModal();
            volverAlInicio();
          } },
        { texto: 'Seguir diligenciando', clase: 'boton--secundario', accion: cerrarModal }
      ]
    });
  }

  function volverAlInicio() {
    limpiarZona('zonaMensajes');
    pintarBorradores();
    mostrarPantalla('pantallaBusqueda');
    validarPantallaBusqueda();
  }

  /* ======================================================================
     12. ENVIO
     ==================================================================== */

  function armarRegistros() {
    var registros = [];
    estado.ninos.forEach(function (n) {
      var r = estado.respuestas[n.id];
      if (!r || !r.continua) { return; }
      registros.push({
        numDoc: n.id,
        tipoDoc: n.td,
        nombre: n.nom,
        fechaNacimiento: n.fn,
        edad2027: n.e27,
        nivel2027: n.n27,
        continua: r.continua,
        transitoA: r.continua === 'NO' ? txt(r.transitoA) : '',
        transitoSubdireccion: txt(r.transitoSubdireccion),
        transitoJardin: txt(r.transitoJardin)
      });
    });
    return registros;
  }

  function confirmarEnvio() {
    var registros = armarRegistros();
    var total = estado.ninos.length;
    var incompletos = registros.filter(function (r) {
      return !respuestaCompleta(estado.respuestas[r.numDoc]);
    }).length;
    var sinResponder = total - registros.length;

    if (!registros.length) {
      mensaje('mensajesFormulario', 'error', 'No hay nada para enviar',
        'Diligencie al menos una niña o un niño antes de enviar.');
      return;
    }

    var detalle = 'Se enviarán ' + registros.length + ' de ' + total +
                  ' niñas y niños del nivel ' + estado.seleccion.nivel + '.';
    if (sinResponder) {
      detalle += ' Quedan ' + sinResponder + ' sin responder; podrá completarlos ' +
                 'después y volver a enviar (no se duplican).';
    }
    if (incompletos) {
      detalle += ' Hay ' + incompletos + ' con el tránsito incompleto.';
    }

    abrirModal({
      titulo: 'Enviar el formulario',
      texto: detalle,
      botones: [
        { texto: 'Sí, enviar ahora', clase: 'boton--enviar', accion: function () {
            cerrarModal();
            enviar(registros);
          } },
        { texto: 'Revisar antes', clase: 'boton--secundario', accion: cerrarModal }
      ]
    });
  }

  function enviar(registros) {
    var s = estado.seleccion;

    var paquete = {
      accion: 'guardar',
      token: estado.auth.token,
      idEnvio: idAleatorio(),
      subdireccion: s.subdireccion,
      codJardin: s.codJardin,
      jardin: s.jardin,
      nivel: s.nivel,
      ninosEnElNivel: estado.ninos.length,
      habeasDataAceptado: hdActivo() ? (s.aceptoHabeasData ? 'SI' : 'NO') : 'N/A',
      habeasDataVersion: hdActivo() ? txt(CONFIG.HABEAS_DATA.VERSION) : '',
      habeasDataFecha: s.fechaAceptacionHD || '',
      registros: registros
    };

    estado.enviando = true;
    $('btnEnviar').disabled = true;
    $('btnAtras').disabled = true;
    $('btnEnviar').innerHTML = '<span class="rueda rueda--blanca"></span> Enviando…';
    limpiarZona('mensajesFormulario');

    apiPost(paquete)
      .then(function (respuesta) {
        if (!respuesta.ok) {
          if (respuesta.codigo === 'SESION') { estado.enviando = false; guardarBorrador(); forzarRelogin('Su sesión expiró. Vuelva a ingresar; su avance quedó pre-guardado.'); return; }
          throw new Error(respuesta.error || 'Error desconocido.');
        }
        exitoEnvio(respuesta, paquete);
      })
      .catch(function (err) { falloEnvio(err, paquete); });
  }

  function exitoEnvio(respuesta, paquete) {
    estado.enviando = false;
    $('btnEnviar').textContent = 'ENVIAR';
    $('btnAtras').disabled = false;

    borrarBorrador();

    var s = estado.seleccion;
    $('finTitulo').textContent = respuesta.duplicado
      ? 'Este formulario ya estaba enviado'
      : 'Formulario enviado correctamente';

    var cuerpo = $('finDetalle');
    limpiar(cuerpo);
    [
      ['Subdirección local', s.subdireccion],
      ['Jardín infantil', s.jardinCorto || s.jardin],
      ['Nivel', s.nivel],
      ['Diligenciado por', estado.auth.nombre + ' (' + estado.auth.usuario + ' · ' + estado.auth.rol + ')'],
      ['Niñas y niños enviados', String(paquete.registros.length)],
      ['Registros nuevos', String(respuesta.filasNuevas || 0)],
      ['Registros actualizados', String(respuesta.filasActualizadas || 0)],
      ['Fecha y hora', respuesta.hora || hoyTexto()]
    ].forEach(function (par) {
      var fila = crear('div', 'contexto__linea');
      var k = crear('span', 'contexto__clave');
      k.textContent = par[0];
      var v = crear('span', 'contexto__valor');
      v.textContent = par[1];
      fila.appendChild(k);
      fila.appendChild(v);
      cuerpo.appendChild(fila);
    });

    pintarBorradores();
    mostrarPantalla('pantallaFin');
  }

  function falloEnvio(err, paquete) {
    estado.enviando = false;
    $('btnEnviar').textContent = 'ENVIAR';
    $('btnAtras').disabled = false;
    actualizarProgreso();
    guardarBorrador();

    var motivo = err && err.name === 'AbortError'
      ? 'El envío tardó demasiado y se canceló.'
      : (err && err.message ? err.message : 'Error de conexión.');

    mensaje('mensajesFormulario', 'error', 'No se pudo enviar',
      motivo + ' Su avance quedó pre-guardado en este dispositivo: ' +
      'revise la conexión y presione ENVIAR de nuevo. Si el formulario ya había ' +
      'llegado, el sistema no lo duplicará.');

    // Deja el paquete disponible para soporte tecnico.
    try {
      localStorage.setItem('rec2027:ultimoEnvioFallido', JSON.stringify({
        hora: hoyTexto(), motivo: motivo, paquete: paquete
      }));
    } catch (e) {}

    window.scrollTo(0, 0);
  }

  /* ======================================================================
     13. MENSAJES Y MODAL
     ==================================================================== */

  function mensaje(zonaId, tipo, titulo, texto) {
    var zona = $(zonaId);
    var caja = crear('div', 'mensaje mensaje--' + tipo);
    var t = crear('strong');
    t.textContent = titulo;
    caja.appendChild(t);
    caja.appendChild(document.createTextNode(texto));
    zona.appendChild(caja);
  }

  function limpiarZona(zonaId) { limpiar($(zonaId)); }

  function abrirModal(cfg) {
    var capa = $('capaModal');
    $('modalTitulo').textContent = cfg.titulo;
    $('modalTexto').textContent = cfg.texto;

    var acciones = $('modalAcciones');
    limpiar(acciones);
    cfg.botones.forEach(function (b) {
      var btn = crear('button', 'boton ' + b.clase);
      btn.type = 'button';
      btn.textContent = b.texto;
      btn.addEventListener('click', b.accion);
      acciones.appendChild(btn);
    });

    capa.classList.remove('oculto');
    var primero = acciones.querySelector('button');
    if (primero) { primero.focus(); }
  }

  function cerrarModal() {
    $('capaModal').classList.add('oculto');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    if (!$('capaPolitica').classList.contains('oculto')) {
      cerrarPolitica(false);
    } else if (!$('capaModal').classList.contains('oculto')) {
      cerrarModal();
    }
  });

  /* ======================================================================
     14. AVISO AL CERRAR CON CAMBIOS SIN ENVIAR
     ==================================================================== */

  window.addEventListener('beforeunload', function (e) {
    var enFormulario = !$('pantallaFormulario').classList.contains('oculto');
    if (!enFormulario) { return; }
    var hayRespuestas = Object.keys(estado.respuestas).length > 0;
    if (hayRespuestas && !estado.enviando) {
      guardarBorrador();
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

})();
