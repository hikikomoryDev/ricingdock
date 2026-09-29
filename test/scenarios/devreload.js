// The dev loader swaps code on disable/enable without restarting the shell.
export default async function (t) {
    await t.wait(1200);
    const uuid = 'ricingdock@hikikomoriDev';
    const ext = () => t.Main.extensionManager.lookup(uuid);
    const inner = () => ext().stateObj._inner;
    t.log(`first: state=${ext().state} items=${inner()?._dock?._items.size} showApps=${inner()?._dock?._showApps?.labelText}`);
    const dir = ext().path;
    // A second build whose dock reports a marker, as a code change would.
    const cmd = `bash -c "mkdir -p ${dir}/builds/second && cp ${dir}/builds/first/*.js ${dir}/builds/second/ && ` +
        `sed -i 's|    get geometry() {|    get devMarker() { return 42; }\\n\\n    get geometry() {|' ${dir}/builds/second/dock.js && echo second > ${dir}/builds/current"`;
    t.GLib.spawn_command_line_sync(cmd);
    t.Main.extensionManager.disableExtension(uuid);
    await t.wait(500);
    t.Main.extensionManager.enableExtension(uuid);
    await t.wait(1200);
    t.log(`second: state=${ext().state} items=${inner()?._dock?._items.size} marker=${inner()?._dock?.devMarker}`);
    const dockActors = [];
    const walk = a => {
        if (a.name === 'ricingdock')
            dockActors.push(a);
        a.get_children().forEach(walk);
    };
    walk(global.stage);
    t.log(`dock strips on stage: ${dockActors.length}`);
    await t.shot('reloaded');
}
