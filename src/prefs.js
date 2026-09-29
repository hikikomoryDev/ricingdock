// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 hikikomoriDev

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {css, parseColor} from './util.js';

// A preset is a whole dock: look, size, placement and behaviour.
// Dark Mint is the author's own setup; Dark Glass keeps its layout and
// swaps the look for tinted frosted glass with a white accent.
const DARK_MINT = {
    'mode': 'full', 'position': 'bottom', 'alignment': 'center', 'margin': 10,
    'show-apps-button': true, 'show-apps-position': 'start-edge',
    'dock-height': 76, 'padding-top': 8, 'padding-bottom': 8, 'padding-linked': true,
    'padding-sides': 8, 'spacing': 20,
    'magnify': true, 'magnify-style': 'single', 'magnify-scale': 1.3, 'magnify-spread': 2.5,
    'magnify-push': true, 'magnify-active': true,
    'background-color': 'rgb(0,0,0)', 'blur': true, 'blur-radius': 45, 'blur-brightness': 0.85,
    'corner-radius': 18, 'border-width': 0, 'border-color': 'rgba(110,231,200,0.45)', 'shadow': true,
    'accent-color': 'rgb(110,231,200)', 'indicator-style': 'pill', 'hover-highlight': false,
    'visibility': 'fixed', 'show-running': true, 'show-badges': true, 'hide-overview-dash': true,
    'click-action': 'cycle', 'scroll-cycles': true, 'show-labels': false,
    'animation-speed': 104, 'launch-bounce': true, 'attention-bounce': true,
};

const PRESETS = [
    {name: 'Dark Mint', keys: DARK_MINT},
    {
        name: 'Dark Glass',
        keys: {
            ...DARK_MINT,
            'background-color': 'rgba(18,18,24,0.40)', 'blur': true, 'blur-radius': 60, 'blur-brightness': 0.8,
            'border-width': 1, 'border-color': 'rgba(255,255,255,0.14)',
            'accent-color': 'rgb(255,255,255)',
        },
    },
];

function applyPreset(batch, preset) {
    const settings = batch;
    settings.delay();
    for (const [key, value] of Object.entries(preset.keys)) {
        if (typeof value === 'boolean')
            settings.set_boolean(key, value);
        else if (typeof value === 'string')
            settings.set_string(key, value);
        else if (Number.isInteger(value) && settings.settings_schema.get_key(key).get_value_type().dup_string() === 'i')
            settings.set_int(key, value);
        else
            settings.set_double(key, value);
    }
    settings.apply();
}

function parseRgba(str) {
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(str))
        rgba.parse('white');
    return rgba;
}

// A small round swatch: the preset's background with its accent as a ring.
const Swatch = GObject.registerClass(
class RicingDockSwatch extends Gtk.DrawingArea {
    _init(background, accent) {
        super._init({content_width: 22, content_height: 22, valign: Gtk.Align.CENTER});
        const bg = parseRgba(background);
        const ring = parseRgba(accent);
        this.set_draw_func((area, cr, w, h) => {
            const r = Math.min(w, h) / 2;
            cr.arc(w / 2, h / 2, r - 1, 0, 2 * Math.PI);
            cr.setSourceRGBA(0.11, 0.11, 0.17, 1);
            cr.fillPreserve();
            cr.setSourceRGBA(bg.red, bg.green, bg.blue, Math.max(bg.alpha, 0.15));
            cr.fillPreserve();
            cr.setLineWidth(2.5);
            cr.setSourceRGBA(ring.red, ring.green, ring.blue, 1);
            cr.stroke();
            cr.$dispose();
        });
    }
});

export default class RicingDockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(660, 780);
        window.search_enabled = true;

        window.add(this._lookPage(settings));
        window.add(this._layoutPage(settings));
        window.add(this._behaviourPage(settings));
    }

    // ------------------------------------------------------------ rows

    _switch(settings, key, title, subtitle = '') {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', 0);
        return row;
    }

    _spin(settings, key, title, lower, upper, step, subtitle = '') {
        const isInt = settings.settings_schema.get_key(key).get_value_type().dup_string() === 'i';
        const row = Adw.SpinRow.new_with_range(lower, upper, step);
        row.set({title, subtitle, digits: isInt ? 0 : 2});
        const read = () => (isInt ? settings.get_int(key) : settings.get_double(key));
        row.value = read();
        row.connect('notify::value', () => {
            if (Math.abs(row.value - read()) < 1e-6)
                return;
            if (isInt)
                settings.set_int(key, Math.round(row.value));
            else
                settings.set_double(key, row.value);
        });
        settings.connect(`changed::${key}`, () => {
            if (Math.abs(row.value - read()) > 1e-6)
                row.value = read();
        });
        return row;
    }

    // options: [nick, short label, optional line explaining the choice]
    // A slider row. `get`/`set` work in whole pixels; writes wait until the
    // slider rests for a moment so the dock isn't rebuilt on every step.
    _scaleRow(title, subtitle, lower, upper, get, set) {
        const row = new Adw.ActionRow({title, subtitle});
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, lower, upper, 1);
        scale.set({
            width_request: 260,
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            digits: 0,
            valign: Gtk.Align.CENTER,
        });
        scale.set_value(get());
        // `set` may write several keys; the slider must neither follow the
        // half-written state nor treat its own repositioning as user input.
        let pending = 0, writing = false, syncing = false;
        row.sync = () => {
            if (writing || pending || Math.round(scale.get_value()) === get())
                return;
            syncing = true;
            scale.set_value(get());
            syncing = false;
        };
        scale.connect('value-changed', () => {
            if (syncing)
                return;
            if (pending)
                GLib.source_remove(pending);
            pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 90, () => {
                pending = 0;
                const v = Math.round(scale.get_value());
                if (v !== get()) {
                    writing = true;
                    try {
                        set(v);
                    } finally {
                        writing = false;
                    }
                }
                row.sync();
                return GLib.SOURCE_REMOVE;
            });
        });
        scale.connect('destroy', () => pending && GLib.source_remove(pending));
        row.add_suffix(scale);
        return row;
    }

    _slider(settings, key, title, lower, upper, subtitle = '') {
        const row = this._scaleRow(title, subtitle, lower, upper,
            () => settings.get_int(key), v => settings.set_int(key, v));
        settings.connect(`changed::${key}`, () => row.sync());
        return row;
    }

    _combo(settings, key, title, options) {
        const row = new Adw.ComboRow({
            title,
            model: Gtk.StringList.new(options.map(([, label]) => label)),
        });
        const sync = () => {
            const i = options.findIndex(([nick]) => nick === settings.get_string(key));
            if (i >= 0 && row.selected !== i)
                row.selected = i;
            row.subtitle = options[row.selected]?.[2] ?? '';
        };
        sync();
        row.connect('notify::selected', () => {
            const nick = options[row.selected]?.[0];
            if (nick && nick !== settings.get_string(key))
                settings.set_string(key, nick);
        });
        settings.connect(`changed::${key}`, sync);
        return row;
    }

    _color(settings, key, title, subtitle = '') {
        const row = new Adw.ActionRow({title, subtitle});
        const button = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: true, title}),
            valign: Gtk.Align.CENTER,
        });
        const sync = () => {
            const current = parseRgba(settings.get_string(key));
            if (!current.equal(button.rgba))
                button.rgba = current;
        };
        sync();
        button.connect('notify::rgba', () => {
            const value = button.rgba.to_string();
            if (!parseRgba(settings.get_string(key)).equal(button.rgba))
                settings.set_string(key, value);
        });
        settings.connect(`changed::${key}`, sync);
        row.add_suffix(button);
        row.activatable_widget = button;
        return row;
    }

    _group(title, rows, description = '') {
        const group = new Adw.PreferencesGroup({title, description});
        rows.forEach(r => group.add(r));
        return group;
    }

    // ------------------------------------------------------------ pages

    _lookPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Look'),
            icon_name: 'applications-graphics-symbolic',
        });

        const presets = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('A preset sets the whole dock: look, size, placement and behaviour. Tune anything afterwards.'),
        });
        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            homogeneous: true,
            max_children_per_line: 2,
            min_children_per_line: 2,
            column_spacing: 8,
            row_spacing: 8,
        });
        for (const preset of PRESETS) {
            const box = new Gtk.Box({spacing: 10, halign: Gtk.Align.CENTER});
            box.append(new Swatch(preset.keys['background-color'], preset.keys['accent-color']));
            box.append(new Gtk.Label({label: _(preset.name)}));
            const button = new Gtk.Button({child: box});
            button.connect('clicked', () => applyPreset(this.getSettings(), preset));
            flow.append(button);
        }
        presets.add(flow);
        page.add(presets);

        // Glass: how see-through the dock is, and how much the wallpaper
        // behind it is blurred. Opacity is the alpha of the background color,
        // so it and the color picker always agree.
        const opacity = this._scaleRow(_('Opacity'), _('0 is clear glass, 100 is solid'), 0, 100,
            () => Math.round(parseColor(settings.get_string('background-color')).a * 100),
            v => settings.set_string('background-color',
                css({...parseColor(settings.get_string('background-color')), a: 1}, v / 100)));
        settings.connect('changed::background-color', () => opacity.sync());

        const blur = this._scaleRow(_('Blur'), _('How frosted the glass is; 0 turns blur off'), 0, 100,
            () => (settings.get_boolean('blur') ? settings.get_int('blur-radius') : 0),
            v => {
                if (v > 0)
                    settings.set_int('blur-radius', v);
                settings.set_boolean('blur', v > 0);
            });
        const brightness = this._scaleRow(_('Blur brightness'), _('Darkens the blurred wallpaper'), 0, 100,
            () => Math.round(settings.get_double('blur-brightness') * 100),
            v => settings.set_double('blur-brightness', v / 100));
        const syncBlur = () => {
            blur.sync();
            brightness.sync();
            brightness.sensitive = settings.get_boolean('blur');
        };
        for (const key of ['blur', 'blur-radius', 'blur-brightness'])
            settings.connect(`changed::${key}`, syncBlur);
        syncBlur();

        // A full-width dock always has square corners.
        const radius = this._spin(settings, 'corner-radius', _('Corner radius'), 0, 64, 1,
            _('Island only: the full-width dock is always square'));
        const syncRadius = () => (radius.sensitive = settings.get_string('mode') === 'island');
        settings.connect('changed::mode', syncRadius);
        syncRadius();

        page.add(this._group(_('Background'), [
            this._color(settings, 'background-color', _('Color')),
            opacity,
            blur,
            brightness,
            radius,
            this._spin(settings, 'border-width', _('Border width'), 0, 8, 1),
            this._color(settings, 'border-color', _('Border color')),
            this._switch(settings, 'shadow', _('Shadow')),
        ]));

        page.add(this._group(_('Icons'), [
            this._color(settings, 'accent-color', _('Accent color'), _('Running indicators, counters and progress')),
            this._combo(settings, 'indicator-style', _('Running indicator'), [
                ['dots', _('Dots'), _('One per window, up to four')],
                ['pill', _('Pill'), _('Grows with the number of windows')],
                ['line', _('Line')],
                ['none', _('None')],
            ]),
            this._switch(settings, 'hover-highlight', _('Highlight under the pointer')),
        ]));
        return page;
    }

    _layoutPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Layout'),
            icon_name: 'view-grid-symbolic',
        });

        const margin = this._spin(settings, 'margin', _('Gap from the screen edge'), 0, 64, 1,
            _('0 attaches the island to the edge'));
        const syncMode = () => (margin.sensitive = settings.get_string('mode') === 'island');
        settings.connect('changed::mode', syncMode);
        syncMode();

        page.add(this._group(_('Placement'), [
            this._combo(settings, 'mode', _('Width'), [
                ['island', _('Island'), _('Just around the icons, floating above the edge')],
                ['full', _('Full width'), _('Stretched along the whole screen edge')],
            ]),
            this._combo(settings, 'position', _('Screen edge'), [
                ['bottom', _('Bottom')],
                ['left', _('Left')],
                ['right', _('Right')],
            ]),
            this._combo(settings, 'alignment', _('Alignment'), [
                ['start', _('Start'), _('Left, or top on a side dock')],
                ['center', _('Center')],
                ['end', _('End'), _('Right, or bottom on a side dock')],
            ]),
            this._combo(settings, 'show-apps-position', _('Show Apps button'), [
                ['end', _('After the icons')],
                ['start', _('Before the icons')],
                ['end-edge', _('Far right'), _('At the right end of a full-width dock (bottom on a side dock)')],
                ['start-edge', _('Far left'), _('At the left end of a full-width dock (top on a side dock)')],
            ]),
            margin,
        ]));

        page.add(this._sizeGroup(settings));

        const scale = this._spin(settings, 'magnify-scale', _('Largest size'), 1.1, 2.5, 0.05,
            _('How big the icon under the pointer gets'));
        const spread = this._spin(settings, 'magnify-spread', _('Spread'), 1, 5, 0.25,
            _('How many neighbours grow with it, in icons'));
        const style = this._combo(settings, 'magnify-style', _('What grows'), [
            ['single', _('One icon'), _('Only the icon under the pointer')],
            ['wave', _('Wave'), _('Neighbours grow too, like on a Mac')],
        ]);
        const syncMagnify = () => {
            const on = settings.get_boolean('magnify');
            style.sensitive = scale.sensitive = on;
            spread.sensitive = on && settings.get_string('magnify-style') === 'wave';
        };
        settings.connect('changed::magnify', syncMagnify);
        settings.connect('changed::magnify-style', syncMagnify);
        syncMagnify();
        page.add(this._group(_('Magnification'), [
            this._switch(settings, 'magnify', _('Magnify icons under the pointer')),
            this._switch(settings, 'magnify-push', _('Neighbours make room'),
                _('Off: the icon grows over its own place and the row stays still')),
            style,
            scale,
            spread,
        ]));
        return page;
    }

    // Height plus the two paddings; the icons take what is left. Linked, one
    // slider moves both paddings and keeps the ratio between them.
    _sizeGroup(settings) {
        const top = () => settings.get_int('padding-top');
        const bottom = () => settings.get_int('padding-bottom');
        let ratio = 0.5;
        const captureRatio = () => {
            const sum = top() + bottom();
            ratio = sum > 0 ? top() / sum : 0.5;
        };
        captureRatio();

        const height = this._slider(settings, 'dock-height', _('Dock height'), 24, 200,
            _('Width on a side dock. Icons grow to fill it.'));
        const link = this._switch(settings, 'padding-linked', _('Change both paddings together'),
            _('Keeps the ratio between top and bottom'));
        const both = this._scaleRow(_('Padding'), _('Above and below the icons, together'), 0, 128,
            () => top() + bottom(),
            v => {
                const t = Math.round(v * ratio);
                settings.set_int('padding-top', t);
                settings.set_int('padding-bottom', v - t);
            });
        const above = this._slider(settings, 'padding-top', _('Padding above icons'), 0, 64,
            _('On a side dock: the side away from the screen edge'));
        const below = this._slider(settings, 'padding-bottom', _('Padding below icons'), 0, 64,
            _('On a side dock: the side at the screen edge'));
        for (const key of ['padding-top', 'padding-bottom']) {
            settings.connect(`changed::${key}`, () => {
                both.sync();
                if (!settings.get_boolean('padding-linked'))
                    captureRatio();
            });
        }
        const syncLink = () => {
            const linked = settings.get_boolean('padding-linked');
            both.visible = linked;
            above.visible = below.visible = !linked;
            captureRatio();
        };
        settings.connect('changed::padding-linked', syncLink);
        syncLink();

        return this._group(_('Size'), [
            height,
            link,
            both,
            above,
            below,
            this._slider(settings, 'padding-sides', _('Padding at the ends'), 0, 96,
                _('Left and right, the same on both (top and bottom on a side dock)')),
            this._slider(settings, 'spacing', _('Space between icons'), 0, 32),
        ]);
    }

    // Quick pick for how much the icon under the pointer grows. It sets the
    // same keys as Layout → Magnification; a value set there that is not in
    // this list shows up as its own entry.
    _zoomChoice(settings) {
        const presets = [0, 1.1, 1.2, 1.3, 1.5, 2.0];
        const label = v => (v === 0 ? _('Off') : `×${v.toFixed(1)}`);
        const row = new Adw.ComboRow({title: _('Magnification'), subtitle: _('How much the icon under the pointer grows')});
        let values = [];
        let syncing = false;
        const sync = () => {
            const on = settings.get_boolean('magnify');
            const scale = settings.get_double('magnify-scale');
            const current = on ? scale : 0;
            values = [...presets];
            if (!values.some(v => Math.abs(v - current) < 0.001))
                values.push(current);
            syncing = true;
            row.model = Gtk.StringList.new(values.map(v =>
                presets.includes(v) ? label(v) : `×${v.toFixed(2)} (${_('custom')})`));
            row.selected = values.findIndex(v => Math.abs(v - current) < 0.001);
            syncing = false;
        };
        sync();
        row.connect('notify::selected', () => {
            if (syncing)
                return;
            const v = values[row.selected];
            if (v === undefined)
                return;
            if (v === 0) {
                settings.set_boolean('magnify', false);
            } else {
                settings.set_double('magnify-scale', v);
                settings.set_boolean('magnify', true);
            }
        });
        settings.connect('changed::magnify', sync);
        settings.connect('changed::magnify-scale', sync);
        return row;
    }

    _behaviourPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Behaviour'),
            icon_name: 'preferences-system-symbolic',
        });

        page.add(this._group(_('Visibility'), [
            this._combo(settings, 'visibility', _('Show the dock'), [
                ['fixed', _('Always'), _('Windows stay clear of it')],
                ['intellihide', _('Smart hide'), _('Hides when a window covers it')],
                ['autohide', _('Auto hide'), _('Shows when the pointer reaches the edge')],
            ]),
        ]));

        page.add(this._group(_('Apps'), [
            this._switch(settings, 'show-running', _('Show running apps that are not pinned')),
            this._switch(settings, 'show-apps-button', _('Show Apps button')),
            this._switch(settings, 'show-badges', _('Unread counters and progress'),
                _('Reported by apps such as Telegram')),
        ]));

        page.add(this._group(_('Clicks'), [
            this._combo(settings, 'click-action', _('Clicking a running app'), [
                ['cycle', _('Minimize or switch'), _('A second click minimizes, or switches between its windows')],
                ['focus', _('Focus only'), _('Always brings the app to the front')],
            ]),
            this._switch(settings, 'scroll-cycles', _('Scroll to switch windows')),
        ]));

        page.add(this._group(_('Animation'), [
            this._slider(settings, 'animation-speed', _('Animation speed'), 25, 300,
                _('Percent: 100 is normal, lower is slower, higher is faster')),
            this._zoomChoice(settings),
            this._switch(settings, 'magnify-active', _('Keep the active app magnified'),
                _('The icon of the app in focus stays big when the pointer leaves the dock')),
            this._switch(settings, 'number-hints', _('Numbers while holding Super'),
                _('Super+1…9 opens the pinned app with that number')),
            this._switch(settings, 'launch-bounce', _('Bounce on launch')),
            this._switch(settings, 'attention-bounce', _('Bounce on new messages'),
                _('Also when an app asks for attention')),
        ]));

        page.add(this._group(_('Extras'), [
            this._switch(settings, 'show-labels', _('App names on hover')),
            this._switch(settings, 'hide-overview-dash', _('Hide the GNOME dash in the overview')),
        ]));
        return page;
    }
}
