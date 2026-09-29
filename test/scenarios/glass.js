// Glass settings reach the dock live: opacity, blur on/off and strength.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'island');
    s.set_string('visibility', 'fixed');
    const d = () => t.dock()._dock;
    for (const [color, blur, radius, name] of [
        ['rgba(27,29,43,0.15)', true, 60, 'clear-glass'],
        ['rgba(27,29,43,0.55)', true, 20, 'light-frost'],
        ['rgba(27,29,43,0.30)', false, 20, 'no-blur'],
    ]) {
        s.set_string('background-color', color);
        s.set_int('blur-radius', radius);
        s.set_boolean('blur', blur);
        await t.wait(700);
        t.log(`${name}: tint "${d()._tint.get_style().split(';')[0]}" blur layer ${Boolean(d()._blurEffect)} radius ${d()._blurEffect?.radius ?? '-'}`);
        await t.shot(name);
    }
}
