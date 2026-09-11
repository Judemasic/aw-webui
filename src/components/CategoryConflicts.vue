<template lang="pug">
div
  p.text-muted.small.mb-3 {{ $t('settings.categorization.conflicts.help') }}

  h6.mt-3 {{ $t('settings.categorization.conflicts.unansweredTitle') }}
  div(v-if="loading")
    b-spinner.mr-2(small)
    span.text-muted {{ $t('settings.categorization.conflicts.scanning') }}
  div(v-else-if="error")
    p.text-danger.mb-0 {{ $t('settings.categorization.conflicts.scanFailed') }}
  div(v-else-if="conflicts.length === 0")
    p.text-muted.mb-0 {{ $t('settings.categorization.conflicts.none') }}
  div(v-else)
    div.py-2.border-bottom(v-for="c in conflicts" :key="c.label")
      div.d-flex.flex-row.align-items-center.flex-wrap(style="gap: 0.5rem")
        div.flex-grow-1
          b {{ c.label }}
          div.small.text-muted
            | {{ $t('settings.categorization.conflicts.matchedBy') }}
            |  {{ c.tied.map(t => t.name.join(' > ')).join(', ') }}
        div.flex-grow-0
          b-btn.mr-1(
            v-for="t in c.tied"
            :key="t.name.join('>')"
            size="sm"
            variant="outline-primary"
            @click="choose(c.label, t.name)"
          ) {{ t.name.join(' > ') }}

  h6.mt-4 {{ $t('settings.categorization.conflicts.pinnedTitle') }}
  p.text-muted.small.mb-2 {{ $t('settings.categorization.conflicts.pinnedHelp') }}
  div(v-if="pins.length === 0")
    p.text-muted.mb-0 {{ $t('settings.categorization.conflicts.noPins') }}
  div(v-else)
    div.py-2.border-bottom(v-for="p in pins" :key="p.pin.label")
      div.d-flex.flex-row.align-items-center.flex-wrap(style="gap: 0.5rem")
        div.flex-grow-1
          b {{ p.pin.label }}
          span.mx-1 →
          span {{ p.pin.category.join(' > ') }}
          div.small.text-warning(v-if="!p.active")
            | {{ $t('settings.categorization.conflicts.inert') }}
        div.flex-grow-0
          b-btn(size="sm" variant="outline-danger" @click="remove(p.pin.label)")
            | {{ $t('settings.categorization.conflicts.remove') }}
</template>

<script lang="ts">
import moment from 'moment';
import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import { getClient } from '~/util/awclient';
import { unansweredConflicts } from '~/util/classes';
import { get_day_start_with_offset } from '~/util/time';

/** How far back the scan looks for activity labels to ask about. */
const SCAN_DAYS = 7;

/**
 * The collisions the owner has not answered, and the answers they have given.
 *
 * Two rules at the same depth that both match an activity used to be resolved by
 * whichever came first in the stored list — arbitrary from the owner's point of view,
 * and invisible. This panel makes the tie visible and asks once per activity label
 * (roadmap 4.4e).
 *
 * Labels come from `GET /api/0/combined/timeline` rather than a per-host query: it is
 * one request, it already spans every synced device, and its rows carry exactly the app
 * label a pin is keyed on. A pin that only existed on the device that made it would be
 * the kind of per-device disagreement R18 exists to prevent — `category_pins` is in the
 * shared-settings allowlist, so both devices end up with the same answers.
 */
export default {
  name: 'CategoryConflicts',
  data() {
    return {
      loading: true,
      error: false,
      labels: [] as string[],
      categoryStore: useCategoryStore(),
    };
  },
  computed: {
    conflicts(): { label: string; tied: any[] }[] {
      return unansweredConflicts(
        this.labels,
        this.categoryStore.classes,
        this.categoryStore.category_pins
      );
    },
    pins(): { pin: any; active: boolean }[] {
      return this.categoryStore.pins_annotated;
    },
  },
  async mounted() {
    await this.categoryStore.load();
    await this.scan();
  },
  methods: {
    async scan() {
      this.loading = true;
      this.error = false;
      try {
        const startOfDay = useSettingsStore().startOfDay;
        const end = moment(get_day_start_with_offset(undefined, startOfDay)).add(1, 'day');
        const start = moment(end).subtract(SCAN_DAYS, 'days');
        const res = await getClient().req.get('/0/combined/timeline', {
          params: { start: start.format(), end: end.format() },
        });
        const rows = (res.data && res.data.combined) || [];
        this.labels = rows.filter(r => !r.ignored).map(r => r.label || '');
      } catch (e) {
        console.error('Failed to scan for category conflicts', e);
        this.error = true;
      }
      this.loading = false;
    },
    async choose(label: string, category: string[]) {
      await this.categoryStore.pinLabel(label, category);
    },
    async remove(label: string) {
      await this.categoryStore.unpinLabel(label);
    },
  },
};
</script>
