// The same icon actor is scaled through the whole grow/shrink: no swap.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const dock = t.dock()._dock;
    const files = dock._items.get('org.gnome.Nautilus.desktop');
    const icon = files.icon;
    const [x, y] = files.get_transformed_position();
    const [w, h] = files.get_transformed_size();
    const samples = [];
    let swapped = false;
    const probe = () => {
        if (files.icon !== icon || !icon.visible)
            swapped = true;
        samples.push(icon.get_transformed_size()[0].toFixed(1));
    };
    await t.move(x + w / 2, y + h / 2, 1);
    for (let i = 0; i < 12; i++) {
        probe();
        await t.wait(40);
    }
    await t.move(960, 400, 1);
    for (let i = 0; i < 14; i++) {
        probe();
        await t.wait(40);
    }
    const kids = files._body.get_children().length;
    t.log(`children in tile body: ${kids}, swapped: ${swapped}`);
    t.log(`icon width over time: ${samples.join(' ')}`);
}
