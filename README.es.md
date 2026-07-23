# clipboard-khipu

*[Read in English](README.md)*

Un historial de portapapeles para GNOME Shell pensado para desarrolladores — como el `Super+V` de
Windows, pero nativo de GNOME y cuidadoso con el formato.

Presiona **`Super+V`** para ver lo que copiaste y pegarlo de vuelta **exactamente** como estaba.

## Instalación

```bash
curl -fsSL https://raw.githubusercontent.com/RuddyQuispe/clipboard-khipu/master/install.sh | bash
```

Esto descarga la última versión ya compilada y la instala — no necesitas Node ni herramientas de
compilación.
Para actualizar a una versión más nueva después, corre el mismo comando otra vez.

Si GNOME Shell no la detecta de inmediato, cierra sesión y vuelve a entrar, luego corre:

```bash
gnome-extensions enable clipboard-khipu@ruddy.local
```

> ¿Prefieres compilarla tú mismo? Ve a [Contribuir](#contribuir) para la instalación desde código
> fuente.

## Cómo funciona

1. Copia cosas como lo harías normalmente — texto, una imagen, o archivos en un gestor de archivos
   (Nautilus).
2. Presiona **`Super+V`**. Aparece un popup con búsqueda que lista tus elementos copiados
   recientemente.
3. Elige uno — con el teclado o el mouse — y se pega de vuelta en lo que estabas usando,
   **exactamente** como fue copiado. JSON, YAML y código mantienen su formato byte por byte.

Si solo hay **un** elemento en el historial, `Super+V` lo pega de inmediato — sin menú.

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

## Atajos

Todo se maneja con el teclado. Una vez abierto el popup:

| Tecla | Acción |
|-----|--------|
| `Super+V` | Abrir el historial de portapapeles (configurable) |
| `↑` / `↓` | Mover la selección |
| *escribir algo* | Filtrar la lista |
| `Enter` | Pegar el elemento seleccionado |
| `Ctrl+Enter` | Pegar el elemento seleccionado como texto plano (descarta el formato) |
| `Shift+Delete` | Eliminar el elemento seleccionado del historial |
| `Esc` | Cerrar el popup |
| Clic en una fila | Pegar ese elemento |
| Clic afuera | Cerrar el popup |

`Shift+Delete` (no `Delete` solo) elimina un elemento, así `Delete` queda libre para editar el
texto de búsqueda — la misma convención que usa Firefox para descartar una sugerencia del
historial.

## Terminales

Las terminales basadas en VTE (GNOME Terminal, Console, Ptyxis, Konsole, kitty, Alacritty, foot, …)
pegan con `Ctrl+Shift+V`, no con `Ctrl+V`. clipboard-khipu detecta la ventana con foco y elige la
combinación correcta automáticamente.

La detección es una lista configurable de "pistas" de clase de ventana. Si tu terminal no es
reconocida, abre las preferencias y agrega su WM class en **Terminales → Pistas de terminal**
(separadas por coma).

## Preferencias

```bash
gnome-extensions prefs clipboard-khipu@ruddy.local
```

- **Tamaño del historial** — cuántos elementos guardar (25 por defecto).
- **Auto-pegar al seleccionar** — pegar de inmediato al elegir, o solo ponerlo en el portapapeles.
- **Capturar imágenes / archivos** — activar o desactivar por tipo de contenido.
- **Conservar el formato** — guarda los formatos HTML/RTF/propios de cada app (activado por
  defecto), qué apps los reciben, y límites de tamaño para cuánto guardar.
- **Excluir contraseñas** — omite contenido marcado como contraseña por la app de origen.
- **Pistas de terminal** — clases de ventana que deben pegar con `Ctrl+Shift+V`.
- **Atajo** — reasignar la tecla que abre el historial.
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
gnome-extensions disable clipboard-khipu@ruddy.local
gnome-extensions enable  clipboard-khipu@ruddy.local
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
```

Todavía **no hay una suite de pruebas automatizada** — la verificación es el typecheck de arriba
más una pasada manual de QA (pegar texto con formato intacto, una imagen, archivos desde Nautilus;
pegado directo con un solo elemento; búsqueda, borrado, clic afuera; el historial sobrevive a un
disable/enable). Agregar pruebas automatizadas es una contribución bienvenida.

### Publicar una versión

Sube un tag `v*.*.*`. GitHub Actions compila, empaqueta un `.zip`, y lo publica como asset de un
Release que `install.sh` consume:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Licencia

MIT — ver [LICENSE](LICENSE).
