// Fast sweep across several icons (one shrinks while the next grows): count
// how often any icon jumps back against its own direction of travel.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', t.GLib.getenv('MODE') || 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const items = [...dock._items.values()];
    const [x0, y0] = items[1].get_transformed_position();
    const [x1] = items[7].get_transformed_position();
    const [, h] = items[1].get_transformed_size();
    const track = items.map(() => []);
    let sampling = true;
    // Record on every relayout of the row, like the trace from the real session.
    const id = dock._box.connect('notify::allocation', () => {
        if (sampling)
            items.forEach((it, k) => track[k].push(it.get_transformed_position()[0]));
    });
    const done = Promise.resolve();
    await t.glide(x0, y0 + h / 2, x1, y0 + h / 2, 30, 450);   // quick pass over 6 icons
    await t.glide(x1, y0 + h / 2, x0, y0 + h / 2, 30, 450);   // and back
    await t.wait(500);
    sampling = false;
    await done;
    dock._box.disconnect(id);
    t.log(`relayouts recorded: ${track[0].length}`);
    let total = 0, jumps = 0;
    const per = track.map(xs => {
        // A reversal is a move against the previous non-zero move that is
        // itself undone right away: the 1-px back-and-forth the eye sees.
        let rev = 0;
        for (let i = 2; i < xs.length; i++) {
            const a = xs[i - 1] - xs[i - 2], b = xs[i] - xs[i - 1];
            if (Math.abs(a) > 1e-3 && Math.abs(b) > 1e-3 && Math.sign(a) !== Math.sign(b) && Math.abs(a) <= 1.01 && Math.abs(b) <= 1.01)
                rev++;
        }
        total += rev;
        return rev;
    });
    t.log(`1-px back-and-forth jumps per icon: ${per.join(' ')} (total ${total})`);
}
