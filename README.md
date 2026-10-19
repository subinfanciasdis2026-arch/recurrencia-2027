[README.md](https://github.com/user-attachments/files/33667627/README.md)
# Recurrencia 2027 · SDIS (con login)

Aplicativo móvil para revisar si las niñas y los niños que hoy están en el
servicio desean continuar en 2027 en el nivel que les corresponde por su edad.

Secretaría Distrital de Integración Social · Subdirección para la Infancia.

---

## Seguridad

- **Ingreso con usuario y contraseña.** Dos roles: `administrador` y `diligenciador`.
- **Primer ingreso** → cambio obligatorio de contraseña (se guarda cifrada con hash + sal).
- **Datos protegidos:** los datos de los niños NO se publican en GitHub; viven en una
  carpeta de **Google Drive** y el backend los entrega solo a usuarios autenticados.
- Usuarios se administran en la pestaña **Usuarios** del consolidado (5 sugeridos).

---

## Dónde va cada cosa

| Destino | Qué sube |
|---|---|
| GitHub Pages | `index.html`, `styles.css`, `app.js`, `config.js`, `README.md` (sin `data/`) |
| Google Drive | carpeta `datos_recurrencia` con `index.json` + los 16 `<subdireccion>.json` |
| Apps Script | `Codigo.gs` |

## Configuración

1. `config.js`: pegar la URL de Apps Script (`/exec`).
2. `Codigo.gs`: pegar el **ID de la carpeta de Drive** en `ID_CARPETA_DATOS`
   (o nombrar la carpeta `datos_recurrencia`).

## Usuarios sugeridos (cambian su contraseña al entrar)

| Usuario | Rol | Contraseña inicial |
|---|---|---|
| admin | administrador | Admin#Rec2026 |
| diligenciador1 | diligenciador | Dili#Uno2026 |
| diligenciador2 | diligenciador | Dili#Dos2026 |
| diligenciador3 | diligenciador | Dili#Tres2026 |
| diligenciador4 | diligenciador | Dili#Cuatro2026 |

Vienen también en `Usuarios_Recurrencia.xlsx`.

---

El resto del aplicativo funciona igual que antes (búsqueda subdirección → jardín →
nivel, lista de niños con SÍ/NO continuar y tránsito, pre-guardado, envío que
actualiza sin duplicar, habeas data). La identidad de quien diligencia sale del
login, ya no se escribe.
