<template lang="pug">
div
  div.small.text-muted.mb-2(v-if="allRows.length === 0")
    | {{ $t('activity.categorizeInline.allCategorized') }}
  div(v-else)
    b-form-input.mb-2(
      v-model="search"
      size="sm"
      type="search"
      :placeholder="$t('activity.categorizeInline.searchPlaceholder')"
      :aria-label="$t('activity.categorizeInline.searchPlaceholder')"
    )
    div.small.text-muted.mb-2(v-if="search && rows.length === 0")
      | {{ $t('activity.categorizeInline.noMatches', { query: search }) }}
    div.d-flex.flex-wrap.align-items-center.py-1.border-top(v-for="r in visible" :key="r.label")
      div.mr-auto.pr-2
        div {{ r.label }}
        div.small.text-muted {{ duration(r.seconds) }}
      div.d-flex.align-items-center(style="gap: 0.35rem")
        b-form-select(
          size="sm"
          style="max-width: 200px"
          :value="null"
          :options="categoryOptions"
          @change="assign(r.label, $event)"
          :disabled="busy"
        )
    b-btn.mt-2(
      v-if="rows.length > visible.length"
      size="sm"
      variant="outline-secondary"
      @click="shown += PAGE"
    )
      | {{ $t('activity.categorizeInline.showMore') }}

  div.text-danger.small.mt-2(v-if="error") {{ error }}

  b-modal(
    v-model="creating"
    :title="$t('activity.categorizeInline.newCategoryTitle')"
    :ok-title="$t('common.save')"
    @ok="createCategory"
  )
    b-form-group(:label="$t('activity.categorizeInline.newCategoryLabel')")
      b-form-input(v-model="newCategoryName" :placeholder="pendingLabel")
    p.small.text-muted.mb-0
      | {{ $t('activity.categorizeInline.newCategoryHelp', { app: pendingLabel }) }}
</template>

<script lang="ts">
/**
 * Categorising an app without leaving Activity (roadmap 4.4a).
 *
 * Uncategorised activity used to route to Settings > Categorization — a different page,
 * a different scroll position, and a round trip back — when the rule the owner wants is
 * simply "this app, this category". The store already had the call the Category Builder
 * uses (`appendClassRule`), so this is the same edit made where the app is on screen.
 *
 * Settings stays the place to edit the *whole set*. This only ever appends one literal
 * app name to one rule, or creates one category with that app name as its rule.
 */
import Vue from 'vue';
import { useCategoryStore } from '~/stores/categories';
import { nextUnusedMutedColor } from '~/util/palette';
import { matchString } from '~/util/classes';
import { seconds_to_duration } from '~/util/time';

const PAGE = 5;

/** The sentinel the select uses for "make a new category from this app name". */
const CREATE = '__create__';

export default Vue.extend({
  name: 'aw-inline-categorize',
  props: {
    /** The day's top app rows, as Activity already has them. */
    events: { type: Array as () => any[], default: () => [] },
  },
  data() {
    return {
      PAGE,
      shown: PAGE,
      search: '',
      busy: false,
      error: '' as string,
      creating: false,
      pendingLabel: '',
      newCategoryName: '',
      categoryStore: useCategoryStore(),
    };
  },
  computed: {
    /** The apps that match no category rule at all, biggest first. */
    allRows(): { label: string; seconds: number }[] {
      const classes = this.categoryStore.classes;
      const pins = this.categoryStore.category_pins;
      const out: { label: string; seconds: number }[] = [];
      for (const e of this.events || []) {
        const label = (e.data && (e.data.app || e.data.title)) || '';
        if (!label) continue;
        if (matchString(label, classes, undefined, pins)) continue;
        out.push({ label, seconds: e.duration || 0 });
      }
      return out;
    },
    /**
     * What the list shows: the uncategorised apps, narrowed by the search box.
     *
     * Plain case-insensitive substring, not a regex. The box sits above a control that
     * writes regexes, and a search that quietly interpreted `c++` as a pattern would
     * both fail to find the app and teach the wrong thing about the field below it.
     *
     * Searching filters what the day's query returned, which is capped at 100 apps per
     * group. A day with more distinct apps than that has a tail the box cannot reach --
     * but the cap is by duration, so what it cannot reach is the least-used end.
     */
    rows(): { label: string; seconds: number }[] {
      const q = this.search.trim().toLowerCase();
      if (!q) return this.allRows;
      return this.allRows.filter(r => r.label.toLowerCase().includes(q));
    },
    visible(): { label: string; seconds: number }[] {
      return this.rows.slice(0, this.shown);
    },
    categoryOptions(): { value: any; text: string; disabled?: boolean }[] {
      const cats = this.categoryStore.classes
        .filter((c: any) => !(c.name.length === 1 && c.name[0] === 'Uncategorized'))
        .map((c: any) => ({ value: c.id, text: c.name.join(' > ') }))
        .sort((a: any, b: any) => (a.text > b.text ? 1 : -1));
      return [
        {
          value: null,
          text: this.$t('activity.categorizeInline.assign') as string,
          disabled: true,
        },
        { value: CREATE, text: this.$t('activity.categorizeInline.newCategory') as string },
        ...cats,
      ];
    },
  },
  watch: {
    // A new search starts at the top of its own results rather than however far the
    // owner had paged into the previous ones.
    search() {
      this.shown = PAGE;
    },
  },
  methods: {
    duration(seconds: number): string {
      return seconds_to_duration(Math.round(seconds));
    },
    /** Escape the app name so it is appended as a literal, not as a pattern. */
    literal(label: string): string {
      return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    async assign(label: string, choice: any) {
      if (choice === null || choice === undefined) return;
      if (choice === CREATE) {
        this.pendingLabel = label;
        this.newCategoryName = label;
        this.creating = true;
        return;
      }
      await this.commit(() => this.categoryStore.appendClassRule(choice, this.literal(label)));
    },
    async createCategory() {
      const name = (this.newCategoryName || this.pendingLabel).trim();
      if (!name) return;
      const label = this.pendingLabel;
      await this.commit(() => {
        // Give it a colour up front, the same way Settings does: a category with none
        // renders as the uncategorized grey, so a freshly made one would be invisible
        // in every chart until its colour was set by hand.
        const used = this.categoryStore.classes
          .map((c: any) => c.data && c.data.color)
          .filter(Boolean);
        this.categoryStore.addClass({
          name: [name],
          rule: { type: 'regex', regex: this.literal(label) },
          data: { color: nextUnusedMutedColor(used) },
        });
      });
    },
    /**
     * Make the edit, save it, and tell the page to recompute.
     *
     * Saved immediately rather than left in the categories store's unsaved-changes
     * buffer: that buffer belongs to the Settings editor, which has a Save and a
     * Discard next to it. Here there is neither, and an edit that looked applied but
     * was silently pending would be worse than no control at all.
     */
    async commit(edit: () => void) {
      this.busy = true;
      this.error = '';
      try {
        edit();
        await this.categoryStore.save();
        this.$emit('changed');
      } catch (e: any) {
        this.error = e?.message || this.$t('activity.categorizeInline.saveFailed');
      }
      this.busy = false;
    },
  },
});
</script>
