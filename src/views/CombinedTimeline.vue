<template lang="pug">
div.combined-view(:class="{ compact }" :style="rootStyle")
  div.d-flex.align-items-center.flex-wrap.hdr.mb-2
    h3.mb-0.mr-auto Combined
    div.d-flex.align-items-center
      b-button-group.mr-1(size="sm")
        b-button(@click="shiftDay(-1)" title="Previous day") ‹
        b-button(@click="goToday") {{ dateLabel }}
        b-button(:disabled="isToday" @click="shiftDay(1)" title="Next day") ›
      b-button.gear(
        v-if="compact"
        size="sm"
        :variant="toolsOpen ? 'primary' : 'outline-secondary'"
        title="Range, devices and view"
        @click="toolsOpen = !toolsOpen"
      ) ⚙

  //- Compact: both fold-outs move into the ⚙ sheet, so the phone opens on the data
  //- with no fold-outs in the way at all. Wide: they stay where they were.
  div.tools-wrap(:class="{ 'tools-sheet': compact, open: toolsOpen }")
    div.sheet-head.compact-only(v-if="compact")
      b Range, devices & view
      b-button.ml-auto(size="sm" variant="outline-secondary" @click="toolsOpen = false") Done
    //- Range + devices, folded away by default so the phone opens on the data.
    details.tools.mb-2(ref="tools" :open="compact")
      summary
        b Range &amp; devices
        span.summary-note.ml-2 {{ toolSummary }}
      div.tool-panel
        div.mb-2
          label.tool-label Mode
          div
            b-form-radio-group(v-model="mode" size="sm" buttons button-variant="outline-secondary" :options="modeOptions")
        div.mb-2(v-if="mode === 'last_duration'")
          label.tool-label Range
          div
            b-button-group(size="sm")
              b-button(
                v-for="d in durations"
                :key="d.value"
                :variant="duration === d.value ? 'primary' : 'outline-secondary'"
                @click="duration = d.value"
              ) {{ d.text }}
        div.mb-2
          label.tool-label Devices — untick to exclude, edit a name to rename
          div.text-muted.small(v-if="!devices.length") No devices in this range.
          div.device-row(v-for="d in devices" :key="d.device")
            b-form-checkbox.mr-2(v-model="enabled[d.device]" @change="onDeviceToggle")
            span.device-key.mr-2 {{ shortName(d) }}
            b-input.device-name(
              size="sm"
              :value="displayName(d)"
              :placeholder="d.hostname || d.device"
              @change="rename(d, $event)"
            )
            b-badge.ml-2(v-if="d.is_own" variant="info") THIS
            span.device-uuid.ml-2 {{ d.device.slice(0, 8) }}…

    //- Axis, zoom and what the drawing folds away. Collapsed by default too, so the
    //- phone still opens straight on the timeline.
    details.tools.mb-2(:open="compact")
      summary
        b View
        span.summary-note.ml-2 {{ viewSummary }}
      div.tool-panel
        div.mb-2
          label.tool-label Time axis
          div
            b-form-radio-group(
              v-model="view.axis"
              size="sm"
              buttons
              button-variant="outline-secondary"
              :options="axisOptions"
            )
          div.text-muted.small.mt-1 Auto goes vertical on a narrow screen, horizontal on a wide one.
        div.mb-2
          label.tool-label Zoom — {{ view.fit ? 'fit to screen' : view.zoom + ' px / hour' }}
          div
            b-button-group(size="sm")
              b-button(
                v-for="z in zoomPresets"
                :key="z.value"
                :variant="!view.fit && view.zoom === z.value ? 'primary' : 'outline-secondary'"
                @click="setZoom(z.value)"
              ) {{ z.text }}
          div.text-muted.small.mt-1 Pinch, or hold Ctrl and scroll, to zoom anywhere in between.
        div
          label.tool-label Behaviour
          div.checks
            b-form-checkbox(v-model="view.collapseQuiet" size="sm") Collapse quiet time
            b-form-checkbox(v-model="view.deviceTracks" size="sm") Device tracks
            b-form-checkbox(v-model="view.fit" size="sm") Fit day to {{ fitAxisWord }}
  div.tools-backdrop(v-if="compact && toolsOpen" @click="toolsOpen = false")

  div.alert.alert-danger(v-if="error") {{ error }}

  div.summary-strip.mb-1(v-if="data" :class="{ compact }")
    div.stat
      span.v {{ fmt(combinedMinutes) }}
      span.k combined
    div.stat
      span.v {{ fmt(deviceMinutes) }}
      span.k device sum
    div.stat
      span.v {{ shownDevices.length }}
      span.k devices
    div.stat(:class="{ flag: contendedCount > 0 }")
      span.v {{ contendedCount }}
      span.k unresolved

  //- Whole day at a glance. Vertical scroll trades this away; the strip buys it back.
  div.minimap(
    v-if="data"
    ref="minimap"
    title="Whole day. Tap to jump, drag to scrub."
    @pointerdown="onMinimapDown"
    @pointermove="onMinimapMove"
    @pointerup="onMinimapUp"
    @pointercancel="onMinimapUp"
  )
    div.mm-track
      div.mm-b(
        v-for="(s, i) in segments"
        :key="i"
        :class="{ c: s.unresolved }"
        :style="minimapStyle(s)"
      )
      div.mm-view(:style="viewportStyle")

  //- Block stepper. Tapping a block is fine when it is big; at a whole-day zoom most
  //- blocks are a couple of pixels wide and cannot be hit with a thumb, so give the
  //- selection a keyboard/thumb path that does not depend on the block's size.
  //-
  //- Two shapes, because the two layouts want different things. Wide: a labelled
  //- button group in the flow, as it has always been. Compact: one floating pill,
  //- two arrows with the count between them — a grouped pair of dark buttons sitting
  //- inside a white pill, with the count hanging off the end, read as two controls
  //- that had collided rather than one.
  div.stepper.mb-1(v-if="data && stepRows.length && !compact")
    b-button-group(size="sm")
      b-button(
        :disabled="stepIndex === 0"
        title="Previous block (←)"
        @click="step(-1)"
      ) ‹ Prev
      b-button(
        :disabled="stepIndex >= 0 && stepIndex === stepRows.length - 1"
        title="Next block (→)"
        @click="step(1)"
      ) Next ›
    span.step-count.ml-2 {{ stepIndex >= 0 ? stepIndex + 1 : '–' }} / {{ stepRows.length }}
    span.step-track.ml-2 {{ activeTrack ? activeTrack.label : '' }}

  div.stepper.compact(v-if="data && stepRows.length && compact" :style="stepperStyle")
    button.st-arrow(
      type="button"
      :disabled="stepIndex === 0"
      title="Previous block"
      @click="step(-1)"
    ) ‹
    span.st-count {{ stepIndex >= 0 ? stepIndex + 1 : '–' }} / {{ stepRows.length }}
    button.st-arrow(
      type="button"
      :disabled="stepIndex >= 0 && stepIndex === stepRows.length - 1"
      title="Next block"
      @click="step(1)"
    ) ›

  div.d-flex.timeline-body(v-if="data" ref="body")
    ProportionalTimeline.flex-grow-1(
      ref="tl"
      :tracks="tracks"
      :orientation="view.axis"
      :px-per-hour.sync="view.zoom"
      :fit.sync="view.fit"
      :collapse-quiet="view.collapseQuiet"
      :show-secondary="view.deviceTracks"
      :window-start="windowStart"
      :window-end="windowEnd"
      :selected-key="selectedKey"
      :height="timelineHeight"
      :format-duration="fmt"
      @select="onSelect"
      @viewport="onViewport"
    )
    //- Compact: a two-stage sheet. It opens at a peek — what this block is, and the
    //- one action worth taking on it — and only grows to the full detail if asked.
    //- The rejected stopgap docked the whole panel at 60vh; a peek is ~1/6 of the
    //- screen and still puts Resolve… under the thumb, which was the actual defect.
    aside.detail(
      v-if="selected"
      ref="detail"
      :class="{ sheet: compact, expanded: detailOpen, dragging: !!sheetDrag }"
      :style="sheetStyle"
    )
      div.grab(
        v-if="compact"
        @pointerdown="onGrabDown"
        @pointermove="onGrabMove"
        @pointerup="onGrabUp"
        @pointercancel="onGrabUp"
      )
      div(v-if="selectedSegment")
        div.d-flex.align-items-start
          div.flex-grow-1
            h5.mb-0 {{ segmentTitle(selectedSegment) }}
            p.when.mb-1 {{ clock(selectedSegment.start) }} – {{ clock(selectedSegment.end) }} · {{ fmt(minutesOf(selectedSegment)) }}
            b-badge(:variant="selectedSegment.unresolved ? 'warning' : 'success'")
              | {{ selectedSegment.unresolved ? 'Unresolved overlap' : 'Settled' }}
          b-button.close-x(v-if="compact" size="sm" variant="outline-secondary" @click="clearSelection") ✕

        //- Peek row: the primary action, always visible without expanding anything.
        //-
        //- Not "Resolve…". The trailing ellipsis is the desktop convention for "this
        //- opens a dialog and asks you something", but on a button half the screen
        //- wide it reads as a label that did not fit — the owner read it exactly that
        //- way on the device. There is room for the whole phrase, so it says it.
        div.peek-actions.mt-2(v-if="compact")
          b-button.act(
            v-if="selectedSegment.unresolved"
            variant="primary"
            @click="openResolve"
          ) Resolve overlap
          b-button.act(variant="outline-secondary" @click="detailOpen = !detailOpen")
            | {{ detailOpen ? 'Less' : 'Details' }}

        div.detail-body(v-show="!compact || detailOpen")
          dl.dl.mt-3
            dt Counted to
            dd {{ deviceLabel(selectedSegment.device) }}
          label.tool-label.mt-2 Source events — {{ sliceCount(selectedSegment) }}
          ul.slices
            li(v-for="(sl, i) in slicesOf(selectedSegment)" :key="i" :class="{ fg: sl.isForeground }")
              span.swatch(:style="{ background: colorFor(sl.label) }")
              span.flex-grow-1 {{ sl.label }}
              span.dev {{ deviceLabel(sl.device) }}
          //- The combined track is computed, never stored, so there is no combined
          //- event for the editor to open. Say so rather than let it look missing.
          div.note-inline.mt-2
            | The combined track is #[b derived] — computed, never stored, so there is no combined
            | event to edit. Open a device block below to edit the stored event.
          div.resolve.mt-2(v-if="selectedSegment.unresolved && !compact")
            b Resolve this overlap
            div.small.mb-2 Both devices claim this time. Pick what actually counted — once, or as a standing rule.
            b-button(size="sm" variant="primary" @click="openResolve") Resolve…

      div(v-else-if="selectedEvent")
        div.d-flex.align-items-start
          div.flex-grow-1
            h5.mb-0 {{ selectedEvent.label }}
            p.when.mb-1 {{ clock(selectedEvent.start) }} – {{ clock(selectedEvent.end) }} · {{ fmt(minutesOf(selectedEvent)) }}
            b-badge(variant="secondary") Raw device event
          b-button.close-x(v-if="compact" size="sm" variant="outline-secondary" @click="clearSelection") ✕
        div.peek-actions.mt-2(v-if="compact")
          b-button.act(variant="outline-secondary" @click="detailOpen = !detailOpen")
            | {{ detailOpen ? 'Less' : 'Details' }}
        div.detail-body(v-show="!compact || detailOpen")
          dl.dl.mt-3
            dt Device
            dd {{ deviceLabel(selectedEvent.device) }}
            dt Device id
            dd.break {{ selectedEvent.device }}
          div.note-inline.mt-2
            | Per-device tracks are unmodified stored truth (#[b R11]) — this is the one you can edit.

      b-button.mt-3(v-if="!compact" size="sm" variant="outline-secondary" @click="clearSelection") Close

  //- Roadmap 4.1. Outside .timeline-body on purpose: it is a fixed-position overlay,
  //- and nesting it in a scrolling flex child makes it inherit that child's clipping.
  ResolutionSheet(
    v-if="resolving"
    :segment="resolving"
    :participants="resolveParticipants"
    :own-device="ownDevice"
    :device-label="deviceLabel"
    :format-duration="fmt"
    :clock="clock"
    @cancel="resolving = null"
    @save="onResolved"
  )
</template>

<script lang="ts">
// Roadmap 3.5b — the combined timeline, rebuilt in aw-webui.
//
// 3.4 drew this with a hand-written Android View. That cannot satisfy the owner's
// requirement that it work on PC as well as tablet and phone (R35) — there is no
// Android on a PC — so the screen lives here instead, where the same code renders in
// the app's WebView and in a desktop browser.
//
// The drawing is ProportionalTimeline, which knows nothing about devices or
// contention, so roadmap 5.5b can reuse it for the plain Timeline.

import Vue from 'vue';
import moment from 'moment';
import { mapState } from 'pinia';
import { useSettingsStore } from '~/stores/settings';
import { getClient } from '~/util/awclient';
import { getColorFromString } from '~/util/color';
import ProportionalTimeline from '~/visualizations/ProportionalTimeline.vue';
import ResolutionSheet from '~/visualizations/ResolutionSheet.vue';

interface Slice {
  device: string;
  label: string;
}
interface Segment {
  start: string;
  end: string;
  seconds: number;
  label: string;
  device: string;
  state: string;
  unresolved: boolean;
  background: Slice[];
}
interface DeviceEvent {
  start: string;
  end: string;
  seconds: number;
  label: string;
}
interface DeviceTrack {
  device: string;
  hostname: string | null;
  is_own: boolean;
  total_seconds: number;
  events: DeviceEvent[];
}

export default Vue.extend({
  name: 'CombinedTimeline',
  components: { ProportionalTimeline, ResolutionSheet },
  data() {
    return {
      date: moment().format('YYYY-MM-DD'),
      data: null as any,
      error: null as string | null,
      mode: 'last_duration',
      duration: 24 * 60 * 60,
      enabled: {} as Record<string, boolean>,
      selected: null as any,
      selectedKey: null as string | null,
      /** The segment the resolution sheet is open on, or null. Roadmap 4.1. */
      resolving: null as Segment | null,
      viewport: { start: 0, end: 24 * 60 },
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
      /** Roadmap 4.1b. The ⚙ sheet holding the two fold-outs, on a compact screen. */
      toolsOpen: false,
      /** Roadmap 4.1b. Stage two of the detail sheet — the peek is the default. */
      detailOpen: false,
      /**
       * Roadmap 4.1b. Pixels the timeline may occupy, measured rather than assumed:
       * everything above it is fixed-height, so the timeline takes exactly the rest
       * of the viewport and the page itself never needs to scroll. 0 until measured.
       */
      availableHeight: 0,
      /** Pixels left for the timeline once the measured header is subtracted. */
      timelineSpace: 0,
      /** Height of the detail peek, so the floating stepper can sit above it. */
      detailHeight: 0,
      /** The peek's own height, remembered so a drag knows what it is snapping back to. */
      peakHeight: 0,
      /** Live drag of the sheet's grab handle: where it started and how tall it was. */
      sheetDrag: null as null | { y: number; h: number; moved: number },
      /** Height the drag is holding the sheet at, or null to let the CSS decide. */
      sheetHeight: null as number | null,
      draggingMap: false,
      // Local, live copy of settings.combined_view. Seeded from the store once it
      // has loaded (see mounted) and written back, debounced, on every change.
      view: {
        axis: 'auto' as 'auto' | 'vertical' | 'horizontal',
        zoom: 64,
        collapseQuiet: true,
        deviceTracks: true,
        fit: false,
      },
      viewReady: false,
      viewSaveTimer: null as any,
      axisOptions: [
        { text: 'Auto', value: 'auto' },
        { text: 'Vertical', value: 'vertical' },
        { text: 'Horizontal', value: 'horizontal' },
      ],
      zoomPresets: [
        { text: 'Day', value: 34 },
        { text: 'Normal', value: 64 },
        { text: 'Close', value: 128 },
      ],
      modeOptions: [
        { text: 'Last duration', value: 'last_duration' },
        { text: 'Date range', value: 'range' },
      ],
      durations: [
        { text: '1h', value: 3600 },
        { text: '2h', value: 2 * 3600 },
        { text: '4h', value: 4 * 3600 },
        { text: '6h', value: 6 * 3600 },
        { text: '12h', value: 12 * 3600 },
        { text: '24h', value: 24 * 3600 },
      ],
    };
  },
  computed: {
    ...mapState(useSettingsStore, ['device_names', 'combined_view']),
    dayStart(): moment.Moment {
      return moment(this.date).startOf('day');
    },
    isToday(): boolean {
      return this.date >= moment().format('YYYY-MM-DD');
    },
    dateLabel(): string {
      return this.isToday ? 'TODAY' : this.dayStart.format('ddd D MMM').toUpperCase();
    },
    windowStart(): number {
      if (this.mode === 'range') return 0;
      return Math.max(0, 24 * 60 - this.duration / 60);
    },
    windowEnd(): number {
      return 24 * 60;
    },
    wideLayout(): boolean {
      return this.windowWidth >= 980;
    },
    /**
     * Roadmap 4.1b — the phone/portrait-tablet layout. Same breakpoint the detail
     * panel already used to become a sheet, so there is one narrow layout rather
     * than two that disagree between 640 and 980. Desktop (R35) is untouched.
     */
    compact(): boolean {
      return !this.wideLayout;
    },
    /**
     * Pin the whole view to the viewport when compact. This is the fix for the
     * defect that started 4.1b: with the root a fixed height and nothing below the
     * timeline, the *page* has nothing to scroll, so a thumb-drag can only move the
     * timeline — no two scroll containers competing for the same gesture.
     */
    rootStyle(): any {
      if (!this.compact || !this.availableHeight) return {};
      return { height: `${this.rootHeight}px`, overflow: 'hidden' };
    },
    rootHeight(): number {
      return this.availableHeight;
    },
    /** While a drag is in progress the sheet is exactly as tall as the thumb says. */
    sheetStyle(): any {
      if (!this.compact || this.sheetHeight === null) return {};
      return { height: `${this.sheetHeight}px`, maxHeight: 'none' };
    },
    /** The tallest the sheet is allowed to get, dragged or expanded. */
    maxSheet(): number {
      return Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.8);
    },
    stepperStyle(): any {
      if (!this.compact) return {};
      return { bottom: `${(this.selected ? this.detailHeight : 0) + 10}px` };
    },
    /** The axis the drawing resolves to right now — for the "fit to width/height" wording. */
    resolvedVertical(): boolean {
      if (this.view.axis === 'vertical') return true;
      if (this.view.axis === 'horizontal') return false;
      return this.windowWidth < 640;
    },
    fitAxisWord(): string {
      return this.resolvedVertical ? 'height' : 'width';
    },
    viewSummary(): string {
      const axis = this.view.axis;
      const zoom = this.view.fit ? 'fit' : `${this.view.zoom}px`;
      return `${axis} · ${zoom}`;
    },
    /**
     * Compact: whatever is left of the viewport under the header, measured. Wide:
     * the fixed heights it has always had.
     */
    timelineHeight(): number {
      if (this.compact && this.timelineSpace > 0) return this.timelineSpace;
      return this.windowWidth < 640 ? 520 : 500;
    },
    segments(): Segment[] {
      if (!this.data) return [];
      return (this.data.combined as Segment[]).filter(s => this.enabled[s.device] !== false);
    },
    /** This device's uuid — a decision's `created_by`. Empty until the fetch lands. */
    ownDevice(): string {
      const own = this.devices.find(d => d.is_own);
      return own ? own.device : '';
    },
    /**
     * The competitors in the segment the sheet is open on.
     *
     * Every participant gets the *segment's* duration, not a shorter one: a contention
     * segment is by construction a window in which the whole set was active, so any
     * per-participant number would be the same number. `04` §4.2's mockup shows two
     * different figures, but that mockup predates segmentation.
     */
    resolveParticipants(): any[] {
      if (!this.resolving) return [];
      const minutes = this.resolving.seconds / 60;
      // Deduplicated on (device, label). A heartbeat-split event puts the same
      // device/app into `background` twice, which in the detail list is harmless
      // repetition but in the sheet would be two identical radio options — an
      // unanswerable question — and would write the same app into
      // `deliberate_background` twice.
      const seen = new Set<string>();
      const out: any[] = [];
      for (const sl of this.slicesOf(this.resolving) as any[]) {
        const k = `${sl.device}|${sl.label}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          device: sl.device,
          label: sl.label,
          minutes,
          color: this.colorFor(sl.label),
          isForeground: sl.isForeground,
        });
      }
      return out;
    },
    devices(): DeviceTrack[] {
      return this.data ? (this.data.devices as DeviceTrack[]) : [];
    },
    shownDevices(): DeviceTrack[] {
      return this.devices.filter(d => this.enabled[d.device] !== false);
    },
    combinedMinutes(): number {
      return this.segments.reduce((n, s) => n + s.seconds / 60, 0);
    },
    deviceMinutes(): number {
      return this.shownDevices.reduce((n, d) => n + d.total_seconds / 60, 0);
    },
    contendedCount(): number {
      return this.segments.filter(s => s.unresolved).length;
    },
    selectedSegment(): Segment | null {
      return this.selected && this.selected.kind === 'segment' ? this.selected.seg : null;
    },
    selectedEvent(): any {
      return this.selected && this.selected.kind === 'event' ? this.selected : null;
    },
    toolSummary(): string {
      const range =
        this.mode === 'last_duration'
          ? (this.durations.find(d => d.value === this.duration) || { text: '—' }).text
          : this.dayStart.format('D MMM');
      const n = this.shownDevices.length;
      const all = n === this.devices.length;
      return `${range} · ${
        all ? 'all devices' : this.shownDevices.map(d => this.shortName(d)).join('+') || 'none'
      }`;
    },

    /** The generic shape ProportionalTimeline draws. Combined first — it gets the width. */
    /**
     * The track the stepper walks. Whichever track the selection is in, so stepping
     * from a device block stays on that device rather than jumping to Combined;
     * with nothing selected it is the combined track, which is what a first tap on
     * Next should give you.
     */
    activeTrack(): any {
      const ts = this.tracks;
      if (this.selectedKey) {
        const found = ts.find((t: any) => t.rows.some((r: any) => r.key === this.selectedKey));
        if (found) return found;
      }
      return ts[0] || null;
    },
    /**
     * The steppable blocks, in time order, restricted to the window the renderer is
     * actually drawing — stepping to a block outside it would select something with
     * nothing on screen to show for it.
     */
    stepRows(): any[] {
      if (!this.activeTrack) return [];
      return this.activeTrack.rows
        .filter((r: any) => r.end > this.windowStart && r.start < this.windowEnd)
        .slice()
        .sort((a: any, b: any) => a.start - b.start);
    },
    /** Index of the selection within [stepRows], or -1 when nothing is selected. */
    stepIndex(): number {
      if (!this.selectedKey) return -1;
      return this.stepRows.findIndex((r: any) => r.key === this.selectedKey);
    },
    tracks(): any[] {
      const out: any[] = [
        {
          id: 'combined',
          label: 'Combined',
          primary: true,
          rows: this.segments.map(s => {
            const slices = this.slicesOf(s);
            return {
              start: this.toMinutes(s.start),
              end: this.toMinutes(s.end),
              contended: s.unresolved,
              title: `${this.segmentTitle(s)} · ${this.fmt(s.seconds / 60)}`,
              // Start time is unique within a track and survives a re-fetch, so a
              // selection stays put across a reload or a device being toggled.
              key: `c:${s.start}`,
              ref: { kind: 'segment', seg: s },
              bands: slices.map(sl => ({
                label: sl.label,
                color: this.colorFor(sl.label),
                primary: sl.isForeground,
                sub: this.shortNameOf(sl.device),
              })),
            };
          }),
        },
      ];
      for (const d of this.shownDevices) {
        out.push({
          id: d.device,
          label: this.deviceLabel(d.device),
          short: this.shortName(d),
          rows: d.events.map((e, i) => ({
            start: this.toMinutes(e.start),
            end: this.toMinutes(e.end),
            title: `${e.label} · ${this.deviceLabel(d.device)} · ${this.fmt(e.seconds / 60)}`,
            // Index included because a start time is **not** unique within a device
            // track: a heartbeat split leaves two events on the same timestamp, which
            // Vue reported as a duplicate key and which would have made the block
            // stepper's key lookup land on the wrong one of the pair. Ordering from
            // the endpoint is deterministic, so this still survives a re-fetch.
            key: `${d.device}:${e.start}:${i}`,
            ref: { kind: 'event', device: d.device, ...e },
            bands: [{ label: e.label, color: this.colorFor(e.label), primary: true }],
          })),
        });
      }
      return out;
    },
    viewportStyle(): any {
      const span = this.windowEnd - this.windowStart || 1;
      const l = ((this.viewport.start - this.windowStart) / span) * 100;
      const w = ((this.viewport.end - this.viewport.start) / span) * 100;
      return { left: `${Math.max(0, l)}%`, width: `${Math.max(2, Math.min(100, w))}%` };
    },
  },
  watch: {
    date: 'reload',
    // The body lock only applies to the compact layout, and a rotation can cross
    // the breakpoint in either direction.
    compact() {
      this.applyBodyLock();
    },
    mode() {
      this.clearSelection();
    },
    duration() {
      this.clearSelection();
    },
    view: {
      deep: true,
      handler() {
        // Ignore the initial seed from the store; only persist real user changes.
        if (!this.viewReady) return;
        clearTimeout(this.viewSaveTimer);
        this.viewSaveTimer = setTimeout(this.persistView, 500);
      },
    },
    // The store can finish loading after this view mounts; re-seed once when it does.
    combined_view: {
      deep: true,
      handler(v: any) {
        if (this.viewReady || !v) return;
        this.seedView(v);
      },
    },
  },
  async mounted() {
    window.addEventListener('resize', this.onResize);
    this.applyBodyLock();
    this.measure();
    window.addEventListener('keydown', this.onKeydown);
    this.reload();
    await useSettingsStore().ensureLoaded();
    this.seedView(this.combined_view);
  },
  updated() {
    this.measure();
  },
  beforeDestroy() {
    document.body.classList.remove('aw-fixed-view');
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeydown);
    clearTimeout(this.viewSaveTimer);
  },
  methods: {
    onResize() {
      this.windowWidth = window.innerWidth;
      this.applyBodyLock();
      this.measure();
    },
    /**
     * Criterion 1 of roadmap 4.1b is "one scroller, or none". Sizing this view to
     * the viewport is not enough on its own: aw-webui's own container padding still
     * left ~135px of page scroll under it, and a drag that reached the end of the
     * timeline chained into moving the page. Locking the body is what actually
     * leaves a single scroller on the screen. Removed again in beforeDestroy, so no
     * other view inherits it.
     */
    applyBodyLock() {
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('aw-fixed-view', this.compact);
    },
    /**
     * Roadmap 4.1b. Measure rather than assume: read where the timeline actually
     * starts and how tall the detail peek actually is, so the layout survives a
     * different font size, a wrapped header, or the Android status bar changing
     * height. Cheap, idempotent, and only writes when a value really moved.
     */
    measure() {
      if (typeof window === 'undefined') return;
      const root = this.$el as HTMLElement;
      if (!root) return;
      // Where the view starts on the *page*, not in the viewport. Using the viewport
      // position feeds back on itself: arrive on a scrolled page, measure a larger
      // gap, grow the timeline, keep the page scrollable, and the header ends up
      // above the fold — which is the very failure this step exists to remove.
      if (this.compact && window.scrollY !== 0) window.scrollTo(0, 0);
      const rootTop = root.getBoundingClientRect().top + window.scrollY;
      const avail = Math.max(240, window.innerHeight - rootTop - 4);
      if (Math.abs(avail - this.availableHeight) > 1) this.availableHeight = avail;

      const body = this.$refs.body as HTMLElement | undefined;
      if (body) {
        const used = body.getBoundingClientRect().top - root.getBoundingClientRect().top;
        const space = Math.max(160, avail - used - 4);
        if (Math.abs(space - this.timelineSpace) > 1) this.timelineSpace = space;
      }
      const detail = this.$refs.detail as HTMLElement | undefined;
      const h = detail && this.compact ? detail.getBoundingClientRect().height : 0;
      if (Math.abs(h - this.detailHeight) > 1) this.detailHeight = h;
      // Remember what a peek is worth, so a drag knows what it snaps back to.
      if (h > 0 && !this.detailOpen && !this.sheetDrag && Math.abs(h - this.peakHeight) > 1) {
        this.peakHeight = h;
      }
    },
    /** Copy the stored view prefs into the local live copy, without triggering a save. */
    seedView(v: any) {
      if (this.viewReady || !v) return;
      this.view = {
        axis: v.axis ?? 'auto',
        zoom: v.zoom ?? 64,
        collapseQuiet: v.collapseQuiet ?? true,
        deviceTracks: v.deviceTracks ?? true,
        fit: v.fit ?? false,
      };
      // Let the seed settle before the watcher starts persisting changes.
      this.$nextTick(() => {
        this.viewReady = true;
      });
    },
    setZoom(px: number) {
      this.view.fit = false;
      this.view.zoom = px;
    },
    async persistView() {
      await useSettingsStore().update({ combined_view: { ...this.view } });
    },
    clearSelection() {
      this.selected = null;
      this.selectedKey = null;
      this.detailOpen = false;
    },
    async reload() {
      this.error = null;
      this.clearSelection();
      const start = this.dayStart.toISOString();
      const end = this.dayStart.clone().add(1, 'day').toISOString();
      try {
        const client = getClient();
        const res = await client.req.get('/0/combined/timeline', { params: { start, end } });
        this.data = res.data;
        for (const d of this.data.devices as DeviceTrack[]) {
          if (this.enabled[d.device] === undefined) this.$set(this.enabled, d.device, true);
        }
      } catch (e: any) {
        this.data = null;
        this.error =
          e?.response?.data?.message || e?.message || 'Could not load the combined timeline.';
      }
    },
    shiftDay(n: number) {
      this.date = this.dayStart.clone().add(n, 'day').format('YYYY-MM-DD');
    },
    goToday() {
      this.date = moment().format('YYYY-MM-DD');
    },
    onDeviceToggle() {
      this.clearSelection();
    },

    toMinutes(iso: string): number {
      return moment(iso).diff(this.dayStart, 'minutes', true);
    },
    minutesOf(x: any): number {
      return x.seconds / 60;
    },
    clock(iso: string): string {
      return moment(iso).format('HH:mm');
    },
    fmt(minutes: number): string {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
    },
    colorFor(label: string): string {
      return getColorFromString(label);
    },

    /** Foreground first, then the background slices — the order the bands are drawn in. */
    slicesOf(s: Segment): any[] {
      return [
        { device: s.device, label: s.label, isForeground: true },
        ...(s.background || []).map(b => ({ ...b, isForeground: false })),
      ];
    },
    sliceCount(s: Segment): string {
      const n = this.slicesOf(s).length;
      return `${n} slice${n === 1 ? '' : 's'}`;
    },
    /** A contended block names everything that ran, not a winner with a footnote. */
    segmentTitle(s: Segment): string {
      const labels = this.slicesOf(s).map(x => x.label);
      return Array.from(new Set(labels)).join(' + ');
    },

    deviceLabel(uuid: string): string {
      const named = this.device_names && this.device_names[uuid];
      if (named) return named;
      const d = this.devices.find(x => x.device === uuid);
      if (d && d.hostname) return d.hostname;
      // Neither renamed nor carrying a hostname — events imported before 3.1's origin
      // tagging land here. Returning the raw uuid was the 3.4 defect this view exists
      // to fix, and a 36-character string is unreadable in a sheet whose whole
      // question is *which device*. A short form is still unique in practice, and the
      // rename control is one fold-out away when it is not.
      if (d && d.is_own) return 'This device';
      // Separators stripped first: a uuid's first four characters can include a dash,
      // and "Device AAA-" reads like a truncation bug rather than a name.
      return `Device ${uuid
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 4)
        .toUpperCase()}`;
    },
    displayName(d: DeviceTrack): string {
      return this.deviceLabel(d.device);
    },
    /** Short tag for the narrow gutter header, where a full name has no room. */
    shortName(d: DeviceTrack): string {
      return this.shortNameOf(d.device);
    },
    shortNameOf(uuid: string): string {
      const label = this.deviceLabel(uuid);
      if (label === uuid) return uuid.slice(0, 4).toUpperCase();
      const words = label.split(/[\s_-]+/).filter(Boolean);
      if (words.length >= 2)
        return (words[0][0] + words[words.length - 1].slice(0, 3)).toUpperCase();
      return label.slice(0, 4).toUpperCase();
    },
    async rename(d: DeviceTrack, name: string) {
      const settings = useSettingsStore();
      const names = { ...(this.device_names || {}) };
      const trimmed = (name || '').trim();
      if (trimmed) names[d.device] = trimmed;
      else delete names[d.device];
      await settings.update({ device_names: names });
    },

    /**
     * Move the selection `dir` blocks along the active track and scroll it into view.
     *
     * From no selection this lands on the first block (or the last, going back), so
     * the buttons are useful before anything has been tapped.
     */
    step(dir: number) {
      const rows = this.stepRows;
      if (!rows.length) return;
      const i = this.stepIndex;
      const next =
        i < 0 ? (dir > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, i + dir));
      const row = rows[next];
      this.selected = row.ref;
      this.selectedKey = row.key;
      this.$nextTick(() => {
        const tl: any = this.$refs.tl;
        if (tl && tl.revealRange) tl.revealRange(row.start, row.end);
      });
    },
    /**
     * ← / → step too. Skipped while a form control has focus, so typing in the
     * device-rename box does not move the selection out from under you.
     */
    onKeydown(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = e.target as HTMLElement | null;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable))
        return;
      e.preventDefault();
      this.step(e.key === 'ArrowRight' ? 1 : -1);
    },

    openResolve() {
      this.resolving = this.selectedSegment;
    },
    /**
     * Roadmap 4.1 stops here on purpose. The sheet has built a complete decision
     * record; **4.2** is the step that appends it to `decisions.jsonl` and recomputes
     * the day. Logging it keeps the record inspectable in the meantime, and means the
     * format is exercised before anything depends on it being right.
     */
    onResolved(decision: any) {
      // eslint-disable-next-line no-console
      console.log('[combined] decision built (roadmap 4.1; 4.2 persists it):', decision);
    },

    onSelect(ref: any, key: string) {
      const same = this.selectedKey === key;
      this.selected = same ? null : ref;
      this.selectedKey = same ? null : key;
      // Every block opens at the peek. Stepping through ten in a row should not
      // leave the sheet expanded over the timeline from the one before.
      this.detailOpen = false;
    },
    onViewport(v: { start: number; end: number }) {
      this.viewport = v;
    },
    minimapStyle(s: Segment): any {
      const a = this.toMinutes(s.start);
      const b = this.toMinutes(s.end);
      const style: any = {
        left: `${(a / (24 * 60)) * 100}%`,
        width: `${Math.max(0.25, ((b - a) / (24 * 60)) * 100)}%`,
      };
      if (!s.unresolved) style.background = this.colorFor(s.label);
      return style;
    },
    /**
     * Roadmap 4.1b, on the owner's second look: the grab handle has to *be* a handle —
     * drag it and the sheet comes with it, rather than a bar that only accepts taps.
     *
     * Dragging sets the height directly, so the sheet tracks the thumb one-to-one, and
     * the body is shown as soon as there is room for it so the growth means something.
     * Letting go snaps to the nearest of the three states it can be in: gone, peek, or
     * expanded. A press that never really moved is still a tap, and still toggles —
     * losing that would trade one gesture for another rather than adding one.
     */
    onGrabDown(e: PointerEvent) {
      const el = this.$refs.detail as HTMLElement | undefined;
      if (!el) return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      this.sheetDrag = { y: e.clientY, h: el.getBoundingClientRect().height, moved: 0 };
      e.preventDefault();
    },
    onGrabMove(e: PointerEvent) {
      if (!this.sheetDrag) return;
      const dy = this.sheetDrag.y - e.clientY;
      this.sheetDrag.moved = Math.max(this.sheetDrag.moved, Math.abs(dy));
      this.sheetHeight = Math.max(40, Math.min(this.maxSheet, this.sheetDrag.h + dy));
      // Fill it as it grows, rather than dragging open an empty box.
      this.detailOpen = this.sheetHeight > this.peakHeight + 40;
      e.preventDefault();
    },
    onGrabUp(e: PointerEvent) {
      const drag = this.sheetDrag;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      this.sheetDrag = null;
      if (!drag) return;
      // Barely moved: that was a tap.
      if (drag.moved < 6) {
        this.sheetHeight = null;
        this.detailOpen = !this.detailOpen;
        return;
      }
      const h = this.sheetHeight ?? drag.h;
      this.sheetHeight = null;
      const peek = this.peakHeight || drag.h;
      if (h < peek * 0.6) {
        this.clearSelection();
      } else {
        this.detailOpen = h > (peek + this.maxSheet) / 2;
      }
    },
    /**
     * Roadmap 4.1b — "not just tappable but also draggable". A pointerdown jumps,
     * and holding and moving scrubs the day continuously. Pointer capture keeps the
     * drag alive when the thumb leaves the 24px strip, which on a phone it always
     * does; without it the scrub dies on the first vertical wobble.
     */
    scrubTo(clientX: number) {
      const el = this.$refs.minimap as HTMLElement;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minute = ((clientX - r.left) / r.width) * 24 * 60;
      (this.$refs.tl as any)?.scrollToMinute(Math.max(0, Math.min(24 * 60, minute)));
    },
    onMinimapDown(e: PointerEvent) {
      this.draggingMap = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      this.scrubTo(e.clientX);
      e.preventDefault();
    },
    onMinimapMove(e: PointerEvent) {
      if (!this.draggingMap) return;
      this.scrubTo(e.clientX);
      e.preventDefault();
    },
    onMinimapUp(e: PointerEvent) {
      this.draggingMap = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
  },
});
</script>

<style scoped lang="scss">
.combined-view {
  max-width: 100%;
}

// ---------------------------------------------------------------------------
// Roadmap 4.1b — the compact (phone / portrait-tablet) layout.
//
// The rule the whole thing turns on: below 980px the view is exactly as tall as
// the viewport and hides its own overflow, and everything above the timeline has
// a fixed height. The timeline is then the only scroll container on the screen,
// so a thumb-drag cannot be eaten by the wrong one, and nothing can end up below
// the fold where it cannot be reached. Everything else here is that rule's
// consequences: the fold-outs move into a ⚙ sheet, the stat strip loses its box,
// the stepper floats instead of costing a band, and the detail opens at a peek.
// ---------------------------------------------------------------------------
.combined-view.compact {
  display: flex;
  flex-direction: column;
  position: relative;

  .hdr {
    flex: 0 0 auto;
    h3 {
      font-size: 1.05rem;
    }
  }
  .summary-strip,
  .minimap,
  .alert {
    flex: 0 0 auto;
  }
  .timeline-body {
    flex: 1 1 auto;
    min-height: 0;
  }
  .gear {
    line-height: 1;
    padding: 0.25rem 0.5rem;
    font-size: 1rem;
  }
}

// The ⚙ sheet. Same two panels, moved off the screen's critical path — they are
// occasional settings, and they were costing 72px above the data every time.
.tools-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1045;
  max-height: 80vh;
  overflow: auto;
  padding: 6px 10px 14px;
  background-color: var(--bg, #fff);
  border-top: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -2px 18px rgba(0, 0, 0, 0.25);
  transform: translateY(101%);
  transition: transform 0.18s ease-out;

  &.open {
    transform: translateY(0);
  }
  // Inside the sheet the fold-outs are just sections; their summary rows would be
  // a second, pointless layer of folding.
  details.tools > summary {
    display: none;
  }
  details.tools {
    border: 0;
  }
  .tool-panel {
    padding: 0 0 6px;
  }
}
.tools-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1044;
  background: rgba(0, 0, 0, 0.35);
}
.sheet-head {
  display: flex;
  align-items: center;
  padding: 2px 0 8px;
}

details.tools {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 5px;

  > summary {
    cursor: pointer;
    padding: 6px 10px;
    font-size: 0.9em;
    display: flex;
    align-items: center;
  }
  .summary-note {
    margin-left: auto;
    font-family: monospace;
    font-size: 0.85em;
    opacity: 0.7;
  }
}
.tool-panel {
  padding: 4px 10px 10px;
}
.tool-label {
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  opacity: 0.65;
  margin-bottom: 3px;
  display: block;
}

.checks {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.device-row {
  display: flex;
  align-items: center;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 4px;
}
.device-key {
  font-family: monospace;
  font-size: 10px;
  font-weight: 600;
  background: rgba(128, 128, 128, 0.25);
  border-radius: 3px;
  padding: 1px 5px;
}
.device-name {
  flex: 1 1 60px;
  min-width: 0;
}
.device-uuid {
  font-family: monospace;
  font-size: 10px;
  opacity: 0.6;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 5px;

  .stat {
    flex: 1 1 0;
    min-width: 82px;
    padding: 6px 10px;
    border-right: 1px solid rgba(128, 128, 128, 0.2);

    &:last-child {
      border-right: 0;
    }
    &.flag .v {
      color: #b4541f;
    }
    .v {
      display: block;
      font-family: monospace;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.2;
    }
    .k {
      font-size: 10.5px;
      opacity: 0.65;
    }
  }

  // "stat tiles are taking extra space they can be neater" — the numbers stay, the
  // box, the dividers and the stacked labels go. 57px of tiles becomes one 24px line.
  //
  // On real data this first shipped as one nowrap line and broke: `13h 32m` wrapped
  // inside its own tile and every label truncated to `combin…`, `unresolv…`. A number
  // whose label is cut off is worse than a number on a second line, and `unresolved`
  // is the one that matters most. So nothing is ever clipped: each pair stays whole,
  // and the row wraps to a second line only when the numbers are big enough to need
  // it. One line at 18px on a quiet day, two at 36px on a busy one — still far below
  // the 57px of tiles this replaced.
  &.compact {
    border: 0;
    border-radius: 0;
    gap: 4px 14px;
    flex-wrap: wrap;

    .stat {
      display: flex;
      align-items: baseline;
      gap: 4px;
      flex: 0 0 auto;
      padding: 1px 0;
      border-right: 0;

      .v,
      .k {
        white-space: nowrap;
      }
      .v {
        display: inline;
        font-size: 13px;
      }
      .k {
        font-size: 10px;
      }
    }
  }
}

.stepper {
  display: flex;
  align-items: center;
  // Right-aligned so it sits over the timeline's own scroll area rather than the
  // hour-label gutter, and stays under the thumb on a phone held one-handed.
  justify-content: flex-end;

  // Compact: one floating pill over the timeline rather than a 31px band above it,
  // lifted clear of the detail peek when one is open (see stepperStyle). Arrow, count,
  // arrow — nothing nested, so it reads as a single control.
  &.compact {
    position: fixed;
    right: 10px;
    z-index: 1035;
    margin: 0;
    padding: 0 4px;
    gap: 2px;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgba(128, 128, 128, 0.28);
    background-color: var(--bg, #fff);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
    transition: bottom 0.15s ease-out;
  }
}

// 44px, because stepping is how ten overlaps in a row actually get walked.
.st-arrow {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 22px;
  line-height: 1;

  &:disabled {
    opacity: 0.3;
  }
  &:active:not(:disabled) {
    background: rgba(128, 128, 128, 0.18);
  }
}
.st-count {
  min-width: 62px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  opacity: 0.75;
}
.step-count {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--secondary, #6c757d);
}
.step-track {
  font-size: 0.8rem;
  color: var(--secondary, #6c757d);
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minimap {
  height: 26px;
  cursor: pointer;
  margin-bottom: 6px;

  // A horizontal scrub must not be turned into a page pan or a pull-to-refresh.
  touch-action: none;

  .mm-track {
    position: relative;
    height: 100%;
    background: rgba(128, 128, 128, 0.15);
    border-radius: 3px;
    overflow: hidden;
  }
  .mm-b {
    position: absolute;
    top: 0;
    bottom: 0;
    opacity: 0.85;

    &.c {
      background: repeating-linear-gradient(45deg, #b4541f 0 2px, transparent 2px 5px),
        rgba(180, 84, 31, 0.2);
    }
  }
  .mm-view {
    position: absolute;
    top: 0;
    bottom: 0;
    border: 1.5px solid #0e7c6b;
    border-radius: 3px;
    background: rgba(14, 124, 107, 0.12);
    pointer-events: none;
  }
}

.timeline-body {
  align-items: stretch;
  flex-wrap: wrap;
}
.combined-view.compact .timeline-body {
  // Reaching the end of the timeline must not start scrolling something else.
  overscroll-behavior: contain;
}
.detail {
  width: 300px;
  flex: 0 0 300px;
  border-left: 1px solid rgba(128, 128, 128, 0.3);
  padding: 12px;
  overflow: auto;

  // Roadmap 4.1b — a two-stage sheet, replacing the docked 60vh panel that was
  // rejected ("that is like more than half of the screen").
  //
  // Stage one is a peek: what the block is, and the one action worth taking on it.
  // It is ~130px, it never covers the timeline it describes, and Resolve… is inside
  // it — which is the whole point, since the defect that started 4.1b was that
  // button being real and unreachable. Stage two, on Details, grows to 80vh with
  // its own scroll for the source-event list, and collapses again on the next
  // block. The peek is what you see while resolving ten in a row.
  &.sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1040;
    width: auto;
    flex: none;
    max-height: 80vh;
    overflow: hidden;
    padding: 4px 12px 12px;
    border-left: 0;
    border-top: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 12px 12px 0 0;
    background-color: var(--bg, #fff);
    box-shadow: 0 -2px 18px rgba(0, 0, 0, 0.25);

    &.expanded {
      overflow: auto;
    }
    // The bar is 4px; the thing you can grab is 26px of it. A handle that has to be
    // hit exactly is not a handle.
    .grab {
      position: relative;
      height: 26px;
      margin: -4px 0 2px;
      cursor: grab;
      // Otherwise the browser claims the vertical drag for scrolling and the sheet
      // never sees it.
      touch-action: none;

      &::before {
        content: '';
        position: absolute;
        top: 10px;
        left: 50%;
        width: 44px;
        height: 4px;
        margin-left: -22px;
        border-radius: 2px;
        background: rgba(128, 128, 128, 0.45);
      }
    }
    // Snap when let go, follow exactly while held.
    transition: height 0.16s ease-out;

    &.dragging {
      transition: none;
      cursor: grabbing;
    }
    h5 {
      font-size: 1rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .close-x {
      flex: 0 0 auto;
      min-width: 44px;
      min-height: 44px;
    }
    // Resolving is a primary job on this screen now, so the action row is thumb-sized
    // rather than the sm buttons the wide panel uses.
    .peek-actions {
      display: flex;
      gap: 8px;

      .act {
        flex: 1 1 0;
        min-height: 44px;
        font-size: 0.95rem;
      }
    }
    .detail-body {
      max-height: calc(80vh - 150px);
      overflow: auto;
    }
    // Dragged: the sheet's height is set outright, so the body takes what is left
    // rather than its own cap, and the sheet never grows past the thumb.
    &.dragging .detail-body {
      max-height: none;
    }
  }
  .when {
    font-family: monospace;
    font-size: 11.5px;
    opacity: 0.7;
  }
}

.dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 12.5px;
  margin-bottom: 8px;

  dt {
    opacity: 0.65;
    font-weight: 400;
  }
  dd {
    margin: 0;
    font-family: monospace;
    font-size: 12px;

    &.break {
      word-break: break-all;
    }
  }
}

.slices {
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(128, 128, 128, 0.25);
    border-radius: 4px;
    padding: 5px 8px;
    margin-bottom: 5px;
    font-size: 12.5px;

    &.fg {
      border-left-width: 3px;
      border-left-color: currentColor;
    }
    .dev {
      font-family: monospace;
      font-size: 10px;
      opacity: 0.7;
      text-align: right;
    }
  }
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.note-inline {
  font-size: 11.5px;
  opacity: 0.8;
  border-left: 2px solid #b4541f;
  padding: 6px 8px;
  background: rgba(180, 84, 31, 0.08);
  border-radius: 0 4px 4px 0;
}
.resolve {
  border: 1px dashed rgba(128, 128, 128, 0.5);
  border-radius: 5px;
  padding: 8px;
  font-size: 12px;
}
</style>

<!--
  Unscoped on purpose: `body` is outside this component. Roadmap 4.1b, criterion 1 --
  with the view sized to the viewport, this is what leaves exactly one scroller on a
  phone. The class is added on mount when compact and removed in beforeDestroy.
-->
<style lang="scss">
body.aw-fixed-view {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>
