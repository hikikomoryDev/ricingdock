// Every alignment in both widths: where the dock lands, and whether the icon
// under the pointer is the one that grows.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const ext = t.dock();
    const s = ext._settings;
    s.set_string('visibility', 'fixed');
    const combos = [
        ['island', 'bottom', 'start'], ['island', 'bottom', 'end'], ['island', 'bottom', 'center'],
        ['full', 'bottom', 'start'], ['full', 'bottom', 'end'],
        ['island', 'left', 'end'], ['full', 'right', 'start'],
    ];
    for (const [mode, position, alignment] of combos) {
        s.set_string('mode', mode);
        s.set_string('position', position);
        s.set_string('alignment', alignment);
        await t.move(960, 400, 700);
        const dock = ext._dock;
        const [px, py] = dock._panel.get_transformed_position();
        const [pw, ph] = dock._panel.get_transformed_size();
        const [bx, by] = dock._box.get_transformed_position();
        const name = `${mode}-${position}-${alignment}`;
        await t.shot(name);

        const item = dock._items.get('org.gnome.Nautilus.desktop');
        const [ix, iy] = item.get_transformed_position();
        const [iw, ih] = item.get_transformed_size();
        await t.glide(ix + iw / 2 + (dock._g.vertical ? 0 : -60), iy + ih / 2 + (dock._g.vertical ? -60 : 0),
            ix + iw / 2, iy + ih / 2, 8, 300);
        await t.wait(400);
        let biggest = null;
        for (const [id, it] of dock._items) {
            if (!biggest || it._scale > biggest[1])
                biggest = [id, it._scale];
        }
        const [hx, hy] = global.get_pointer();
        const under = global.stage.get_actor_at_pos(t.Clutter.PickMode.REACTIVE, hx, hy);
        let a = under;
        while (a && !a.app)
            a = a.get_parent();
        t.log(`${name}: panel ${px},${py} ${pw}x${ph} row@${bx},${by} | biggest ${biggest[0].replace('.desktop', '')} x${biggest[1].toFixed(2)} | under pointer ${a?.app?.get_id().replace('.desktop', '')}`);
        await t.shot(`${name}-hover`);
    }
}
