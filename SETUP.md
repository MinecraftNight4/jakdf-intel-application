# Activity de Discord: puesta en marcha (paso a paso)

Este es un repositorio **independiente** del bot. Lo unico que toma del bot es la lista de personajes, los iconos y las fuentes (`npm run sync`).

Una Activity es una página web que Discord muestra dentro de un iframe. Este repositorio contiene:

| Carpeta | Qué es |
|---|---|
| `src/`, `index.html` | La página (lo que ve el usuario) |
| `api/` | 2 funciones de servidor: `token.js` (login) y `profile.js` (leer/guardar perfiles en Turso) |
| `shared/` | Los codecs (perfil y squadcode) en JavaScript, idénticos a los de Python |
| `public/` | Lista de personajes, iconos y fuentes copiados del bot (`npm run sync`) |
| `test/vectors.json` | Codigos generados por Python para comprobar que los codecs coinciden (se regenera desde el repo del bot) |

## 0. Requisitos
- **Node.js LTS** (https://nodejs.org) y una cuenta gratuita de **Vercel** (https://vercel.com) conectada a tu GitHub.
- La base de Turso que ya usa el bot (URL + token).

## 1. Preparar el proyecto en tu PC
Con el repo del bot clonado en una carpeta vecina (por ejemplo `../intel-jakdf-service`):
```
npm install
npm test                                  # debe decir "OK: ... iguales a Python"
npm run sync -- ../intel-jakdf-service    # copia roster.json, iconos y fuentes a public/
```
Haz commit de **todo**, incluido `package-lock.json` y `public/` (pero no `.env` ni `node_modules`, ya están ignorados) y súbelo a tu repo nuevo de GitHub.

**Cuando cambie el roster o los iconos del bot**, repite `npm run sync -- <ruta>` y haz commit.
**Cuando cambie un formato de codigo del bot** (perfil o squadcode), ejecuta en el repo del bot `python tools/gen_codec_vectors.py <ruta>/test/vectors.json` y corre `npm test` aqui: si falla, los codecs de `shared/` hay que actualizarlos.

## 2. Discord Developer Portal  (https://discord.com/developers/applications)
Usa **la misma aplicación del bot**.
1. **Installation** → Installation Contexts: marca *User Install* y *Guild Install*.
2. **OAuth2** → Redirects: añade `https://127.0.0.1` (es solo un marcador; el SDK hace la redirección) y guarda.
3. En **OAuth2** copia el **Client ID** y pulsa *Reset Secret* para ver el **Client Secret**. El secret es como una contraseña: solo irá a Vercel.
4. **Activities → Settings** → activa *Enable Activities*. Esto crea un comando de entrada "Launch".

> Una Activity sin publicar solo la pueden abrir tú y los miembros del equipo de la aplicación.

## 3. Vercel
1. *Add New → Project* → elige el repositorio.
2. Deja el *Root Directory* por defecto (la raíz). El framework debería detectarse como *Vite*.
3. En *Environment Variables* añade (Production):

| Nombre | Valor |
|---|---|
| `VITE_DISCORD_CLIENT_ID` | Client ID (público) |
| `DISCORD_CLIENT_ID` | el mismo Client ID |
| `DISCORD_CLIENT_SECRET` | Client Secret |
| `TURSO_DATABASE_URL` | la URL de tu base (`libsql://…`) |
| `TURSO_AUTH_TOKEN` | token de escritura |
| `TURSO_READ_TOKEN` | opcional: token de solo lectura (`turso db tokens create <db> --read-only`) |

4. *Deploy*. Al terminar tendrás una dirección como `mi-proyecto.vercel.app`.

Cada vez que hagas `git push` a este repo, Vercel vuelve a desplegar solo. Si cambias una variable de entorno, hay que volver a desplegar.

## 4. Conectar Discord con Vercel
En el portal: **Activities → URL Mappings** → añade
- Prefix: `/`
- Target: `mi-proyecto.vercel.app`  ← **sin** `https://`

## 5. Probar
Abre Discord, entra a un servidor donde esté tu bot (o a un chat privado), abre el **App Launcher** (botón + junto al chat o el icono de cohete) y elige tu aplicación. Debería cargar el inicio con SQUAD y PROFILE.

Prueba esto: PROFILE → *Edit my profile* → marca unos personajes → *Save*. Luego usa `/profile display` en el bot: tras unos minutos (el bot refresca su copia cada 15 min) debería mostrar lo mismo.

## Si algo falla
- **"No se pudo iniciar…"**: abre las herramientas de desarrollo de Discord de escritorio (Ctrl+Shift+I) y mira la consola y la pestaña Red.
- **Pantalla en blanco**: revisa que el Target del URL Mapping no tenga `https://` ni `/` al final.
- **"Discord rechazó el código"**: Client ID/Secret mal copiados en Vercel (¿redesplegaste después de cambiarlos?).
- **"La base de datos no responde"**: URL/token de Turso, o cuota agotada.
- **"No se encontró roster.json"**: falta ejecutar `npm run sync -- <ruta al bot>` y subir `public/`.
- **Sin iconos**: genera los iconos (`tools/icongen.py` en el repo del bot) y vuelve a ejecutar `npm run sync -- <ruta al bot>`.

## Seguridad (lo importante)
- El navegador **nunca** ve el Client Secret ni los tokens de Turso: solo existen en las variables de Vercel.
- `/api/profile` averigua quién eres preguntándole a Discord con tu token; el ID del usuario nunca se acepta desde el navegador. Solo puedes escribir **tu** perfil; leer perfiles ajenos está permitido (son públicos).
- La web guarda con el botón *Save* (1 escritura). No guarda en cada clic.

---

## Personalizar el aspecto (sin tocar JavaScript)

Todo el estilo está en `src/styles.css`.

- **Colores globales:** las variables de `:root` (arriba del archivo).
- **Colores del editor de squads:** el bloque `.squad { --g-panel: ...; --m-panel: ...; }` justo al inicio de la sección "editor de builds". `--g-*` es el panel de la grilla y `--m-*` el panel principal con las 3 pestañas.
- **Botones:** `.btn`, `.big.yellow / .green / .sky / .orange` (Share/Import) y `.mini`.
- **Fondos propios:** copia la imagen a `public/bg/` y úsala con `background: url("/bg/mi-fondo.webp") center/cover;`.
- **Por temporada:** en `main.js` pon `document.documentElement.dataset.season = "winter"` y en el CSS escribe `html[data-season="winter"] { --g-panel: #9fd8ff; }`.

Con `npm run dev` ves los cambios al instante.

## Noticias del inicio

La pantalla principal lee `news_list` de un JSON publicado en GitHub a traves de `/api/news` (la Activity no puede llamar
a dominios externos directamente). Por defecto usa
`https://raw.githubusercontent.com/MinecraftNight4/jakdf-backup-data/refs/heads/main/last.json`; para cambiarlo define la
variable de entorno `NEWS_URL` en Vercel. Cada noticia necesita `text`, `http` (https), `icon` (imagen `data:image/...;base64,`)
y `expire` (segundos unix; `0` = no caduca). Las caducadas no se muestran. El resultado se cachea 5 minutos en el CDN de Vercel.

## Iconos

Los iconos estan incrustados como SVG en `src/icons.js` (sin cargar Google Fonts, que Discord bloquea dentro de la Activity).
Para usar el glifo oficial de Material Symbols, copia el contenido del `.svg` y sustituyelo en la entrada correspondiente.

## Imagen de "SHARE SQUAD IMAGE"

Imita la del bot. Usa las fuentes y los iconos de personajes de `public/` y, opcionalmente, `public/icon/duo.png` y
`public/icon/and.png` (los separadores entre tarjetas; si faltan se dibujan `~` y `&`). Copialos desde `sys_save/profile/icon/` del bot.
