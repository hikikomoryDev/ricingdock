// Full width: square corners on the tint, the shadow and the blurred layer.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const ext = t.dock();
    const s = ext._settings;
    s.set_string('visibility', 'fixed');
    for (const [mode, blur] of [['full', true], ['full', false], ['island', true]]) {
        s.set_string('mode', mode);
        s.set_boolean('blur', blur);
        await t.wait(800);
        const d = ext._dock;
        t.log(`${mode} blur=${blur}: flags=${d._cornerFlags()} tint="${d._tint.get_style()}"`);
        await t.shot(`${mode}-${blur ? 'blur' : 'plain'}`);
    }
}
