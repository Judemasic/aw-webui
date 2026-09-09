<template lang="pug">
div.combined-view
  div.d-flex.align-items-center.flex-wrap.mb-2
    h3.mb-0.mr-auto Combined
    div.d-flex.align-items-center
      b-button-group.mr-2(size="sm")
        b-button(@click="shiftDay(-1)" title="Previous day") ‹
        b-button(@click="goToday") {{ dateLabel }}
        b-button(:disabled="isToday" @click="shiftDay(1)" title="Next day") ›

  //- Range + devices, folded away by default so the phone opens on the data.
  details.tools.mb-2(ref="tools")
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

  div.alert.alert-danger(v-if="error") {{ error }}

  div.summary-strip.mb-2(v-if="data")
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
  div.minimap(v-if="data" @click="onMinimapClick" ref="minimap" title="Whole day. Click to jump.")
    div.mm-track
      div.mm-b(
        v-for="(s, i) in segments"
        :key="i"
        :class="{ c: s.unresolved }"
        :style="minimapStyle(s)"
      )
      div.mm-view(:style="viewportStyle")

  div.d-flex.timeline-body(v-if="data")
    ProportionalTimeline.flex-grow-1(
      ref="tl"
      :tracks="tracks"
      :orientation="orientation"
      :px-per-hour="pxPerHour"
      :window-start="windowStart"
      :window-end="windowEnd"
      :selected-key="selectedKey"
      :height="timelineHeight"
      :format-duration="fmt"
      @select="onSelect"
      @viewport="onViewport"
    )
    aside.detail(v-if="selected" :class="{ sheet: !wideLayout }")
      div(v-if="selectedSegment")
        h5.mb-0 {{ segmentTitle(selectedSegment) }}
        p.when.mb-2 {{ clock(selectedSegment.start) }} – {{ clock(selectedSegment.end) }} · {{ fmt(minutesOf(selectedSegment)) }}
        b-badge(:variant="selectedSegment.unresolved ? 'warning' : 'success'")
          | {{ selectedSegment.unresolved ? 'Unresolved overlap' : 'Settled' }}
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
        div.resolve.mt-2(v-if="selectedSegment.unresolved")
          b Resolve this overlap
          div.small Both devices claim this time. Pick what actually counted — once, or as a standing rule. #[em (roadmap 4.1)]

      div(v-else-if="selectedEvent")
        h5.mb-0 {{ selectedEvent.label }}
        p.when.mb-2 {{ clock(selectedEvent.start) }} – {{ clock(selectedEvent.end) }} · {{ fmt(minutesOf(selectedEvent)) }}
        b-badge(variant="secondary") Raw device event
        dl.dl.mt-3
          dt Device
          dd {{ deviceLabel(selectedEvent.device) }}
          dt Device id
          dd.break {{ selectedEvent.device }}
        div.note-inline.mt-2
          | Per-device tracks are unmodified stored truth (#[b R11]) — this is the one you can edit.

      b-button.mt-3(size="sm" variant="outline-secondary" @click="clearSelection") Close
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
  components: { ProportionalTimeline },
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
      viewport: { start: 0, end: 24 * 60 },
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
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
    ...mapState(useSettingsStore, ['device_names']),
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
    orientation(): string {
      // Vertical at every width, deliberately -- not 'auto'.
      //
      // Extra width buys columns and a side detail panel here, never a different
      // axis: one layout that scales beats two that drift, and a desktop calendar
      // keeps its time axis vertical on a 27" monitor without anyone minding. The
      // component still supports horizontal because roadmap 5.5b needs it for the
      // upstream Timeline, whose desktop users do expect the horizontal axis.
      return 'vertical';
    },
    wideLayout(): boolean {
      return this.windowWidth >= 980;
    },
    pxPerHour(): number {
      return 64;
    },
    timelineHeight(): number {
      return this.windowWidth < 640 ? 520 : 500;
    },
    segments(): Segment[] {
      if (!this.data) return [];
      return (this.data.combined as Segment[]).filter(s => this.enabled[s.device] !== false);
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
          rows: d.events.map(e => ({
            start: this.toMinutes(e.start),
            end: this.toMinutes(e.end),
            title: `${e.label} · ${this.deviceLabel(d.device)} · ${this.fmt(e.seconds / 60)}`,
            key: `${d.device}:${e.start}`,
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
    mode() {
      this.clearSelection();
    },
    duration() {
      this.clearSelection();
    },
  },
  mounted() {
    window.addEventListener('resize', this.onResize);
    this.reload();
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.onResize);
  },
  methods: {
    onResize() {
      this.windowWidth = window.innerWidth;
    },
    clearSelection() {
      this.selected = null;
      this.selectedKey = null;
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
      return uuid;
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

    onSelect(ref: any, key: string) {
      const same = this.selectedKey === key;
      this.selected = same ? null : ref;
      this.selectedKey = same ? null : key;
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
    onMinimapClick(e: MouseEvent) {
      const el = this.$refs.minimap as HTMLElement;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minute = ((e.clientX - r.left) / r.width) * 24 * 60;
      (this.$refs.tl as any)?.scrollToMinute(Math.max(0, Math.min(24 * 60, minute)));
    },
  },
});
</script>

<style scoped lang="scss">
.combined-view {
  max-width: 100%;
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
}

.minimap {
  height: 26px;
  cursor: pointer;
  margin-bottom: 6px;

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
.detail {
  width: 300px;
  flex: 0 0 300px;
  border-left: 1px solid rgba(128, 128, 128, 0.3);
  padding: 12px;
  overflow: auto;

  &.sheet {
    width: auto;
    flex: 1 1 100%;
    border-left: 0;
    border-top: 1px solid rgba(128, 128, 128, 0.3);
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
