// Dock height drives the icon size; paddings split the rest.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const ext = t.dock();
    const s = ext._settings;
    s.set_string('visibility', 'fixed');
    t.launch('org.gnome.Calculator.desktop');
    await t.wait(2500);
    await t.move(960, 300, 300);
    const cases = [
        [76, 8, 8], [48, 4, 4], [120, 10, 10], [76, 20, 2], [76, 2, 20], [40, 30, 30], [64, 0, 0],
    ];
    for (const [h, top, bottom] of cases) {
        s.set_int('dock-height', h);
        s.set_int('padding-top', top);
        s.set_int('padding-bottom', bottom);
        await t.wait(700);
        const d = ext._dock;
        const calc = d._items.get('org.gnome.Calculator.desktop');
        const [, py] = d._panel.get_transformed_position();
        const [, ph] = d._panel.get_transformed_size();
        const [, iy] = calc.get_transformed_position();
        const [, ih] = calc.get_transformed_size();
        const icon = calc.icon;
        const [, ly] = icon.get_transformed_position();
        const [, lh] = icon.get_transformed_size();
        const dot = calc._indicator.get_children()[0];
        const [, dy] = dot ? dot.get_transformed_position() : [0, -1];
        const name = `h${h}-t${top}-b${bottom}`;
        t.log(`${name}: panel ${py}+${ph} | cell ${iy - py}..${iy - py + ih} (${ih}) | icon ${Math.round(lh)} at ${Math.round(ly - py)} | dot at ${Math.round(dy - py)} | above=${iy - py} below=${py + ph - iy - ih}`);
        await t.shot(name);
    }
}
