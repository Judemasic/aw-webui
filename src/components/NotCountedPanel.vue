<template lang="pug">
div
  div.small.text-muted.mb-2 {{ $t('activity.notCounted.explain') }}
  div.d-flex.flex-wrap.align-items-center.py-1.border-top(v-for="r in rows" :key="r.id")
    div.mr-auto.pr-2
      div {{ r.path }}
      div.small.text-muted(v-if="measured") {{ duration(r.seconds) }} {{ $t('activity.notCounted.inPeriod') }}
      div.small.text-muted(v-else) {{ $t('activity.notCounted.notMeasured') }}
    b-btn(
      size="sm"
      variant="outline-secondary"
      :disabled="busy"
      @click="countAgain(r.id)"
    )
      | {{ $t('activity.notCounted.countAgain') }}
  div.text-danger.small.mt-2(v-if="error") {{ error }}
</template>

<script lang="ts">
/**
 * Roadmap 4.6b — what is being excluded, how much time each rule is eating, and undo.
 *
 * 4.6a made *"do not count this"* work, and in doing so made it invisible: an excluded app is
 * missing from the day's total, its app list, its category breakdown and its active time, and
 * nothing on the page says why any of those numbers are smaller than they were. The roadmap's own
 * reason for this step is the one that matters — *"an exclusion the owner cannot see is one they
 * will eventually forget and mistrust the totals over"*.
 *
 * Three things, deliberately no more: **which** rules are on, **how much** each ate in the period on
 * screen, and **one tap to stop**. Anything else about a category — its rule, its colour, its
 * children — is the categorisation editor's job and is one link away.
 *
 * Only the categories that actually carry the flag are listed, not the descendants that inherit it:
 * ticking "Social" excludes "Social > Reddit" too, and listing both would read as two rules to
 * revoke when there is one. The *time* is summed over the descendants all the same, because that is
 * what the rule is eating.
 */
import { mapState } from 'pinia';
import _ from 'lodash';
import { useActivityStore } from '~/stores/activity';
import { useCategoryStore } from '~/stores/categories';
import { Category } from '~/util/classes';

export default {
  name: 'aw-not-counted',
  props: {
    /**
     * Per-category excluded seconds measured by the caller, instead of the Activity store's.
     *
     * The combined day fetches its own timeline and never runs the per-device query the store
     * holds, so without this the panel could only say "not measured on this page" in the one view
     * that actually *draws* the excluded blocks. `null` keeps the store as the source.
     */
    categories: {
      type: Array as () => { name: string[]; seconds: number }[] | null,
      default: null,
    },
  },
  data() {
    return {
      busy: false,
      error: null as string | null,
    };
  },
  computed: {
    ...mapState(useActivityStore, ['not_counted']),
    ...mapState(useCategoryStore, ['classes']),
    /** Whether the time figures on screen were actually worked out for this period. */
    measured(): boolean {
      return this.categories !== null || this.not_counted.loaded;
    },
    /**
     * One row per category carrying the flag, biggest eater first.
     *
     * The seconds come from the store, which keys them by the *matched* category — which may be a
     * descendant — so each row sums itself and everything under it.
     */
    rows(): { id: number; path: string; seconds: number }[] {
      const flagged = (this.classes as Category[]).filter(
        c => c.data && (c.data as any).not_counted === true
      );
      const measuredRows = this.categories || this.not_counted.categories || [];
      return flagged
        .map(c => ({
          id: c.id as number,
          path: c.name.join(' > '),
          seconds: measuredRows
            .filter(m => _.isEqual(c.name, m.name.slice(0, c.name.length)))
            .reduce((a, m) => a + m.seconds, 0),
        }))
        .sort((a, b) => b.seconds - a.seconds || a.path.localeCompare(b.path));
    },
  },
  methods: {
    duration(seconds: number): string {
      const total = Math.round(seconds || 0);
      if (total < 60) return `${total}s`;
      const h = Math.floor(total / 3600);
      const m = Math.floor(total / 60) % 60;
      return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
    },
    /**
     * Turn one rule off and save.
     *
     * Untick rather than delete: the category, its rule and its colour are all still wanted — it is
     * only the *not counting* that is being revoked. Deleting the category would take a regex the
     * owner wrote with it, and would be a strange thing for a button called "count it again" to do.
     */
    async countAgain(id: number) {
      if (this.busy) return;
      this.busy = true;
      this.error = null;
      const categoryStore = useCategoryStore();
      try {
        const cat = (this.classes as Category[]).find(c => c.id === id);
        if (!cat) return;
        const data = { ...(cat.data || {}) };
        // Removed rather than set to false, so a category that never counted differently carries no
        // key at all -- the same shape 4.6a writes, and one less thing in the synced settings.
        delete (data as any).not_counted;
        categoryStore.updateClass({ ...cat, data });
        await categoryStore.save();
        this.$emit('changed');
      } catch (e: any) {
        this.error =
          e?.response?.data?.message || e?.message || this.$t('activity.notCounted.saveFailed');
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>
