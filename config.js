/* ============================================================================
 *  CONFIGURACION DEL APLICATIVO  -  Recurrencia 2027 SDIS
 * ============================================================================
 *
 *  Este es el UNICO archivo que necesitas editar despues de publicar.
 *  Pega abajo la URL de tu implementacion de Google Apps Script
 *  (la que termina en /exec).
 *
 *  El bloque HABEAS_DATA (al final) contiene todos los textos legales de
 *  proteccion de datos. Puede ajustarlos la Oficina Asesora Juridica de la
 *  SDIS sin tocar el resto del aplicativo.
 *
 * ==========================================================================*/

var CONFIG = {

  // 1) URL de la aplicacion web de Google Apps Script (debe terminar en /exec)
  URL_APPS_SCRIPT: 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT',

  // 2) Titulo que se muestra en el encabezado
  TITULO: 'Recurrencia 2027',
  SUBTITULO: 'Subdirección para la Infancia · SDIS',

  // 3) Texto de la pantalla de inicio
  INTRO: 'Este formulario permite revisar si las niñas y los niños que hoy se ' +
         'encuentran en el servicio desean continuar en 2027 en el nivel que ' +
         'les corresponde por su edad.',

  // 4) Opciones del desplegable "HARÁ TRÁNSITO A" (casos normales)
  OPCIONES_TRANSITO: [
    '1. Colegio Sed.',
    '2. Opción Privada',
    '3. Traslado a otro lugar del país',
    '4. Jardín SDIS'
  ],

  // 4b) Opciones del desplegable "HARÁ TRÁNSITO A" SOLO para niñas y niños de
  //     EXTRA EDAD (no pueden continuar en la SDIS en 2027).
  OPCIONES_TRANSITO_EXTRAEDAD: [
    '1. Colegio Sed.',
    '2. Opción Privada',
    'Aún no sabe qué hacer la familia'
  ],

  // 4c) Valores de "Nivel 2027 por edad" que se marcan en ROJO (requieren atención)
  //     y cómo se reconocen (coincidencia parcial, sin importar mayúsculas).
  NIVELES_EXTRA_EDAD: 'EXTRA EDAD',
  NIVELES_ENTRE_PARES: 'ENTRE PARES',

  // 5) Texto de la opcion que abre los desplegables de tránsito a otro jardín
  OPCION_JARDIN_SDIS: '4. Jardín SDIS',

  // 6) Seguridad: longitud mínima de la nueva contraseña (debe coincidir con el backend)
  MIN_LARGO_CONTRASENA: 8,

  // 8) Segundos de espera maxima al enviar al servidor
  TIMEOUT_ENVIO_SEG: 60,

  /* ==========================================================================
   *  9) PROTECCION DE DATOS PERSONALES  (Habeas Data - Ley 1581 de 2012)
   * ------------------------------------------------------------------------
   *  Toda esta seccion es editable por la Oficina Asesora Juridica.
   *  Importante: estos textos deben ser validados por el area juridica de la
   *  SDIS antes de salir a produccion. En especial:
   *    - El NIT de la entidad (verificar el valor exacto).
   *    - El enlace URL_POLITICA a la politica oficial vigente.
   *    - El correo de protección de datos para ejercer derechos.
   *    - El texto de la DECLARACION, segun el mecanismo de autorizacion que
   *      defina la entidad para datos de niños, niñas y adolescentes.
   * ========================================================================*/
  HABEAS_DATA: {

    // Version del aviso. Cambie este valor cada vez que ajuste los textos:
    // queda registrado junto a cada envio en el consolidado.
    VERSION: 'v1 · 2026',

    // Si lo pone en false, el aviso no aparece y el aplicativo funciona como antes.
    ACTIVO: true,

    // Enlace a la politica oficial completa de la SDIS (reemplazar por el
    // enlace exacto que confirme la Oficina Juridica).
    URL_POLITICA: 'https://www.integracionsocial.gov.co/index.php/proteccion-de-datos-personales',

    // Datos del responsable del tratamiento (se muestran en la política).
    RESPONSABLE: {
      NOMBRE: 'Secretaría Distrital de Integración Social (SDIS)',
      NIT: '899.999.061-9',                 // VERIFICAR con el área jurídica
      DIRECCION: 'Carrera 7 # 32-12, Edificio San Martín, Bogotá D.C.',
      TELEFONO: '(601) 380 8330 · Línea 195',
      CORREO: 'protecciondatos@sdis.gov.co', // VERIFICAR el buzón oficial de habeas data
      CORREO_RADICACION: 'integracion@sdis.gov.co'
    },

    // Aviso breve que se ve en la pantalla de inicio, sobre la casilla.
    AVISO_CORTO:
      'La información que se diligencia corresponde a datos personales de niñas ' +
      'y niños, de especial protección. La Secretaría Distrital de Integración ' +
      'Social los trata en el marco de sus funciones y conforme a la Ley 1581 ' +
      'de 2012 y a su Política de Tratamiento de Datos Personales.',

    // Texto de la casilla obligatoria. El botón de iniciar no se habilita hasta
    // que la persona la marque.
    DECLARACION:
      'Declaro que informé al acudiente o representante del niño o la niña sobre ' +
      'el tratamiento de sus datos personales con esta finalidad, que la ' +
      'información se recolecta en ejercicio de las funciones de la SDIS y que ' +
      'conozco la Política de Tratamiento de Datos Personales de la entidad.',

    // Texto del enlace que abre la política completa.
    ENLACE_POLITICA: 'Leer la política de tratamiento de datos',

    // Titulo de la ventana de la politica completa.
    TITULO_POLITICA: 'Política de Tratamiento de Datos Personales',

    // Cuerpo de la política completa. Cada sección: { titulo, parrafos[], items[] }.
    // items es opcional (lista con viñetas).
    POLITICA: [
      {
        titulo: '1. Responsable del tratamiento',
        parrafos: [
          'La Secretaría Distrital de Integración Social (SDIS), NIT 899.999.061-9, ' +
          'con sede en la Carrera 7 # 32-12, Edificio San Martín, Bogotá D.C., es la ' +
          'responsable del tratamiento de los datos personales recolectados en este ' +
          'formulario. Canales de contacto: teléfono (601) 380 8330, Línea 195, correo ' +
          'protecciondatos@sdis.gov.co.'
        ]
      },
      {
        titulo: '2. Finalidad del tratamiento',
        parrafos: [
          'Los datos se recolectan con el fin de revisar si las niñas y los niños que ' +
          'actualmente se encuentran en el servicio desean continuar durante la vigencia ' +
          '2027 en el nivel que les corresponde por su edad, y de planear la cobertura y ' +
          'la asignación de cupos en los jardines infantiles de la SDIS.'
        ]
      },
      {
        titulo: '3. Datos que se tratan',
        parrafos: [
          'Para cada niña o niño se tratan datos de identificación (nombres y apellidos, ' +
          'tipo y número de documento, fecha de nacimiento), el nivel actual y el proyectado ' +
          'por edad, y la respuesta sobre su continuidad para 2027. Se registra además el ' +
          'nombre de la persona de la SDIS que diligencia el formulario.'
        ]
      },
      {
        titulo: '4. Datos de niñas, niños y adolescentes',
        parrafos: [
          'El tratamiento de datos de niñas, niños y adolescentes es de especial protección. ' +
          'Se realiza atendiendo a su interés superior y al respeto de sus derechos ' +
          'fundamentales, conforme al artículo 7 del Decreto 1377 de 2013, la Ley 1098 de ' +
          '2006 (Código de la Infancia y la Adolescencia) y la Constitución Política. La ' +
          'información es suministrada por el acudiente o representante legal.'
        ]
      },
      {
        titulo: '5. Derechos del titular',
        parrafos: [
          'Como titular de los datos (o su representante), de acuerdo con el artículo 8 de ' +
          'la Ley 1581 de 2012, usted puede:'
        ],
        items: [
          'Conocer, actualizar y rectificar sus datos personales.',
          'Solicitar prueba de la autorización otorgada.',
          'Ser informado sobre el uso que se ha dado a sus datos.',
          'Presentar quejas ante la Superintendencia de Industria y Comercio por ' +
          'infracciones a la ley.',
          'Revocar la autorización y/o solicitar la supresión del dato cuando no se ' +
          'respeten los principios, derechos y garantías legales.',
          'Acceder de forma gratuita a sus datos personales que hayan sido objeto de ' +
          'tratamiento.'
        ]
      },
      {
        titulo: '6. Canales para ejercer sus derechos',
        parrafos: [
          'Las consultas y reclamos pueden presentarse al correo protecciondatos@sdis.gov.co, ' +
          'en la Carrera 7 # 32-12, Edificio San Martín, Bogotá D.C., o a través de la Línea ' +
          '195. La SDIS atenderá las solicitudes en los términos y plazos previstos en la Ley ' +
          '1581 de 2012 y sus decretos reglamentarios.'
        ]
      },
      {
        titulo: '7. Marco legal y autorización',
        parrafos: [
          'El tratamiento se rige por la Constitución Política (artículo 15), la Ley 1581 de ' +
          '2012, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y la Política ' +
          'de Tratamiento de Datos Personales de la SDIS. La recolección se efectúa en ' +
          'ejercicio de las funciones legales y misionales de la entidad; la autorización del ' +
          'acudiente o representante se obtiene conforme a dicha política.'
        ]
      },
      {
        titulo: '8. Vigencia',
        parrafos: [
          'Los datos se conservarán durante el tiempo necesario para cumplir la finalidad ' +
          'descrita y las obligaciones legales de la entidad. Para consultar la política ' +
          'completa y vigente, visite el sitio web oficial de la SDIS.'
        ]
      }
    ]
  }
};
