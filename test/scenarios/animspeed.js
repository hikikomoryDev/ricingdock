// Zoom and bounce take longer at lower speed and less at higher.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    const dock = t.dock()._dock;
    const it = dock._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = it.get_transformed_position();
    const [w, h] = it.get_transformed_size();
    const max = dock._g.maxScale;
    for (const speed of [50, 100, 200]) {
        s.set_int('animation-speed', speed);
        await t.wait(200);
        const t0 = t.GLib.get_monotonic_time();
        await t.move(x + w / 2, y + h / 2, 1);
        let grown = -1;
        for (let i = 0; i < 200 && grown < 0; i++) {
            if (it.currentScale >= 1 + (max - 1) * 0.95)
                grown = (t.GLib.get_monotonic_time() - t0) / 1000;
            await t.wait(5);
        }
        await t.move(960, 300, 1500);
        const b0 = t.GLib.get_monotonic_time();
        it.bounce(true);
        while (it._bouncing && t.GLib.get_monotonic_time() - b0 < 5e6)
            await t.wait(10);
        const bounce = (t.GLib.get_monotonic_time() - b0) / 1000;
        t.log(`speed ${speed}%: zoom to 95% in ${grown.toFixed(0)} ms, bounce ${bounce.toFixed(0)} ms`);
    }
}
