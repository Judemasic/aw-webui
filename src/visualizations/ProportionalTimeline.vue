<template lang="pug">
div.pt-root(ref="root")
  div.pt-scroll(
    ref="scroll"
    :style="scrollStyle"
    @scroll="onScroll"
    @wheel="onWheel"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  )
    div.pt-inner(:style="innerStyle")
      div.pt-hour(v-for="t in ticks" :key="'h' + t.t" :style="t.labelStyle") {{ t.label }}
      div.pt-grid(v-for="t in ticks" :key="'g' + t.t" :style="t.gridStyle")

      div.pt-quiet(
        v-for="(q, i) in quiet"
        :key="'q' + i"
        :class="{ horiz: !isVertical }"
        :style="q.style"
      ) {{ q.label }}

      template(v-for="tr in laidOut")
        div.pt-head(
          v-if="tr.head"
          :key="'head-' + tr.id"
          :class="{ rot: tr.head.rotated }"
          :style="tr.head.style"
          :title="tr.label"
        ) {{ tr.head.label }}

        div.pt-blk(
          v-for="r in tr.rows"
          :key="r.key"
          :class="{ contended: r.contended, tiny: r.tiny, short: r.short, sel: r.selected, gutter: !tr.primary && !tr.wide }"
          :style="r.style"
          :title="r.title"
          tabindex="0"
          role="button"
          :aria-label="r.title"
          @click="$emit('select', r.ref, r.key)"
          @keydown.enter.prevent="$emit('select', r.ref, r.key)"
          @keydown.space.prevent="$emit('select', r.ref, r.key)"
        )
          div.pt-band(v-for="(b, bi) in r.bands" :key="bi" :style="b.style")
            div.pt-row1
              span.pt-nm {{ b.label }}
              span.pt-du(v-if="b.primary") {{ r.duration }}
            span.pt-dv(v-if="b.sub") {{ b.sub }}

      //- Roadmap 4.5. An outline on the block itself does not answer "which one is selected?":
      //- at a whole-day zoom the selected block is often three pixels of a crowded lane, and the
      //- ring around it is the same size as the block. This is a pair of rules drawn right across
      //- the drawing at the selected block's start and end, so the selection can be found from
      //- anywhere on screen instead of only once you have already found it. Last in the DOM and
      //- `pointer-events: none`, so it covers nothing and catches nothing.
      div.pt-cursor(v-if="cursor" :class="{ horiz: !isVertical }" :style="cursor")
</template>

<script lang="ts">
// A proportional timeline: time maps to distance along one axis, and *which* axis
// is a prop rather than a fork.
//
// This exists because a horizontal 24h axis cannot work on a phone. Spread a day
// across ~340pt and one hour is 14pt, so a ten-minute event draws 2.4pt wide --
// unlabelable, and far under a 44pt touch target. Turning the axis fixes it for a
// structural reason rather than an aesthetic one: vertical is the axis in surplus,
// because scrolling down is free on a phone while width is fixed. Time takes the
// free axis; the label takes the scarce one, where text reads anyway.
//
// Orientation is a prop and NOT two components on purpose. Upstream will not take a
// second timeline page, and rightly so. But vertical and horizontal are one mapping
// from time to distance with the axis as a variable -- same data, same hit-testing,
// same colours -- so this can be offered upstream as "the timeline gains a vertical
// mode below ~700px" instead. See aw-android/docs/06_ROADMAP.md 3.5b.
//
// Deliberately knows nothing about combined timelines, devices or contention. It
// takes generic tracks so roadmap 5.5b can reuse it for the plain Timeline.

import Vue from 'vue';
import { hourTicksFor } from '~/util/time';
import type { PropType } from 'vue';

/** One drawn block. `bands` splits it when several things ran at once. */
export interface PTBand {
  label: string;
  color: string;
  /** Widest band, and the one whose duration is printed. */
  primary?: boolean;
  /** Small secondary line, e.g. which device. */
  sub?: string;
}
export interface PTRow {
  /** Minutes from the start of the day. */
  start: number;
  end: number;
  bands: PTBand[];
  contended?: boolean;
  title?: string;
  /**
   * Stable identity for selection. Selection is matched on this rather than on
   * `ref`, because callers rebuild `ref` objects whenever their own state changes
   * and identity comparison would silently stop matching.
   */
  key?: string;
  /** Passed back untouched by `select`. */
  ref?: unknown;
}
export interface PTTrack {
  id: string;
  label: string;
  /** Short label for the narrow gutter header. */
  short?: string;
  /** The one that gets the width. Exactly one track should set this. */
  primary?: boolean;
  rows: PTRow[];
}

const QUIET_PX = 40;
const HOUR_LABEL_PX = 38;
const GUTTER_PX = 22;
const NARROW_PX = 640;
const WIDE_PX = 980;

// Zoom bounds, in pixels per hour. The floor is roughly a whole day on a phone
// screen; the ceiling is where a minute is wide enough that zooming further just
// wastes scroll. Pinch and ctrl-wheel both clamp to this.
const MIN_PX_PER_HOUR = 10;
const MAX_PX_PER_HOUR = 480;

const clampZoom = (v: number) => Math.max(MIN_PX_PER_HOUR, Math.min(MAX_PX_PER_HOUR, v));

export default Vue.extend({
  name: 'ProportionalTimeline',
  props: {
    tracks: { type: Array as PropType<PTTrack[]>, required: true },
    /** 'auto' picks vertical below 640px, which is where horizontal stops being readable. */
    orientation: { type: String, default: 'auto' },
    /**
     * Pixels per hour along the time axis. Supports `.sync`: pinch and ctrl-wheel
     * emit `update:pxPerHour` with a clamped value so the parent's control stays
     * in step with the gesture.
     */
    pxPerHour: { type: Number, default: 64 },
    /**
     * Wall-clock time at minute 0 of the window, as `HH:mm`.
     *
     * The axis counts minutes from the start of the *window*, not from midnight, so
     * without this the hour labels are simply wrong whenever a day does not start at
     * midnight -- and with the app's default `Start of day` of 04:00, that is always.
     * Ticks are placed on real hour boundaries rather than every 60 minutes from the
     * window's start, so a half-hour offset still labels :00 and not :30.
     */
    startClock: { type: String, default: '00:00' },
    /**
     * Scale the whole window to the viewport so the time axis never scrolls.
     * Overrides `pxPerHour`. A manual zoom gesture emits `update:fit` false so the
     * parent can drop back to explicit zoom.
     */
    fit: { type: Boolean, default: false },
    /**
     * Pixels of empty space to leave past the end of the drawing, so anything the
     * caller floats over the bottom of this component -- 4.1b's detail peek, the
     * block stepper -- can be scrolled clear of rather than sitting on top of a
     * block forever. Pure scroll length: it never moves the drawing.
     */
    bottomInset: { type: Number, default: 0 },
    /** Window shown, in minutes from midnight. */
    windowStart: { type: Number, default: 0 },
    windowEnd: { type: Number, default: 24 * 60 },
    collapseQuiet: { type: Boolean, default: true },
    /** Runs of nothing at least this long collapse to a fixed stub. */
    quietThreshold: { type: Number, default: 25 },
    showSecondary: { type: Boolean, default: true },
    height: { type: Number, default: 520 },
    /** Key of the selected row, matching `PTRow.key`. See the note on that field. */
    selectedKey: { type: String, default: null },
    formatDuration: {
      type: Function as PropType<(minutes: number) => string>,
      // Same carry bug as CombinedTimeline.fmt had: round the total, then split it,
      // or 299.6 minutes prints as "4h 60m".
      default: (m: number) => {
        const total = Math.round(m);
        const h = Math.floor(total / 60);
        const mm = total % 60;
        return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
      },
    },
  },
  data() {
    return {
      containerWidth: 0,
      ro: null as ResizeObserver | null,
      // Two-finger pinch bookkeeping. Null unless a pinch is in progress.
      pinch: null as { dist: number; px: number; client: number } | null,
    };
  },
  computed: {
    /**
     * The rate actually used to lay out the day. `fit` derives it from the
     * viewport; otherwise it is the `pxPerHour` prop, clamped so a bad value
     * from a parent cannot wedge the layout.
     */
    effectivePxPerHour(): number {
      if (this.fit) {
        const hours = (this.windowEnd - this.windowStart) / 60 || 1;
        const axis = this.isVertical
          ? this.height - 16
          : this.containerWidth - this.geom.laneOffset - 16;
        return clampZoom(axis / hours);
      }
      return clampZoom(this.pxPerHour);
    },
    isVertical(): boolean {
      if (this.orientation === 'vertical') return true;
      if (this.orientation === 'horizontal') return false;
      return this.containerWidth > 0 && this.containerWidth < NARROW_PX;
    },
    isWide(): boolean {
      return this.containerWidth >= WIDE_PX;
    },
    primaryTrack(): PTTrack | undefined {
      return this.tracks.find(t => t.primary) || this.tracks[0];
    },
    secondaryTracks(): PTTrack[] {
      if (!this.showSecondary) return [];
      return this.tracks.filter(t => t !== this.primaryTrack);
    },

    /**
     * Piecewise minute -> pixel. A day is mostly nothing; drawn to scale that is
     * twenty screens of empty scroll, so quiet runs collapse to a fixed stub and
     * everything downstream asks this rather than multiplying by a rate.
     */
    map(): { spans: any[]; total: number; pos: (t: number) => number } {
      const per = this.effectivePxPerHour / 60;
      const spans: any[] = [];
      let p = 0;
      let cur = this.windowStart;

      const busy: { start: number; end: number }[] = [];
      for (const tr of this.tracks) {
        for (const r of tr.rows) {
          const a = Math.max(r.start, this.windowStart);
          const b = Math.min(r.end, this.windowEnd);
          if (b > a) busy.push({ start: a, end: b });
        }
      }
      busy.sort((x, y) => x.start - y.start);
      const merged: { start: number; end: number }[] = [];
      for (const b of busy) {
        const last = merged[merged.length - 1];
        if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
        else merged.push({ ...b });
      }

      const push = (t0: number, t1: number, isQuiet: boolean) => {
        const len = isQuiet ? QUIET_PX : (t1 - t0) * per;
        spans.push({ t0, t1, p0: p, p1: p + len, quiet: isQuiet });
        p += len;
      };
      for (const b of merged) {
        if (b.start > cur)
          push(cur, b.start, this.collapseQuiet && b.start - cur >= this.quietThreshold);
        push(b.start, b.end, false);
        cur = b.end;
      }
      if (cur < this.windowEnd)
        push(
          cur,
          this.windowEnd,
          this.collapseQuiet && this.windowEnd - cur >= this.quietThreshold
        );

      const pos = (t: number) => {
        for (const s of spans) {
          if (t <= s.t1) {
            if (s.quiet) return s.p0 + (s.t1 > s.t0 ? ((t - s.t0) / (s.t1 - s.t0)) * QUIET_PX : 0);
            return s.p0 + (t - s.t0) * per;
          }
        }
        return p;
      };
      return { spans, total: p, pos };
    },

    /** Width available to the primary track once labels and gutters are taken. */
    geom(): any {
      const laneOffset = this.isVertical ? HOUR_LABEL_PX + 6 : 52;
      const n = this.secondaryTracks.length;
      if (!this.isVertical)
        return { laneOffset, colW: 0, primaryW: 0, rowH: n ? 54 : 74, devH: 20 };
      const colW = n
        ? this.isWide
          ? Math.min(180, (this.containerWidth - laneOffset - 30) / (n + 1.7))
          : GUTTER_PX
        : 0;
      // 18px keeps the gutter clear of the scrollbar, which otherwise sits on top of it.
      const primaryW = this.containerWidth - laneOffset - 18 - (n ? colW * n + 8 : 0);
      return { laneOffset, colW, primaryW: Math.max(60, primaryW), rowH: 0, devH: 0 };
    },

    ticks(): any[] {
      const out = [];
      const { firstTick, labelFor } = hourTicksFor(this.startClock);
      const startH = Math.floor((this.windowStart - firstTick) / 60);
      const endH = Math.ceil((this.windowEnd - firstTick) / 60);
      for (let h = startH; h <= endH; h++) {
        const t = h * 60 + firstTick;
        if (t < this.windowStart || t > this.windowEnd) continue;
        // A tick inside a collapsed stub would sit at a meaningless position.
        if (this.map.spans.some(s => s.quiet && t > s.t0 && t < s.t1)) continue;
        const d = this.map.pos(t);
        out.push({
          t,
          label: labelFor(t),
          labelStyle: this.isVertical
            ? {
                top: `${d}px`,
                left: '0',
                width: `${HOUR_LABEL_PX}px`,
                textAlign: 'right',
                paddingRight: '6px',
              }
            : { left: `${d + this.geom.laneOffset}px`, top: '2px', transform: 'translateX(-50%)' },
          gridStyle: this.isVertical
            ? { left: `${this.geom.laneOffset}px`, right: '8px', top: `${d}px`, height: '1px' }
            : { left: `${d + this.geom.laneOffset}px`, width: '1px', top: '22px', bottom: '4px' },
        });
      }
      return out;
    },

    quiet(): any[] {
      return this.map.spans
        .filter(s => s.quiet)
        .map(s => ({
          label: `${this.formatDuration(s.t1 - s.t0)} quiet`,
          style: this.isVertical
            ? {
                left: `${this.geom.laneOffset}px`,
                width: `${this.geom.primaryW}px`,
                top: `${s.p0}px`,
                height: `${QUIET_PX}px`,
              }
            : {
                left: `${s.p0 + this.geom.laneOffset}px`,
                width: `${QUIET_PX}px`,
                top: '22px',
                height: `${this.geom.rowH}px`,
              },
        }));
    },

    laidOut(): any[] {
      const out: any[] = [];
      const g = this.geom;
      const vertical = this.isVertical;

      const mkRows = (tr: PTTrack, opts: any) =>
        tr.rows
          .filter(r => r.end > this.windowStart && r.start < this.windowEnd)
          .map((r, i) => {
            const a = Math.max(r.start, this.windowStart);
            const b = Math.min(r.end, this.windowEnd);
            const d0 = this.map.pos(a);
            const extent = Math.max(3, this.map.pos(b) - d0 - 1);
            const tiny = extent < (vertical ? 20 : 60);
            // Below ~34px the secondary line clips mid-glyph; the name still fits.
            const short = !tiny && extent < 34;
            const style = vertical
              ? {
                  left: `${opts.cross}px`,
                  width: `${opts.crossSize}px`,
                  top: `${Math.max(d0, opts.minMain)}px`,
                  height: `${extent}px`,
                }
              : {
                  left: `${d0 + g.laneOffset}px`,
                  width: `${extent}px`,
                  top: `${opts.cross}px`,
                  height: `${opts.crossSize}px`,
                };
            const nBands = r.bands.length || 1;
            const key = r.key || `${tr.id}-${i}`;
            return {
              key,
              ref: r.ref,
              contended: !!r.contended,
              tiny,
              short,
              selected: this.selectedKey != null && key === this.selectedKey,
              duration: this.formatDuration(b - a),
              title:
                r.title ||
                `${r.bands.map(x => x.label).join(' + ')} · ${this.formatDuration(b - a)}`,
              style,
              bands: r.bands.map(bd => ({
                ...bd,
                // The provisional pick gets visibly more room without hiding the others.
                style: { background: bd.color, flex: `${bd.primary && nBands > 1 ? 1.7 : 1} 1 0` },
              })),
            };
          });

      if (this.primaryTrack) {
        out.push({
          id: this.primaryTrack.id,
          label: this.primaryTrack.label,
          primary: true,
          wide: true,
          head: null,
          rows: mkRows(this.primaryTrack, {
            cross: vertical ? g.laneOffset : 22,
            crossSize: vertical ? g.primaryW : g.rowH,
            minMain: 0,
          }),
        });
      }

      this.secondaryTracks.forEach((tr, i) => {
        const wide = vertical ? this.isWide : true;
        const cross = vertical
          ? g.laneOffset + g.primaryW + 8 + i * (this.isWide ? g.colW : g.colW + 2)
          : 22 + g.rowH + 8 + i * (g.devH + 5);
        const crossSize = vertical ? (this.isWide ? g.colW - 6 : g.colW) : g.devH;
        const headH = vertical ? (this.isWide ? 22 : 64) : g.devH;
        out.push({
          id: tr.id,
          label: tr.label,
          primary: false,
          wide,
          head: {
            // Horizontal puts the label in a ~52px left gutter, so it needs the short
            // form just as much as a narrow vertical column does.
            label: vertical && this.isWide ? tr.label : tr.short || tr.label,
            rotated: vertical && !this.isWide,
            style: vertical
              ? { left: `${cross}px`, top: '0', width: `${crossSize}px`, height: `${headH}px` }
              : {
                  left: '0',
                  top: `${cross}px`,
                  width: `${g.laneOffset - 6}px`,
                  height: `${headH}px`,
                  borderLeft: '0',
                  borderBottom: '0',
                  borderRight: '2px solid currentColor',
                },
          },
          rows: mkRows(tr, {
            cross,
            crossSize,
            // Keep stripes from sliding under their own sticky header.
            minMain: vertical ? headH + 2 : 0,
          }),
        });
      });
      return out;
    },

    /**
     * Where the selected block sits, expressed as a band across the whole drawing.
     *
     * Read off [laidOut] rather than recomputed, so it cannot drift from the block it marks --
     * same numbers, same quiet-collapse mapping, one source.
     */
    cursor(): any {
      if (this.selectedKey == null) return null;
      let row: any = null;
      for (const tr of this.laidOut) {
        const found = tr.rows.find((r: any) => r.selected);
        if (found) {
          row = found;
          break;
        }
      }
      if (!row) return null;
      if (this.isVertical) {
        return {
          left: `${Math.max(0, this.geom.laneOffset - 5)}px`,
          right: '2px',
          top: `${parseFloat(row.style.top)}px`,
          height: `${Math.max(3, parseFloat(row.style.height))}px`,
        };
      }
      return {
        top: '18px',
        bottom: '2px',
        left: `${parseFloat(row.style.left)}px`,
        width: `${Math.max(3, parseFloat(row.style.width))}px`,
      };
    },

    /**
     * Everything that changes which minutes are on screen *without* the user
     * scrolling: the data (via the layout's total length), the measured width, the
     * axis, the height, and the day window itself. `viewportSignature` exists only
     * to be watched -- see the watcher for why.
     */
    viewportSignature(): string {
      return [
        this.map.total,
        this.bottomInset,
        this.containerWidth,
        this.isVertical,
        this.height,
        this.windowStart,
        this.windowEnd,
      ].join('|');
    },
    scrollStyle(): any {
      return {
        height: `${this.height}px`,
        overflowX: this.isVertical ? 'hidden' : 'auto',
        overflowY: this.isVertical ? 'auto' : 'hidden',
      };
    },
    innerStyle(): any {
      const inset = Math.max(0, this.bottomInset);
      if (this.isVertical) return { width: '100%', height: `${this.map.total + inset}px` };
      const g = this.geom;
      const h =
        22 +
        g.rowH +
        (this.secondaryTracks.length ? this.secondaryTracks.length * (g.devH + 5) + 8 : 0);
      return {
        width: `${Math.max(this.containerWidth, this.map.total + g.laneOffset)}px`,
        // Horizontal scrolls sideways, so an inset cannot buy room at the end of the
        // day the way it does vertically. It still lengthens the drawing downward,
        // which is what gets the bottom row out from under an overlay.
        height: `${Math.max(h, this.height - 8) + inset}px`,
      };
    },
  },
  watch: {
    /**
     * The viewport marker used to be refreshed by `onScroll` alone, so until the
     * first scroll the parent kept its "whole day" default and the minimap drew its
     * box across the entire day -- it only snapped to the truth once the user
     * dragged. A freshly opened, zoomed, or re-laid-out timeline shows a real slice
     * of the day without any scroll happening, so re-emit whenever the mapping from
     * minute to pixel changes.
     */
    viewportSignature() {
      this.$nextTick(this.emitViewport);
    },
  },
  mounted() {
    this.measure();
    this.$nextTick(this.emitViewport);
    window.addEventListener('resize', this.measure);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.measure);
      this.ro.observe(this.$refs.root as Element);
    }
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.measure);
    if (this.ro) this.ro.disconnect();
  },
  methods: {
    measure() {
      const el = this.$refs.root as HTMLElement | undefined;
      if (!el) return;
      // Capped against the viewport on purpose. aw-webui's page container is wider
      // than the screen at phone width today -- the stock Home and Timeline screens
      // overflow the same way, which roadmap 5.3 tracks -- so trusting the parent's
      // width would draw a timeline wider than the phone and inherit a bug this
      // component exists to avoid. Harmless once 5.3 lands: the min just stops
      // mattering.
      // window.innerWidth, not documentElement.clientWidth: on a page that overflows
      // sideways the root element is stretched to the content, so clientWidth reports
      // the overflow rather than the screen and the cap silently does nothing.
      const viewport = window.innerWidth - 24;
      this.containerWidth = Math.max(240, Math.min(el.clientWidth, viewport));
    },
    onScroll() {
      this.emitViewport();
    },
    /** Tell the parent which minutes are actually on screen, for the minimap box. */
    emitViewport() {
      const el = this.$refs.scroll as HTMLElement | undefined;
      if (!el) return;
      const off = this.isVertical ? el.scrollTop : el.scrollLeft;
      const win = this.isVertical ? el.clientHeight : el.clientWidth;
      this.$emit('viewport', { start: this.invert(off), end: this.invert(off + win) });
    },

    /**
     * Rescale so `factor` more (or less) pixels cover an hour, keeping the minute
     * under `clientPos` (a clientX or clientY, whichever is the time axis) pinned
     * where it is. Emits `update:pxPerHour` — the parent owns the value.
     */
    zoomAround(factor: number, clientPos: number) {
      const el = this.$refs.scroll as HTMLElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const axisOffset = this.isVertical ? clientPos - rect.top : clientPos - rect.left;
      const scrollBefore = this.isVertical ? el.scrollTop : el.scrollLeft;
      const minuteAtCursor = this.invert(scrollBefore + axisOffset);

      const next = clampZoom(this.effectivePxPerHour * factor);
      if (next === this.effectivePxPerHour && !this.fit) return;
      if (this.fit) this.$emit('update:fit', false);
      this.$emit('update:pxPerHour', Math.round(next));

      // The map recomputes once the prop lands; then put the cursor's minute back.
      this.$nextTick(() => {
        const target = this.map.pos(minuteAtCursor) - axisOffset;
        if (this.isVertical) el.scrollTop = target;
        else el.scrollLeft = target;
      });
    },
    onWheel(e: WheelEvent) {
      // Plain wheel scrolls, as on any long list. Ctrl/⌘ + wheel zooms, which is
      // the convention maps and editors use for exactly this.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      this.zoomAround(factor, this.isVertical ? e.clientY : e.clientX);
    },
    onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const axis = this.isVertical ? 'clientY' : 'clientX';
      this.pinch = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        px: this.effectivePxPerHour,
        client: (a[axis] + b[axis]) / 2,
      };
    },
    onTouchMove(e: TouchEvent) {
      if (!this.pinch || e.touches.length !== 2) return;
      e.preventDefault(); // stop the page itself pinch-zooming
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = (this.pinch.px / this.effectivePxPerHour) * (dist / this.pinch.dist);
      this.zoomAround(factor, this.pinch.client);
    },
    onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) this.pinch = null;
    },
    /** Pixel back to minute, so a caller can draw a minimap viewport marker. */
    invert(px: number): number {
      for (const s of this.map.spans) {
        if (px <= s.p1)
          return s.t0 + (s.p1 > s.p0 ? ((px - s.p0) / (s.p1 - s.p0)) * (s.t1 - s.t0) : 0);
      }
      return this.windowEnd;
    },
    /**
     * Scroll so the `[start, end]` minute range sits in the middle of the viewport.
     *
     * The parent's block stepper calls this. Without it, stepping is useless as soon
     * as the timeline is zoomed in far enough to be worth stepping through: the
     * selection would move to a block that is off-screen, and the only feedback would
     * be the detail panel changing.
     */
    revealRange(start: number, end: number) {
      const el = this.$refs.scroll as HTMLElement;
      if (!el) return;
      const lane = this.isVertical ? 0 : this.geom.laneOffset;
      const a = this.map.pos(start) + lane;
      const b = this.map.pos(end) + lane;
      const win = this.isVertical ? el.clientHeight : el.clientWidth;
      const target = Math.max(0, (a + b) / 2 - win / 2);
      if (this.isVertical) el.scrollTo({ top: target, behavior: 'smooth' });
      else el.scrollTo({ left: target, behavior: 'smooth' });
    },
    /** Scroll so `minute` is near the top/left. Used by the minimap. */
    scrollToMinute(minute: number) {
      const el = this.$refs.scroll as HTMLElement;
      if (!el) return;
      const p = Math.max(0, this.map.pos(minute) - 80);
      if (this.isVertical) el.scrollTo({ top: p, behavior: 'smooth' });
      else el.scrollTo({ left: p, behavior: 'smooth' });
    },
  },
});
</script>

<style scoped lang="scss">
.pt-root {
  width: 100%;
}
.pt-scroll {
  position: relative;
  scrollbar-width: thin;
}
.pt-inner {
  position: relative;
}

.pt-hour {
  position: absolute;
  font-family: monospace;
  font-size: 10px;
  opacity: 0.65;
  transform: translateY(-0.5em);
  pointer-events: none;
}
.pt-grid {
  position: absolute;
  background: rgba(128, 128, 128, 0.22);
  pointer-events: none;
}

.pt-quiet {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: monospace;
  font-size: 10.5px;
  opacity: 0.6;
  pointer-events: none;

  &::before,
  &::after {
    content: '';
    flex: 1 1 auto;
    height: 1px;
    min-width: 8px;
    background: rgba(128, 128, 128, 0.4);
  }
  &.horiz {
    writing-mode: vertical-rl;
    &::before,
    &::after {
      width: 1px;
      height: auto;
      min-height: 8px;
    }
  }
}

.pt-head {
  position: absolute;
  z-index: 6;
  // A translucent grey rather than a theme colour: this sits on both the light and
  // the dark theme, and a hardcoded light fallback renders white-on-dark. Blocks are
  // laid out below the header rather than under it, so it never needs to occlude.
  background: rgba(128, 128, 128, 0.16);
  color: inherit;
  border-bottom: 1px solid rgba(128, 128, 128, 0.35);
  border-left: 2px solid currentColor;
  font-family: monospace;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;

  &.rot {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    padding: 5px 0;
  }
}

.pt-blk {
  position: absolute;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.16);
  display: flex;
  min-height: 0;

  &:focus-visible {
    outline: 2px solid #0e7c6b;
    outline-offset: 2px;
    z-index: 8;
  }
  // `currentColor` here was white -- the block's own text colour -- so on a pale block the
  // selection ring was invisible and on a dark one it was a hairline. Two rings instead: white
  // against the block, then the accent against whatever is behind it. One of the two always has
  // contrast, whatever colour the activity happens to have been given.
  &.sel {
    outline: 2px solid #0e7c6b;
    outline-offset: 1px;
    box-shadow: 0 0 0 1px #fff, 0 0 0 5px rgba(14, 124, 107, 0.3);
    z-index: 7;
  }
  // Stripes rather than a tint: a tint reads as "less of this activity",
  // which is the opposite of what an unresolved overlap means.
  &.contended::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: 3px;
    background: repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.3) 0 3px,
      transparent 3px 8px
    );
    box-shadow: inset 0 0 0 2px #b4541f;
  }
  &.tiny .pt-band {
    padding: 0;
  }
  &.tiny .pt-nm,
  &.tiny .pt-du,
  &.tiny .pt-dv,
  &.tiny .pt-row1 {
    display: none;
  }
  &.short .pt-dv {
    display: none;
  }
  // A 22px gutter column is identified by its header, not by text inside each
  // stripe. `tiny` only measures the time axis, so a long-but-narrow stripe would
  // otherwise print a duration into 22px and show a clipped digit.
  &.gutter {
    border-radius: 2px;

    .pt-band {
      padding: 0;
    }
    .pt-nm,
    .pt-du,
    .pt-dv,
    .pt-row1 {
      display: none;
    }
  }
}

.pt-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 9;
  border-radius: 2px;
  border-top: 2px solid #0e7c6b;
  border-bottom: 2px solid #0e7c6b;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55);

  &.horiz {
    border-top: 0;
    border-bottom: 0;
    border-left: 2px solid #0e7c6b;
    border-right: 2px solid #0e7c6b;
  }
}

.pt-band {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 3px 6px;
  overflow: hidden;
  border-right: 1px solid rgba(0, 0, 0, 0.28);

  &:last-child {
    border-right: 0;
  }
}
.pt-row1 {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  align-items: baseline;
}
.pt-nm {
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.25;
}
.pt-du {
  font-family: monospace;
  font-size: 10.5px;
  opacity: 0.92;
  white-space: nowrap;
  line-height: 1.3;
}
.pt-dv {
  font-family: monospace;
  font-size: 9.5px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
</style>
