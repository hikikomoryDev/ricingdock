// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 hikikomoriDev

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Dock} from './dock.js';
import {LauncherEntries} from './badges.js';

export default class RicingDock extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._badges = new LauncherEntries();
        this._dock = new Dock(this._settings, this._badges, () => this._syncOverviewDash());
        this._settings.connectObject(
            'changed::hide-overview-dash', () => this._syncOverviewDash(), this);
        this._syncOverviewDash();
    }

    disable() {
        this._settings.disconnectObject(this);
        this._restoreOverviewDash();
        this._dock.destroy();
        this._dock = null;
        this._badges.destroy();
        this._badges = null;
        this._settings = null;
    }

    // The stock dash stays in the overview layout but is never shown. At the
    // bottom its empty slot is sized to our dock, which sits there in the
    // overview; on the sides the slot is collapsed so the app grid gets the space.
    _syncOverviewDash() {
        if (!this._dock?.geometry)
            return;
        const dash = Main.overview.dash;
        this._restoreOverviewDash();
        if (!this._settings.get_boolean('hide-overview-dash'))
            return;
        this._dashHidden = true;
        // A never-shown dash has no icon actors, and its icon sizing would
        // throw on every overview allocation.
        dash._adjustIconSize = () => {};
        dash.hide();
        dash.connectObject('notify::visible', () => dash.hide(), this);
        dash.set_height(this._dock.geometry.vertical ? 0 : this._dock.footprint);
    }

    _restoreOverviewDash() {
        if (!this._dashHidden)
            return;
        const dash = Main.overview.dash;
        dash.disconnectObject(this);
        delete dash._adjustIconSize;
        dash.set_height(-1);
        dash.show();
        this._dashHidden = false;
    }
}
