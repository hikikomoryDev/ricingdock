// With wide spacing, clicks in the gap between icons and in the dock's
// top/bottom padding go to the nearest icon.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', t.GLib.getenv('MODE') || 'full');
    s.set_int('spacing', 24);
    s.set_double('magnify-scale', 1.3);
    s.set_boolean('magnify-push', true);
    s.set_string('visibility', 'fixed');
    s.set_string('position', t.GLib.getenv('POS') || 'bottom');
    await t.wait(900);
    const dock = t.dock()._dock;
    const vertical = dock._g.vertical;
    const ids = ['org.gnome.TextEditor.desktop', 'org.gnome.Nautilus.desktop'];
    const [a, b] = ids.map(id => dock._items.get(id));
    let hits = {};
    for (const it of [a, b]) {
        hits[it.app.get_id()] = 0;
        it.activate = () => {};
        it.connect('clicked', () => hits[it.app.get_id()]++);
    }
    const box = it => { const [x, y] = it.get_transformed_position(); const [w, h] = it.get_transformed_size(); return {x, y, w, h}; };
    const pb = dock._panel.get_transformed_position(), ps = dock._panel.get_transformed_size();
    const A = box(a), B = box(b);
    const main = (bx) => vertical ? bx.y : bx.x, mainLen = bx => vertical ? bx.h : bx.w;
    const gapMid = (main(A) + mainLen(A) + main(B)) / 2;
    const cross0 = vertical ? pb[0] : pb[1], crossLen = vertical ? ps[0] : ps[1];
    const at = (m, c) => vertical ? [c, m] : [m, c];
    const spots = {
        'gap, a bit toward Files': at(gapMid + 3, cross0 + crossLen / 2),
        'gap, a bit toward Editor': at(gapMid - 3, cross0 + crossLen / 2),
        'far-side padding above Files': at(main(B) + mainLen(B) / 2, cross0 + 2),
        'edge-side padding below Files': at(main(B) + mainLen(B) / 2, cross0 + crossLen - 2),
    };
    const owner = act => { while (act && !act.app) act = act.get_parent(); return act?.app?.get_id()?.split('.')[2] ?? `${act}`; };
    for (const [name, [x, y]] of Object.entries(spots)) {
        await t.move(960, 300, 500);
        await t.move(x, y, 700);
        const picked = owner(global.stage.get_actor_at_pos(t.Clutter.PickMode.REACTIVE, x, y));
        const before = JSON.stringify(hits);
        await t.click(x, y, t.Clutter.BUTTON_PRIMARY, 250);
        const got = Object.entries(hits).find(([k, v]) => JSON.parse(before)[k] !== v)?.[0]?.split('.')[2] ?? 'nothing';
        t.log(`${name}: clicked ${got} (under pointer ${picked})`);
    }
}
