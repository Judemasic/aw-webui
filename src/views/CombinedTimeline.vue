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
        size="sm"
        :variant="toolsOpen ? 'primary' : 'outline-secondary'"
        title="Range, devices and view"
        @click="toolsOpen = !toolsOpen"
      ) ⚙

  //- Both fold-outs live behind the ⚙ at every width. On a phone the panel is a
  //- sheet over the data; on a desktop it opens in the flow where the fold-outs used
  //- to sit permanently. Same control, same panel, two presentations.
  //-
  //- Wide screens kept the two collapsed `<details>` summaries because there was room
  //- for them -- but room is not a reason. They cost 72px above the data on every
  //- visit to buy a control used once a session, and having the phone answer the
  //- question one way and the desktop another means two things to learn, not one.
  div.tools-wrap(v-if="compact || toolsOpen" :class="{ 'tools-sheet': compact, open: toolsOpen }")
    div.sheet-head.compact-only(v-if="compact")
      b Range, devices & view
      b-button.ml-auto(size="sm" variant="outline-secondary" @click="toolsOpen = false") Done
    //- Range + devices, folded away by default so the phone opens on the data.
    details.tools.mb-2(ref="tools" open)
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
    details.tools.mb-2(open)
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
        //- Roadmap 4.5. A display setting and nothing more: the number goes out with the
        //- request, the day is recomputed from the same stored events and the same
        //- decisions, and turning it off brings every sliver straight back.
        div.mb-2
          label.tool-label Smoothing — {{ sliverLabel }}
          div
            b-button-group(size="sm")
              b-button(
                v-for="sv in sliverPresets"
                :key="sv.value"
                :variant="view.sliverSeconds === sv.value ? 'primary' : 'outline-secondary'"
                @click="view.sliverSeconds = sv.value"
              ) {{ sv.text }}
          div.text-muted.small.mt-1
            | A flick shorter than this stops being a block of its own and joins the stretch it
            | interrupted. Nothing is written and nothing is lost — a smoothed block says what it
            | swallowed, and #[b Off] draws the day literally.
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
  div.stepper.mb-1(v-if="data && (stepRows.length || view.resolveMode) && !compact")
    b-button-group(size="sm")
      b-button(
        :disabled="!stepRows.length || stepIndex === 0"
        title="Previous block (←)"
        @click="step(-1)"
      ) ‹ Prev
      b-button(
        :disabled="!stepRows.length || (stepIndex >= 0 && stepIndex === stepRows.length - 1)"
        title="Next block (→)"
        @click="step(1)"
      ) Next ›
    //- Roadmap 4.5. Prev/Next walked every block, which on a day of four hundred of them is
    //- not a way to answer the six that are still asking. In resolve mode the same two arrows
    //- walk only those, and answering one moves to the next by itself.
    b-button.ml-2(
      size="sm"
      :variant="view.resolveMode ? 'warning' : 'outline-secondary'"
      :title="resolveModeTitle"
      @click="toggleResolveMode"
    ) {{ view.resolveMode ? 'Resolving' : 'Resolve mode' }}
    span.step-count.ml-2 {{ stepLabel }}
    span.step-track.ml-2 {{ view.resolveMode ? '' : activeTrack ? activeTrack.label : '' }}

  div.stepper.compact(v-if="data && (stepRows.length || view.resolveMode) && compact" ref="stepper" :style="stepperStyle")
    //- The mode switch sits inside the pill rather than in the ⚙ sheet: it changes what the
    //- two arrows next to it do, and a control that changes another control belongs beside it.
    button.st-mode(
      type="button"
      :class="{ on: view.resolveMode }"
      :title="resolveModeTitle"
      @click="toggleResolveMode"
    ) !
    button.st-arrow(
      type="button"
      :disabled="!stepRows.length || stepIndex === 0"
      title="Previous block"
      @click="step(-1)"
    ) ‹
    span.st-count(:class="{ done: view.resolveMode && !stepRows.length }") {{ stepLabel }}
    button.st-arrow(
      type="button"
      :disabled="!stepRows.length || (stepIndex >= 0 && stepIndex === stepRows.length - 1)"
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
      :start-clock="startOfDay"
      :window-start="windowStart"
      :window-end="windowEnd"
      :bottom-inset="bottomInset"
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
            b-badge(:variant="segmentBadge(selectedSegment).variant")
              | {{ segmentBadge(selectedSegment).text }}
          b-button.close-x(v-if="compact" size="sm" variant="outline-secondary" @click="clearSelection") ✕

        //- Peek row: the primary action, always visible without expanding anything.
        //-
        //- Not "Resolve…". The trailing ellipsis is the desktop convention for "this
        //- opens a dialog and asks you something", but on a button half the screen
        //- wide it reads as a label that did not fit — the owner read it exactly that
        //- way on the device. There is room for the whole phrase, so it says it.
        div.peek-actions.mt-2(v-if="compact")
          b-button.act(
            v-if="canResolve(selectedSegment)"
            :variant="selectedSegment.unresolved ? 'primary' : 'outline-primary'"
            @click="openResolve"
          ) {{ selectedSegment.resolved_by ? 'Change answer' : 'Resolve overlap' }}
          //- Roadmap 4.3. Undo is not "change answer": it takes the question back to being
          //- open rather than answering it differently, and there was no way to do that at
          //- all before — a mis-tap on Resolve was permanent.
          b-button.act(
            v-if="selectedSegment.resolved_by"
            variant="outline-danger"
            :disabled="undoing"
            @click="undoResolution(selectedSegment)"
          ) {{ undoing ? 'Undoing…' : 'Undo' }}
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
          //- Roadmap 4.5. Rounding that hides things silently is a lie about the day, so a
          //- block that swallowed a sliver names it and says how long it was.
          div.smoothed-note.mt-2(v-if="selectedSegment.smoothed_seconds > 0")
            b Smoothed
            div.small
              | {{ fmtSeconds(selectedSegment.smoothed_seconds) }} of
              |  {{ (selectedSegment.absorbed_labels || []).join(', ') || 'the same activity' }}
              |  joined this block. Set #[b Smoothing] to #[b Off] under ⚙ ▸ View to see it
              |  drawn separately.
          div.note-inline.mt-2
            | The combined track is #[b derived] — computed, never stored, so there is no combined
            | event to edit. Open a device block below to edit the stored event.
          //- Roadmap 4.2: a resolved block says so, and by what. `auto_resolved` is the
          //- distinction R16 asks for — the owner never answered *this* stretch, a rule
          //- they made elsewhere did, and they must be able to see that and change it.
          div.resolved-note.mt-2(v-if="selectedSegment.resolved_by")
            b {{ selectedSegment.auto_resolved ? 'Resolved by your standing rule' : 'You resolved this' }}
            div.small {{ resolvedSummary(selectedSegment) }}
            //- Roadmap 4.3 / R16. Revoking a *rule* is not a local edit — the same record
            //- settled every block that matched it, and they all go back to asking. Say so
            //- before the button, not in a dialog after it.
            div.small.text-muted.mt-1(v-if="selectedSegment.auto_resolved")
              | Undoing this drops the rule itself, so every stretch it settled goes back to asking.
            b-button.mt-2(
              v-if="!compact"
              size="sm"
              variant="outline-danger"
              :disabled="undoing"
              @click="undoResolution(selectedSegment)"
            ) {{ undoing ? 'Undoing…' : (selectedSegment.auto_resolved ? 'Undo this rule' : 'Undo this answer') }}
          div.resolve.mt-2(v-if="canResolve(selectedSegment) && !compact")
            //- No heading once it is answered: the note above already says what was decided, and
            //- a "Change this answer" heading sitting next to a "Change answer" button read as a
            //- stutter on the tablet.
            b(v-if="!selectedSegment.resolved_by") Resolve this overlap
            div.small.mb-2(v-if="selectedSegment.unresolved") Both devices claim this time. Pick what actually counted — once, or as a standing rule.
            //- The 60-second rule (D15/Q1) settles a brief overlap without asking, so this
            //- block is not shaded and not counted in "unresolved". The owner still opened
            //- it and still saw two apps, so the button is here — it just says why it was
            //- never asked about.
            div.small.mb-2(v-else-if="selectedSegment.absorbed_short_contention")
              | Too brief to ask about — overlaps under a minute settle themselves. Answer it anyway if it matters.
            //- Not "Resolve…" here either. The convention is real, but the owner
            //- read the ellipsis as a cut-off word once already, and a convention
            //- that has to be explained to the person using it has lost.
            b-button(size="sm" :variant="selectedSegment.unresolved ? 'primary' : 'outline-primary'" @click="openResolve")
              | {{ selectedSegment.resolved_by ? 'Change answer' : 'Resolve overlap' }}

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
    :device-role="deviceRole"
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
import { useCategoryStore } from '~/stores/categories';
import { get_day_start_with_offset } from '~/util/time';
import { getClient } from '~/util/awclient';
import { getCategoryColorForLabel } from '~/util/color';
import { ulid } from '~/util/ulid';
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
  /** True when >=2 devices were awake but the run was under `min_contention` (D15/Q1). */
  absorbed_short_contention: boolean;
  /** Id of the decision that settled this block (roadmap 4.2), or null while it is still asking. */
  resolved_by: string | null;
  /** True when a standing rule settled it rather than an answer given for this very time (R16). */
  auto_resolved: boolean;
  /** True when the owner said they were away: it draws, but counts toward no total. */
  ignored: boolean;
  /** True when `label` is the owner's own words rather than an app name. */
  relabelled: boolean;
  deliberate_background: string[];
  /** Roadmap 4.5 — seconds folded in from slivers the smoother rounded away. */
  smoothed_seconds: number;
  /** Roadmap 4.5 — what those slivers were, so the block can say what it swallowed. */
  absorbed_labels: string[];
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
      categoryStore: useCategoryStore(),
      // label -> colour, so a day of several hundred blocks does not re-run every
      // category regex on every redraw. Dropped whenever the categories change.
      colorCache: new Map<string, string>(),
      selected: null as any,
      selectedKey: null as string | null,
      /** The segment the resolution sheet is open on, or null. Roadmap 4.1. */
      resolving: null as Segment | null,
      /** Roadmap 4.3 — a revoke is in flight; both Undo buttons go dead while it is. */
      undoing: false,
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
      /** Measured height of the compact stepper pill, including the gap under it. */
      stepperSpace: 0,
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
        /** Roadmap 4.5 — the smoothing threshold, in seconds. 0 is off (literal). */
        sliverSeconds: 15,
        /** Roadmap 4.5 — the arrows walk only blocks that are still asking. */
        resolveMode: false,
      },
      /**
       * Roadmap 4.5. The threshold the day on screen was actually fetched with. Smoothing
       * happens on the server, so changing the number means a refetch -- and the stored
       * preference lands after the first fetch has already gone out with the default.
       */
      fetchedSliver: null as number | null,
      viewReady: false,
      viewSaveTimer: null as any,
      axisOptions: [
        { text: 'Auto', value: 'auto' },
        { text: 'Vertical', value: 'vertical' },
        { text: 'Horizontal', value: 'horizontal' },
      ],
      sliverPresets: [
        { text: 'Off', value: 0 },
        { text: '10s', value: 10 },
        { text: '15s', value: 15 },
        { text: '30s', value: 30 },
        { text: '60s', value: 60 },
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
    ...mapState(useSettingsStore, ['device_names', 'combined_view', 'startOfDay']),
    dayStart(): moment.Moment {
      // Honour the owner's `Start of day`, like Activity, the Timeline and the day nav
      // all do. This used to be a plain `startOf('day')`, which meant Combined was
      // quietly showing a *different day* from every other screen -- with the default
      // 04:00 offset the two windows were four hours apart, so the same date reported a
      // different total and a different number of unanswered overlaps depending on where
      // it was read. See dayBounds in util/combinedActivity, which is the same rule for
      // the request Activity makes.
      return moment(get_day_start_with_offset(moment(this.date), this.startOfDay));
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
      return `${axis} · ${zoom} · ${this.sliverLabel}`;
    },
    sliverLabel(): string {
      return this.view.sliverSeconds > 0
        ? `round under ${this.view.sliverSeconds}s`
        : 'off — literal';
    },
    /**
     * Roadmap 4.5. What the two arrows do right now, spelled out rather than implied by a
     * highlighted button: the mode changes what Next means, and a mode you cannot read is a
     * mode you will forget you left on.
     */
    stepLabel(): string {
      const n = this.stepRows.length;
      if (this.view.resolveMode) {
        if (!n) return 'nothing left to answer';
        return `${this.stepIndex >= 0 ? this.stepIndex + 1 : '–'} / ${n} unanswered`;
      }
      return `${this.stepIndex >= 0 ? this.stepIndex + 1 : '–'} / ${n}`;
    },
    resolveModeTitle(): string {
      return this.view.resolveMode
        ? 'Resolve mode is on — the arrows walk only unanswered overlaps'
        : 'Resolve mode — make the arrows walk only unanswered overlaps';
    },
    /**
     * Compact: whatever is left of the viewport under the header, measured. Wide:
     * the fixed heights it has always had.
     */
    timelineHeight(): number {
      if (this.compact && this.timelineSpace > 0) return this.timelineSpace;
      return this.windowWidth < 640 ? 520 : 500;
    },
    /**
     * How much empty scroll to leave under the drawing.
     *
     * The stepper is handled by shortening the drawing instead (see `measure`), so it
     * never covers a block at all. The sheet is a deliberate overlay and stays one --
     * but an overlay you cannot scroll out from under is just a block you can never
     * read, which is what the owner hit on the S25U. Its peek height becomes scroll
     * length, so the last stretch of the day can always be brought above it.
     *
     * An open sheet also pushes the stepper up over the drawing again; the peek height
     * is more than that overshoot, so this covers both.
     */
    bottomInset(): number {
      if (!this.compact || !this.selected) return 0;
      return Math.round(this.detailHeight);
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
      // Only the combined track has questions on it, so resolve mode has nowhere else to be.
      if (this.view.resolveMode) return ts[0] || null;
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
        .filter((r: any) => !this.view.resolveMode || r.contended)
        .slice()
        .sort((a: any, b: any) => a.start - b.start);
    },
    /** Index of the selection within [stepRows], or -1 when nothing is selected. */
    stepIndex(): number {
      if (!this.selectedKey) return -1;
      return this.stepRows.findIndex((r: any) => r.key === this.selectedKey);
    },
    /**
     * Where the selection starts, in minutes from midnight, whether or not it is one of the
     * blocks the arrows currently walk.
     *
     * Roadmap 4.5. In resolve mode the selected block is routinely *not* in [stepRows] — you
     * have just answered it, or you tapped a settled block to look at it — and "not in the
     * list" used to mean Next went back to the start of the day. Knowing where you are is what
     * lets it go to the next unanswered block instead.
     */
    selectedStartMinutes(): number | null {
      if (!this.selectedKey) return null;
      for (const track of this.tracks as any[]) {
        const found = (track.rows || []).find((r: any) => r.key === this.selectedKey);
        if (found) return found.start;
      }
      return null;
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
    // Editing a category in Settings must repaint the day, not leave it on the colours
    // the categories used to have.
    'categoryStore.classes': {
      deep: true,
      handler() {
        this.colorCache.clear();
        this.$forceUpdate();
      },
    },
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
    // Smoothing is done on the server, so a new threshold is a new request -- unlike every
    // other view preference, which only changes how the same data is drawn.
    'view.sliverSeconds'() {
      if (!this.viewReady) return;
      this.reload();
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
    // Blocks are coloured by category now, so the categories have to be there before
    // the first draw -- otherwise the day paints itself in the fallback and stays that
    // way until something else forces a redraw.
    await this.categoryStore.load();
    this.colorCache.clear();
    this.$forceUpdate();
    this.seedView(this.combined_view);

    // Deep link, so another screen can hand the owner straight into answering a
    // particular day rather than dropping them on today's and leaving them to navigate.
    // Used by the Activity view's "N still unanswered" banner.
    const q = this.$route.query;
    if (typeof q.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      this.date = q.date;
    }
    if (q.resolve === '1' || q.resolve === 'true') {
      this.view.resolveMode = true;
      // The day may still be in flight; step to the first question once it lands.
      await this.$nextTick();
      if (this.stepIndex < 0 && this.stepRows.length) this.step(1);
    }
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

      // The compact stepper is `position: fixed`, so it is out of the flow and nothing
      // above accounts for it. Left alone it floats over the drawing and covers blocks
      // whether or not anything is selected -- the owner, on the S25U: "the prev next
      // buttons block the timeline even if the sheet is not open". Measure it and give
      // it a strip of its own, so the drawing simply stops above it.
      const stepper = this.$refs.stepper as HTMLElement | undefined;
      const sh = stepper && this.compact ? stepper.getBoundingClientRect().height + 16 : 0;
      if (Math.abs(sh - this.stepperSpace) > 1) this.stepperSpace = sh;

      const body = this.$refs.body as HTMLElement | undefined;
      if (body) {
        const used = body.getBoundingClientRect().top - root.getBoundingClientRect().top;
        const space = Math.max(160, avail - used - 4 - sh);
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
        sliverSeconds: v.sliverSeconds ?? 15,
        resolveMode: v.resolveMode ?? false,
      };
      // Let the seed settle before the watcher starts persisting changes.
      this.$nextTick(() => {
        this.viewReady = true;
        // The first fetch went out before the store had loaded, so it used the default
        // threshold. If the owner's stored one differs, the day on screen is the wrong day.
        if (this.fetchedSliver !== this.view.sliverSeconds) this.reload();
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
        const sliver = this.view.sliverSeconds;
        const res = await client.req.get('/0/combined/timeline', {
          params: { start, end, sliver },
        });
        this.fetchedSliver = sliver;
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
    /** Seconds, for the smoothing note — where "0m" would be every answer `fmt` could give. */
    fmtSeconds(seconds: number): string {
      return seconds < 90 ? `${Math.round(seconds)}s` : this.fmt(seconds / 60);
    },
    fmt(minutes: number): string {
      // Round the total, then split it. Flooring the hours and rounding the
      // remainder separately makes 299.6 minutes read "4h 60m", which is what the
      // tablet showed on a real day -- floor(4.99) is 4 and round(59.6) is 60.
      const total = Math.round(minutes);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
    },
    colorFor(label: string): string {
      // Colour is whatever Categorization says it is -- the same answer the Activity
      // view gives -- rather than a hash of the app name that nothing could change.
      const key = label || '';
      const hit = this.colorCache.get(key);
      if (hit !== undefined) return hit;
      const color = getCategoryColorForLabel(key, this.categoryStore.classes);
      this.colorCache.set(key, color);
      return color;
    },

    /** Foreground first, then the background slices — the order the bands are drawn in. */
    /**
     * How this block stands, in three states rather than two.
     *
     * "Settled" used to mean *both* "one device was awake" and "you answered this" — and,
     * confusingly, "two devices, but only for a moment". Each is a different thing to know,
     * and the middle one is the whole point of Phase 4.
     */
    segmentBadge(s: Segment): { variant: string; text: string } {
      if (s.unresolved) return { variant: 'warning', text: 'Unresolved overlap' };
      if (s.ignored) return { variant: 'secondary', text: 'Counts as nothing' };
      if (s.resolved_by)
        return {
          variant: 'success',
          text: s.auto_resolved ? 'Resolved by rule' : 'Resolved',
        };
      if (s.absorbed_short_contention) return { variant: 'light', text: 'Brief overlap' };
      return { variant: 'success', text: 'Settled' };
    },
    /**
     * Is there a question here to answer? Anything with more than one activity in it, whether
     * or not the pipeline decided to ask.
     *
     * Deliberately wider than `unresolved`. A block absorbed by the 60-second rule is never
     * shaded and never counted as unresolved, but it still shows the owner two apps — and being
     * shown two things with no way to say which was real is the confusing part.
     */
    canResolve(s: Segment): boolean {
      return this.slicesOf(s).length > 1;
    },
    /** One line naming what the decision did, for the detail panel. */
    resolvedSummary(s: Segment): string {
      if (s.ignored) return 'You were away — this time counts toward no total.';
      if (s.relabelled) return `Relabelled “${s.label}”.`;
      const also = (s.deliberate_background || []).join(', ');
      const counted = `${s.label} on ${this.deviceLabel(s.device)} counted.`;
      return also ? `${counted} You meant ${also} to be running too.` : counted;
    },
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

    /**
     * The name a decision's signature calls this device — its hostname, falling back to the uuid.
     *
     * Not [[deviceLabel]], and the difference matters: a label can be a nickname typed on *this*
     * device, or the literal words "This device". Either would make a rule that no peer can match,
     * which is the one thing R18 forbids. A hostname is the same string on every device.
     */
    deviceRole(uuid: string): string {
      const d = this.devices.find(x => x.device === uuid);
      return (d && d.hostname) || uuid;
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
      let next: number;
      if (i >= 0) {
        next = Math.min(rows.length - 1, Math.max(0, i + dir));
      } else {
        // Nothing selected, or something selected that these arrows do not walk. Step from
        // where the eye is rather than from the start of the day.
        const from = this.selectedStartMinutes;
        if (from === null) next = dir > 0 ? 0 : rows.length - 1;
        else if (dir > 0) {
          const j = rows.findIndex((r: any) => r.start > from);
          next = j < 0 ? rows.length - 1 : j;
        } else {
          let j = -1;
          rows.forEach((r: any, k: number) => {
            if (r.start < from) j = k;
          });
          next = j < 0 ? 0 : j;
        }
      }
      this.selectRow(rows[next]);
    },
    /** Select one steppable row and bring it on screen. */
    selectRow(row: any) {
      this.selected = row.ref;
      this.selectedKey = row.key;
      // Every block opens at the peek, for the reason [onSelect] gives.
      this.detailOpen = false;
      this.$nextTick(() => {
        const tl: any = this.$refs.tl;
        if (tl && tl.revealRange) tl.revealRange(row.start, row.end);
      });
    },
    /**
     * Roadmap 4.5 — turn the sweep on or off.
     *
     * Turning it on jumps straight to something unanswered. The mode exists because the owner
     * had no way to find the questions: on a day of several hundred blocks the six that are
     * still asking are six shaded slivers to hunt for by eye.
     */
    toggleResolveMode() {
      this.view.resolveMode = !this.view.resolveMode;
      if (this.view.resolveMode && this.stepIndex < 0 && this.stepRows.length) this.step(1);
    },
    /**
     * Roadmap 4.5 — after answering one question in resolve mode, go to the next.
     *
     * `from` is where the block that was just answered started; it is no longer in [stepRows],
     * so the next one is the first that begins at or after it.
     */
    advanceToNextUnanswered(from: number | null) {
      const rows = this.stepRows;
      if (!rows.length) {
        this.clearSelection();
        return;
      }
      const j = from === null ? 0 : rows.findIndex((r: any) => r.start >= from);
      this.selectRow(rows[j < 0 ? rows.length - 1 : j]);
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
     * Roadmap 4.2 — store the record and show the day it produces.
     *
     * There is no separate "recompute" call, by design: the pipeline applies whatever is
     * stored, so re-reading the day *is* the recomputation. The record itself is stored
     * verbatim; the server never rewrites it, because the copy that reaches the other
     * device has to be byte-for-byte the same line.
     */
    async onResolved(decision: any) {
      const key = this.selectedKey;
      const from = this.selectedStartMinutes;
      try {
        await getClient().req.post('/0/combined/decisions', decision);
      } catch (e: any) {
        this.error = e?.response?.data?.message || e?.message || 'Could not save that decision.';
        return;
      }
      this.resolving = null;
      await this.reload();
      // `reload` clears the selection. What goes back depends on what the owner is doing.
      // Sweeping through the questions (roadmap 4.5), the natural next thing is the next
      // question; looking at one block, it is that block wearing its new answer.
      if (this.view.resolveMode) this.advanceToNextUnanswered(from);
      else this.restoreSelection(key);
    },
    /**
     * Roadmap 4.3 — take an answer back.
     *
     * A tombstone, not a delete. The decision it revokes has almost certainly been copied to
     * the other device already, and deleting our own copy would leave theirs standing — the
     * block would un-resolve here and re-resolve on the next sync. A tombstone travels the
     * same way the decision did and `merge_decisions` drops the pair whichever file each
     * arrives in, so both devices end up asking again.
     *
     * There is nothing to write for "make it unresolved" beyond that: the segment is only
     * settled because a decision covers it, so removing the decision *is* the undo, and the
     * next read of the day re-derives the shading (`04` §2.4).
     */
    async undoResolution(segment: Segment) {
      if (!segment.resolved_by || this.undoing) return;
      const key = this.selectedKey;
      this.undoing = true;
      try {
        await getClient().req.post('/0/combined/decisions', {
          id: ulid('t_'),
          type: 'tombstone',
          created_at: new Date().toISOString(),
          created_by: this.ownDevice,
          revokes: segment.resolved_by,
        });
      } catch (e: any) {
        this.error = e?.response?.data?.message || e?.message || 'Could not undo that decision.';
        return;
      } finally {
        this.undoing = false;
      }
      await this.reload();
      this.restoreSelection(key);
    },
    /**
     * Re-select the block with this key after a reload, if it is still there.
     *
     * It may not be: a decision can change where blocks coalesce, so the answered stretch can
     * come back with a different start and therefore a different key. Failing silently is the
     * right behaviour — the day is correct, and nothing is worth guessing at a neighbour.
     */
    restoreSelection(key: string | null) {
      if (!key) return;
      // `tracks`, not `rows`. `rows` is the name of the *field inside* each track, and reading it
      // off the component gave `undefined` — which threw "undefined is not iterable" the moment a
      // decision was saved, after the day had already reloaded correctly. Caught on the tablet.
      for (const track of this.tracks as any[]) {
        const found = (track.rows || []).find((r: any) => r.key === key);
        if (found) {
          this.onSelect(found.ref, key);
          return;
        }
      }
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
}

// The ⚙ itself is not compact-only: it is the entrance to the two panels at every
// width now, so it is styled once, outside the compact block.
.gear {
  line-height: 1;
  padding: 0.25rem 0.5rem;
  font-size: 1rem;
}

// Wide: the panel opens in the flow, where the fold-outs used to live permanently,
// and marks itself as a thing that was opened rather than part of the page.
.combined-view:not(.compact) .tools-wrap {
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.05);
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

  // "nothing left to answer" is a whole phrase, not a counter, and it is the one message
  // in this pill worth reading rather than glancing at.
  &.done {
    min-width: 0;
    opacity: 1;
    color: #1a7f4f;
    font-weight: 600;
    padding: 0 6px;
  }
}

// Roadmap 4.5. Smaller than the arrows on purpose: it is the thing you touch once at the
// start of a sweep, not the thing you touch six times during one. Lit, it carries the same
// orange the shading on an unresolved block uses, so the mode and what it walks match.
.st-mode {
  width: 30px;
  height: 30px;
  margin-right: 2px;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  opacity: 0.6;

  &.on {
    opacity: 1;
    color: #fff;
    border-color: #b4541f;
    background: #b4541f;
  }
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
  // Owner, on the tablet in landscape: "a lot of wasted space between the end of the timeline and
  // the details". The panel was *wrapping*. `flex-grow-1` leaves `flex-basis: auto`, and the
  // drawing's natural width is a whole day, so the row overflowed and the 300px panel dropped
  // below it — under the timeline's full height, which is why it took a scroll through half a
  // screen of nothing to reach. It sits beside the drawing now, which is where a side panel that
  // describes the thing you just tapped belongs.
  flex-wrap: nowrap;

  > :first-child {
    flex: 1 1 0;
    // Without this a flex item refuses to shrink below its content, which is what let the drawing
    // push the panel off the row in the first place.
    min-width: 0;
  }
}
.combined-view.compact .timeline-body {
  // Reaching the end of the timeline must not start scrolling something else.
  overscroll-behavior: contain;
}
.detail {
  width: 300px;
  flex: 0 0 300px;
  // Top-aligned and self-scrolling: a short block's details should not be stretched down the whole
  // height of the drawing, and a long source-event list should not stretch the page.
  align-self: flex-start;
  max-height: 100%;
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
// Roadmap 4.5. A quieter box than `.note-inline`: what was rounded away is a footnote about
// the drawing, not a warning about the data.
.smoothed-note {
  font-size: 11.5px;
  border-left: 2px solid rgba(128, 128, 128, 0.55);
  padding: 6px 8px;
  background: rgba(128, 128, 128, 0.08);
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
