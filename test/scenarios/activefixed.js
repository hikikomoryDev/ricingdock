// The active icon keeps one size, frame by frame, while the pointer sweeps
// over its neighbours and onto it.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    const dock = () => t.dock()._dock;
    const tracker = t.Shell.WindowTracker.get_default();
    t.launch('org.gnome.Calculator.desktop');
    for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== 'org.gnome.Calculator.desktop'; i++)
        await t.wait(300);
    await t.move(960, 300, 1200);
    const calc = dock()._items.get('org.gnome.Calculator.desktop');
    const files = dock()._items.get('org.gnome.Nautilus.desktop');
    // The icon right after the calculator, whatever app it is.
    const icons = [...dock()._items.values()];
    const next = icons[icons.indexOf(calc) + 1];
    const c = it => { const [x, y] = it.get_transformed_position(); return [x + 30, y + 30]; };
    const seen = [];
    const tl = new t.Clutter.Timeline({actor: dock()._panel, duration: 1000, repeat_count: -1});
    tl.connect('new-frame', () => seen.push(calc.currentScale));
    tl.start();
    const [fx, fy] = c(files), [cx] = c(calc), [mx] = c(next);
    await t.move(fx, fy, 500);                             // hover a neighbour first
    await t.glide(fx, fy, cx, fy, 12, 200);                // quick onto the active icon
    await t.wait(500);
    await t.glide(cx, fy, mx, fy, 8, 150);                 // past it to the other side
    await t.glide(mx, fy, cx, fy, 8, 150);                 // and back onto it
    await t.wait(500);
    await t.move(960, 300, 800);                           // leave the dock
    tl.stop();
    const min = Math.min(...seen), max = Math.max(...seen);
    t.log(`active icon scale over ${seen.length} frames: min ${min.toFixed(4)} max ${max.toFixed(4)}`);
    const [ix] = files.get_transformed_position();
    t.log(`files at rest ${files.currentScale.toFixed(2)}, calc ${calc.currentScale.toFixed(3)}`);
}
