export default async function (t) {
    await t.move(960, 300);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const files = dock._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = files.get_transformed_position();
    const [w, h] = files.get_transformed_size();
    await t.move(x + w / 2, y + h / 2, 700);
    await t.shot('hover');
}
