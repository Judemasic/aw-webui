<template lang="pug">
div
  div.small.text-muted.mb-2(v-if="segments.length === 0")
    | {{ $t('activity.resolveInline.allAnswered') }}
  div(v-else)
    div.d-flex.flex-wrap.align-items-center.py-1.border-top(
      v-for="(s, i) in visible"
      :key="s.start + '|' + s.device"
    )
      div.mr-auto.pr-2
        div {{ titleFor(s) }}
        div.small.text-muted {{ rangeFor(s) }} · {{ fmt(s.seconds / 60) }}
      b-btn(size="sm" variant="outline-warning" @click="resolving = s")
        | {{ $t('activity.resolveInline.answer') }}
    b-btn.mt-2(
      v-if="segments.length > visible.length"
      size="sm"
      variant="outline-secondary"
      @click="shown += PAGE"
    )
      | {{ $t('activity.resolveInline.showMore') }}

  div.text-danger.small.mt-2(v-if="error") {{ error }}

  ResolutionSheet(
    v-if="resolving"
    :segment="resolving"
    :participants="participants"
    :own-device="ownDeviceUuid"
    :device-label="labelFor"
    :device-role="roleFor"
    :format-duration="fmt"
    :clock="clock"
    @cancel="resolving = null"
    @save="onResolved"
  )
</template>

<script lang="ts">
/**
 * Answering a contended stretch of time without leaving Activity (roadmap 4.4a).
 *
 * 4.4 got as far as a banner that handed the owner to the Combined timeline with the
 * right day and resolve mode on — a different screen, and then a hunt for the block.
 * `ResolutionSheet` is self-contained, so the only thing missing was the segment to
 * pass it and a recompute afterwards; both are here.
 *
 * Saving posts the same `/0/combined/decisions` record the Combined timeline posts.
 * There is deliberately no second decision format: a decision made here and a decision
 * made there have to be the same thing, or the two screens would answer the same day
 * differently — which is what 4.4d had to be opened to fix.
 */
import Vue from 'vue';
import moment from 'moment';
import ResolutionSheet from '~/visualizations/ResolutionSheet.vue';
import { getClient } from '~/util/awclient';
import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import { getCategoryColorForLabel } from '~/util/color';
import { deviceLabel, deviceRole, ownDevice, participantsOf, slicesOf } from '~/util/devices';
import { seconds_to_duration } from '~/util/time';

/** How many questions to show before "show more" — one screen's worth on a phone. */
const PAGE = 5;

export default Vue.extend({
  name: 'aw-inline-resolve',
  components: { ResolutionSheet },
  props: {
    /** The day's still-unanswered contended segments. */
    segments: { type: Array as () => any[], required: true },
    /** The device tracks the same response carried, for naming. */
    devices: { type: Array as () => any[], default: () => [] },
  },
  data() {
    return {
      PAGE,
      shown: PAGE,
      resolving: null as any,
      error: '' as string,
      categoryStore: useCategoryStore(),
      settingsStore: useSettingsStore(),
    };
  },
  computed: {
    visible(): any[] {
      return this.segments.slice(0, this.shown);
    },
    ownDeviceUuid(): string {
      return ownDevice(this.devices);
    },
    participants(): any[] {
      if (!this.resolving) return [];
      return participantsOf(this.resolving, (label: string) =>
        getCategoryColorForLabel(
          label,
          this.categoryStore.classes,
          this.categoryStore.category_pins
        )
      );
    },
  },
  methods: {
    fmt(minutes: number): string {
      return seconds_to_duration(Math.round(minutes * 60));
    },
    clock(ts: string): string {
      return moment(ts).format('HH:mm');
    },
    rangeFor(s: any): string {
      return `${this.clock(s.start)} – ${this.clock(s.end)}`;
    },
    /** A contended block names everything that ran, not a winner with a footnote. */
    titleFor(s: any): string {
      return Array.from(new Set(slicesOf(s).map(x => x.label))).join(' + ');
    },
    labelFor(uuid: string): string {
      return deviceLabel(uuid, this.devices, this.settingsStore.device_names);
    },
    roleFor(uuid: string): string {
      return deviceRole(uuid, this.devices);
    },
    async onResolved(decision: any) {
      this.error = '';
      try {
        await getClient().req.post('/0/combined/decisions', decision);
      } catch (e: any) {
        this.error =
          e?.response?.data?.message || e?.message || this.$t('activity.resolveInline.saveFailed');
        return;
      }
      this.resolving = null;
      // The day's totals move when a decision lands, so the page reloads rather than
      // striking the answered row out and leaving every number saying what it said.
      this.$emit('resolved', decision);
    },
  },
});
</script>
