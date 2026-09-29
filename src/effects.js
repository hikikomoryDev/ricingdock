// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 hikikomoriDev

import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

// Shell.BlurEffect has no corner radius, so the blurred wallpaper is cut to
// the dock's shape here. Corners are a mask of flags: top-left, top-right,
// bottom-right, bottom-left, so an edge-attached dock keeps square corners
// against the screen edge.
const DECLARATIONS = `
uniform vec2 size;
uniform float radius;
uniform vec4 corners;
`;

const CODE = `
vec2 p = cogl_tex_coord_in[0].xy * size;
bool left = p.x < size.x * 0.5;
bool top = p.y < size.y * 0.5;
float on = top ? (left ? corners.x : corners.y) : (left ? corners.w : corners.z);
vec2 q = min(p, size - p);
if (on > 0.5 && q.x < radius && q.y < radius) {
    float d = length(vec2(radius) - q);
    cogl_color_out *= clamp(radius - d + 0.5, 0.0, 1.0);
}
`;

export const RoundedCornersEffect = GObject.registerClass(
class RicingDockRoundedCorners extends Shell.GLSLEffect {
    _init(params) {
        super._init(params);
        this._sizeLocation = this.get_uniform_location('size');
        this._radiusLocation = this.get_uniform_location('radius');
        this._cornersLocation = this.get_uniform_location('corners');
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, CODE, false);
    }

    setShape(width, height, radius, corners) {
        this.set_uniform_float(this._sizeLocation, 2, [width, height]);
        this.set_uniform_float(this._radiusLocation, 1, [radius]);
        this.set_uniform_float(this._cornersLocation, 4, corners);
        this.queue_repaint();
    }
});
