// The running dot must not move while its icon zooms.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_string('visibility', 'fixed');
    t.launch('org.gnome.Calculator.desktop');
    await t.wait(2500);
    await t.move(960, 300, 600);
    const dock = t.dock()._dock;
    for (const push of [false, true]) {
        s.set_boolean('magnify-push', push);
        await t.wait(600);
        const calc = dock._items.get('org.gnome.Calculator.desktop');
        const dot = () => {
            const d = calc._indicator.get_children()[0];
            const [x, y] = d.get_transformed_position();
            const [w] = d.get_transformed_size();
            const [ix] = calc.get_transformed_position();
            const [iw] = calc.get_transformed_size();
            return [(x + w / 2).toFixed(1), y.toFixed(1), (ix + iw / 2).toFixed(1)];
        };
        const rest = dot();
        const [x, y] = calc.get_transformed_position();
        const [w, h] = calc.get_transformed_size();
        await t.move(x + w / 2, y + h / 2, 700);
        const zoomed = dot();
        t.log(`push=${push}: dot centre x/y at rest ${rest[0]},${rest[1]} (slot centre ${rest[2]}) | zoomed ${zoomed[0]},${zoomed[1]} (slot centre ${zoomed[2]})`);
        await t.move(960, 300, 600);
    }
}
