// Test driver for the headless shell. Loads the scenario module named in
// RDTEST_SCENARIO and hands it a small toolbox, then quits the shell.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const OUT = GLib.getenv('RDTEST_OUT') ?? '/tmp';

function log_(msg) {
    console.log(`RDTEST ${msg}`);
}

function wait(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

export default class TestDriver extends Extension {
    enable() {
        const path = GLib.getenv('RDTEST_SCENARIO');
        if (!path)
            return;
        // Let the startup animation and the dock settle first.
        Main.layoutManager.connectObject('startup-complete', () => this._run(path), this);
        if (!Main.layoutManager._startingUp)
            this._run(path);
    }

    disable() {
        Main.layoutManager.disconnectObject(this);
    }

    async _run(path) {
        if (this._started)
            return;
        this._started = true;
        const seat = Clutter.get_default_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const now = () => GLib.get_monotonic_time();
        const t = {
            Main, Clutter, GLib, Gio, Shell, OUT,
            log: log_,
            wait,
            move: async (x, y, ms = 120) => {
                pointer.notify_absolute_motion(now(), x, y);
                await wait(ms);
            },
            // Glide the pointer in steps so motion handlers see a path.
            glide: async (x0, y0, x1, y1, steps = 12, ms = 400) => {
                for (let i = 0; i <= steps; i++) {
                    pointer.notify_absolute_motion(now(),
                        x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
                    await wait(ms / steps);
                }
            },
            click: async (x, y, button = Clutter.BUTTON_PRIMARY, ms = 300) => {
                pointer.notify_absolute_motion(now(), x, y);
                await wait(60);
                pointer.notify_button(now(), button, Clutter.ButtonState.PRESSED);
                await wait(40);
                pointer.notify_button(now(), button, Clutter.ButtonState.RELEASED);
                await wait(ms);
            },
            scroll: async (x, y, dy, ms = 300) => {
                pointer.notify_absolute_motion(now(), x, y);
                await wait(60);
                pointer.notify_discrete_scroll(now(),
                    dy > 0 ? Clutter.ScrollDirection.DOWN : Clutter.ScrollDirection.UP,
                    Clutter.ScrollSource.WHEEL);
                await wait(ms);
            },
            shot: async name => {
                const file = Gio.File.new_for_path(`${OUT}/${name}.png`);
                const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
                const shooter = new Shell.Screenshot();
                await shooter.screenshot(false, stream);
                stream.close(null);
                log_(`shot ${name}`);
            },
            launch: id => {
                const app = Shell.AppSystem.get_default().lookup_app(id);
                if (!app)
                    throw new Error(`no app ${id}`);
                app.open_new_window(-1);
            },
            dock: () => Main.extensionManager.lookup('ricingdock@hikikomoriDev')?.stateObj,
            // Pinned apps as set for this run (they differ in containers).
            favs: () => global.settings.get_strv('favorite-apps'),
            env: (name, fallback) => GLib.getenv(name) ?? fallback,
        };
        try {
            const mod = await import(`file://${path}`);
            await mod.default(t);
            log_('DONE');
        } catch (e) {
            log_(`FAIL ${e}\n${e.stack}`);
        }
        await wait(300);
        global.context.terminate();
    }
}
