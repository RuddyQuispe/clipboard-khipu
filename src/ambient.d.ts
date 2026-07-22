// Registers ambient `gi://*` and `resource://*` module declarations for the whole
// project (tsc, not the runtime — GJS resolves these natively at runtime).
import '@girs/gnome-shell/ambient';
import '@girs/gnome-shell/extensions/global';
import '@girs/gnome-shell/extensions/extension/ambient';
import '@girs/gnome-shell/extensions/prefs/ambient';
import '@girs/gjs/ambient';
import '@girs/gjs/dom';
