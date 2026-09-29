// Flip settings while the shell runs, then open the preferences window.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const ext = t.dock();
    const s = ext._settings;
    t.launch('org.gnome.Calculator.desktop');
    await t.wait(2000);
    await t.move(960, 300);

    const steps = [
        ['pill + candy', () => {
            s.set_string('indicator-style', 'pill');
            s.set_string('background-color', 'rgba(255,122,154,0.30)');
            s.set_string('accent-color', 'rgb(255,198,109)');
            s.set_string('border-color', 'rgba(255,198,109,0.55)');
        }],
        ['full width', () => s.set_string('mode', 'full')],
        ['right edge', () => s.set_string('position', 'right')],
        ['no blur, line', () => {
            s.set_boolean('blur', false);
            s.set_string('indicator-style', 'line');
        }],
        ['island again, big icons, fixed', () => {
            s.set_string('position', 'bottom');
            s.set_string('mode', 'island');
            s.set_int('dock-height', 96);
            s.set_string('visibility', 'fixed');
            s.set_boolean('blur', true);
        }],
    ];
    let i = 0;
    for (const [name, fn] of steps) {
        fn();
        await t.wait(900);
        const wa = t.Main.layoutManager.getWorkAreaForMonitor(0);
        t.log(`${name}: shown=${ext._dock._shown} workarea=${wa.x},${wa.y} ${wa.width}x${wa.height}`);
        await t.shot(`live-${++i}`);
    }

    t.GLib.spawn_command_line_async('gnome-extensions prefs ricingdock@hikikomoriDev');
    await t.wait(5000);
    await t.shot('prefs-look');
    const prefsWin = global.get_window_actors().map(a => a.meta_window)
        .find(w => w.get_title()?.includes('RicingDock'));
    t.log(`prefs window: ${prefsWin ? prefsWin.get_title() : 'none'}`);

    // Lock screen and logout go through disable(); nothing may be left behind.
    const uuid = 'ricingdock@hikikomoriDev';
    t.Main.extensionManager.disableExtension(uuid);
    await t.wait(800);
    const left = [];
    const walk = a => {
        if (`${a.name ?? ''} ${a.style_class ?? ''} ${a.constructor.name}`.toLowerCase().includes('ricingdock'))
            left.push(`${a}`);
        a.get_children().forEach(walk);
    };
    walk(global.stage);
    const wa = t.Main.layoutManager.getWorkAreaForMonitor(0);
    t.log(`after disable: leftovers=${left.length} ${left.slice(0, 3).join(' ')} stock dash visible=${t.Main.overview.dash.visible} height=${t.Main.overview.dash.height} workarea=${wa.width}x${wa.height}`);
    t.Main.extensionManager.enableExtension(uuid);
    await t.wait(1200);
    t.log(`re-enabled: dock=${Boolean(t.dock()?._dock)} shown=${t.dock()?._dock?._shown}`);
    await t.shot('reenabled');
}
