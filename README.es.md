# clipboard-khipu

*[Read in English](README.md)*

Un historial de portapapeles para GNOME Shell pensado para desarrolladores — como el `Super+V` de
Windows, pero nativo de GNOME y cuidadoso con el formato.

Presiona tu atajo (por ejemplo **`Super+V`**) para ver lo que copiaste y pegarlo de vuelta
**exactamente** como estaba.

## Instalación

Requiere GNOME Shell 46–50 (ver [Compatibilidad](#compatibilidad)), además de `curl` y `unzip`.

### 1. Instalar la extensión

```bash
curl -fsSL https://raw.githubusercontent.com/RuddyQuispe/clipboard-khipu/master/install.sh | bash
```

Esto descarga la última versión ya compilada desde
[GitHub Releases](https://github.com/RuddyQuispe/clipboard-khipu/releases) y la instala en
`~/.local/share/gnome-shell/extensions/` — no necesitas Node ni herramientas de compilación.

Si GNOME Shell no la detecta de inmediato (siempre pasa en Wayland la primera vez), cierra sesión y
vuelve a entrar, luego corre:

```bash
gnome-extensions enable clipboard-khipu@ruddyquispe.github.io
```

Comprueba que esté corriendo — el estado debe decir `ACTIVE`:

```bash
gnome-extensions info clipboard-khipu@ruddyquispe.github.io
```

### 2. Elegir tu atajo

La extensión viene **sin** atajo — extensions.gnome.org prohíbe que una extensión de portapapeles
defina uno por defecto — así que no hace nada hasta que elijas uno. Abre las preferencias:

```bash
gnome-extensions prefs clipboard-khipu@ruddyquispe.github.io
```

y escríbelo en **Shortcut → Open history**, por ejemplo `<Super>v`. O configúralo desde una terminal:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/clipboard-khipu@ruddyquispe.github.io/schemas \
  set org.gnome.shell.extensions.clipboard-khipu open-history "['<Super>v']"
```

> [!IMPORTANT]
> GNOME ya usa **`Super+V`** para abrir la lista de notificaciones. Si eliges `Super+V` y se abre
> la lista de notificaciones en lugar del historial, libéralo — `Super+M` sigue abriendo las
> notificaciones:
>
> ```bash
> gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>m']"
> ```

### Actualizar

Corre el comando de instalación otra vez — siempre descarga la última versión, y tu historial y
preferencias se conservan. Luego cierra sesión y vuelve a entrar (o deshabilita y habilita la
extensión) para que GNOME Shell cargue el código nuevo.

> ¿Vienes de 0.1.x y `Super+V` dejó de funcionar? Desde 0.2.0 no hay atajo por defecto; vuelve a
> configurarlo como en el [paso 2](#2-elegir-tu-atajo).

### Desinstalar

```bash
gnome-extensions uninstall clipboard-khipu@ruddyquispe.github.io
rm -rf ~/.local/share/clipboard-khipu   # opcional: borra el historial guardado
```

> ¿Prefieres compilarla tú mismo? Ve a [Contribuir](#contribuir) para la instalación desde código
> fuente.

## Cómo funciona

0. Configura tu atajo una vez en **Preferencias → Atajo** (por ejemplo `<Super>v`) — ver
   [Instalación, paso 2](#2-elegir-tu-atajo). No hay atajo por defecto, como exige
   extensions.gnome.org para extensiones de portapapeles.
1. Copia cosas como lo harías normalmente — texto, una imagen, o archivos en un gestor de archivos
   (Nautilus).
2. Presiona tu atajo (por ejemplo **`Super+V`**). Aparece un popup con búsqueda que lista tus elementos copiados
   recientemente.
3. Elige uno — con el teclado o el mouse — y se pega de vuelta en lo que estabas usando,
   **exactamente** como fue copiado. JSON, YAML y código mantienen su formato byte por byte.

Si solo hay **un** elemento en el historial, el atajo lo pega de inmediato — sin menú.

Pegar es **consciente de la terminal**: en una app normal envía `Ctrl+V`, y en una terminal envía
`Ctrl+Shift+V` (ver [Terminales](#terminales)).

## El formato se conserva

Copiar nunca es solo texto. Un rango de celdas de LibreOffice Calc lleva además la tabla, los
colores y los estilos de celda; un fragmento de una página web lleva sus negritas, enlaces y
títulos. Todo eso viaja como *formatos* adicionales junto al texto plano, y la app donde pegás
elige el más rico que sepa interpretar.

clipboard-khipu guarda **todos**, y entrega el formateado cuando la app donde pegás es un
procesador de texto, una planilla o un cliente de correo:

- Calc → Writer pega la **tabla completa**, con colores y estilos de celda.
- Una selección con estilos desde el navegador o un editor con resaltado mantiene su formato
  dentro de un documento.
- En todo lo demás — terminales, editores de código, y cualquier app fuera de la lista — recibís
  texto plano.

Los elementos con formato aparecen etiquetados como `html`, `rtf` o `formatted`. Presioná
**`Ctrl+Enter`** en lugar de `Enter` para forzar texto plano incluso en una app con formato.

Si tu suite de oficina o cliente de correo no recibe el formato, agregá su clase de ventana en
**Preferencias → Formatos → Pistas de apps con formato**.

> **¿Por qué una lista y no mandar siempre el formato?** GNOME permite que una extensión publique
> solo *un* formato a la vez en el portapapeles, así que clipboard-khipu tiene que elegir. Mandarle
> HTML a una app que solo entiende texto plano haría que **no se pegue nada** — por eso todo lo que
> no está reconocido como app con formato recibe la versión plana a propósito.

## Los archivos se adaptan a dónde los pegás

Un archivo copiado tampoco tiene una única forma correcta, así que decide el destino:

- **Un gestor de archivos** — el archivo se copia o se mueve, igual que si hubieras pegado en
  Nautilus.
- **Un navegador o cliente de chat** — el archivo mismo, listo para subir, igual que si lo hubieras
  arrastrado. Pegá en Gmail, Slack o un chat y sube el archivo, no su ruta.
- **Un documento o cliente de correo** — una imagen sola queda incrustada; varios archivos llegan
  como lista de archivos.
- **Una terminal** — la ruta pelada.
- **Cualquier otro lugar** (editores, diálogos) — la **ruta como texto**, una por línea. Es lo único
  que un input común puede aceptar: los formatos de archivo los entienden solo los gestores de
  archivos, y mandarle uno a un campo de texto haría que no se pegue nada.

Apretá **Ctrl+Enter** para obtener la ruta pelada en cualquier lado, incluso dentro de un navegador
— útil cuando el campo que estás llenando espera texto y no un archivo.

> [!NOTE]
> La subida funciona en páginas que manejan el pegado, que son la mayoría de los chats y ventanas de
> redacción. En un botón **Elegir archivo** pelado no se puede pegar — ningún navegador lo soporta —
> así que usá su selector de archivos, o arrastrá el archivo.

Si al pegar en tu gestor de archivos recibís la ruta en lugar del archivo, agregá su clase de
ventana en **Preferencias → Archivos → Pistas de gestor de archivos**; si un navegador o app de chat
pega la ruta en vez de subir el archivo, agregala en **Pistas de subida de archivos**.

## Atajos

Todo se maneja con el teclado. Una vez abierto el popup:

| Tecla | Acción |
|-----|--------|
| *tu atajo* | Abrir el historial de portapapeles (configúralo en Preferencias → Atajo, p. ej. `Super+V`) |
| `↑` / `↓` | Mover la selección |
| *escribir algo* | Filtrar la lista |
| `Enter` | Pegar el elemento seleccionado |
| `Ctrl+Enter` | Pegar el elemento seleccionado como texto plano (descarta el formato) |
| `Shift+Delete` | Eliminar el elemento seleccionado del historial |
| `Ctrl+P` | Fijar o desfijar el elemento seleccionado |
| `Esc` | Cerrar el popup |
| Clic en una fila | Pegar ese elemento |
| Clic afuera | Cerrar el popup |

`Shift+Delete` (no `Delete` solo) elimina un elemento, así `Delete` queda libre para editar el
texto de búsqueda — la misma convención que usa Firefox para descartar una sugerencia del
historial.

Los elementos fijados aparecen arriba de todo en el popup, nunca se descartan y no cuentan para el
tamaño del historial; `Shift+Delete` igual los elimina. La selección arranca siempre en tu última
copia, así que `Super+V` y `Enter` la pegan como siempre. Al desfijar un elemento vuelve al flujo
normal sin borrarse nada; si el historial está por encima del límite, se recorta en la próxima copia.

## Terminales

Las terminales basadas en VTE (GNOME Terminal, Console, Ptyxis, Konsole, kitty, Alacritty, foot, …)
pegan con `Ctrl+Shift+V`, no con `Ctrl+V`. clipboard-khipu detecta la ventana con foco y elige la
combinación correcta automáticamente.

La detección es una lista configurable de "pistas" de clase de ventana. Si tu terminal no es
reconocida, abre las preferencias y agrega su WM class en **Terminales → Pistas de terminal**
(separadas por coma).

## Preferencias

```bash
gnome-extensions prefs clipboard-khipu@ruddyquispe.github.io
```

- **Tamaño del historial** — cuántos elementos guardar (25 por defecto).
- **Auto-pegar al seleccionar** — pegar de inmediato al elegir, o solo ponerlo en el portapapeles.
- **Capturar imágenes / archivos** — activar o desactivar por tipo de contenido.
- **Conservar el formato** — guarda los formatos HTML/RTF/propios de cada app (activado por
  defecto), qué apps los reciben, y límites de tamaño para cuánto guardar.
- **Excluir contraseñas** — omite contenido marcado como contraseña por la app de origen.
- **Pistas de gestor de archivos** — clases de ventana que reciben un archivo copiado como archivo.
- **Pistas de subida de archivos** — clases de ventana que reciben un archivo copiado para adjuntar.
- **Pistas de terminal** — clases de ventana que deben pegar con `Ctrl+Shift+V`.
- **Atajo** — definir la tecla que abre el historial (vacío por defecto; borra el campo para quitarlo).
- **Limpiar historial** — borra todos los elementos, imágenes y formatos guardados.

## Compatibilidad

| GNOME Shell | Ubuntu | Estado |
|-------------|--------|--------|
| 46 | 24.04 LTS | ✅ Probado |
| 47 | 24.10 | ⚠️ Debería funcionar — no verificado en hardware real |
| 48 | 25.04 | ⚠️ Debería funcionar — no verificado en hardware real |
| 49 | 25.10 | ⚠️ Debería funcionar — no verificado en hardware real |
| 50 | (Fedora 42) | ✅ Probado |

Una sola compilación cubre de GNOME 46 a 50 — la superficie de la API que usa la extensión es
estable en ese rango.

> **Ubuntu 22.04 LTS (GNOME 42) no está soportado.** GNOME 45 reemplazó el sistema de módulos de
> extensiones anterior por módulos ES estándar, incompatible con 42–44. Soportarlas requeriría una
> compilación legacy aparte.

## Privacidad

El historial se guarda localmente en `~/.local/share/clipboard-khipu/` (los metadatos en
`history.json`, las imágenes en `images/`, los formatos guardados en `blobs/`). Nada sale de tu
máquina. Puedes borrarlo cuando quieras
desde la ventana de preferencias ("Limpiar historial"), y el contenido marcado como contraseña
nunca se guarda.

## Contribuir

Las contribuciones son bienvenidas — el proyecto tiene licencia MIT. Para arquitectura, reglas del
proyecto y el flujo de trabajo spec-driven, lee [AGENTS.md](AGENTS.md) (en inglés).

La extensión está escrita en TypeScript contra los tipos de `@girs/gnome-shell` y se compila a GJS
plano con `tsc` (GJS resuelve los imports ESM `gi://` / `resource://` de forma nativa — sin
bundler).

### Obtener el código fuente

```bash
git clone https://github.com/RuddyQuispe/clipboard-khipu.git
cd clipboard-khipu
npm install
```

### Compilar

```bash
npm run build            # tsc: src/*.ts -> dist/*.js
npm run watch            # recompila al detectar cambios
npm run compile-schemas  # glib-compile-schemas schemas/
```

### Instalar tu compilación local en GNOME

```bash
npm run install-link     # symlink de dist/ + schemas/ + metadata en el directorio de extensiones
```

### Ciclo de recarga en desarrollo

Después de recompilar, recarga la extensión para que GNOME Shell tome el código nuevo:

```bash
gnome-extensions disable clipboard-khipu@ruddyquispe.github.io
gnome-extensions enable  clipboard-khipu@ruddyquispe.github.io
```

En Wayland, si el disable/enable no surte efecto (GJS cachea los módulos ES), cierra sesión y
vuelve a entrar para un reinicio limpio del Shell.

> Existe un flujo de trabajo con shell anidado (`scripts/run-nested.sh`), pero depende de
> `gnome-shell --nested`, que fue **eliminado en GNOME 50**. En 50+ usa el ciclo disable/enable o
> el re-login de arriba.

### Actualizar

Si instalaste desde código fuente (no con `install.sh`), traer commits nuevos no actualiza la
extensión en ejecución por sí solo — `install-link` enlaza cada archivo de `dist/*.js` de forma
individual, así que una recompilación nueva igual necesita volver a enlazarse:

```bash
git pull
npm install                # por si cambiaron las dependencias
npm run build
npm run compile-schemas
npm run install-link       # se puede volver a correr siempre, sin riesgo
```

Luego recarga la extensión como en el [ciclo de recarga](#ciclo-de-recarga-en-desarrollo) de
arriba (disable/enable, o cerrar sesión y volver a entrar en Wayland si eso no funciona).

### Verificar

```bash
npx tsc --noEmit         # typecheck estricto contra los tipos reales de introspección de GNOME 50
npm test                 # pruebas unitarias con GJS (requiere gjs y glib-compile-schemas)
```

`npm test` ejecuta la suite de `tests/` con `gjs`, fuera de GNOME Shell. Cubre todo lo que no
necesita el compositor: detección del tipo de texto, la búsqueda/orden/etiquetas del popup, las
decisiones de pegado (qué ventana recibe qué formato), los valores por defecto del esquema de
configuración y el almacén del historial sobre un directorio de datos descartable (guardado literal,
deduplicación, fijados, desalojo, persistencia, limpieza de blobs). La captura del portapapeles, el
popup y el pegado sintetizado viven dentro de GNOME Shell, así que siguen necesitando una pasada
manual de QA: pegar texto con formato intacto, una imagen, archivos desde Nautilus; pegado directo
con un solo elemento; búsqueda, borrado, clic afuera; el historial sobrevive a un disable/enable.

### Publicar una versión

Actualiza `version-name` en `metadata.json`, haz merge a `master` y sube un tag `v*.*.*` que
coincida. GitHub Actions compila, empaqueta un `.zip`, y lo publica como asset de un Release;
`install.sh` siempre instala el release marcado como *Latest*:

```bash
git tag v0.2.1
git push origin v0.2.1
```

## Licencia

MIT — ver [LICENSE](LICENSE).
