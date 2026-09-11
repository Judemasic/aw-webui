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
        b-btn(
          size="sm"
          variant="outline-secondary"
          :disabled="busy"
          @click="openPicker(r.label)"
        )
          | {{ $t('activity.categorizeInline.assign') }}
    b-btn.mt-2(
      v-if="rows.length > visible.length"
      size="sm"
      variant="outline-secondary"
      @click="shown += PAGE"
    )
      | {{ $t('activity.categorizeInline.showMore') }}

  div.text-danger.small.mt-2(v-if="error") {{ error }}

  b-modal(
    v-model="picking"
    :title="$t('activity.categorizeInline.pickTitle', { app: pendingLabel })"
    ok-only
    ok-variant="secondary"
    :ok-title="$t('common.cancel')"
    @hidden="categorySearch = ''"
  )
    b-form-input.mb-2(
      v-model="categorySearch"
      size="sm"
      type="search"
      :placeholder="$t('activity.categorizeInline.pickPlaceholder')"
      :aria-label="$t('activity.categorizeInline.pickPlaceholder')"
    )
    div.small.text-muted(v-if="categorySearch && pickCategories.length === 0")
      | {{ $t('activity.categorizeInline.pickNoMatches', { query: categorySearch }) }}
    b-list-group(flush style="max-height: 50vh; overflow-y: auto")
      b-list-group-item(button @click="chooseCreate")
        | {{ $t('activity.categorizeInline.newCategory') }}
      b-list-group-item(button v-for="c in pickCategories" :key="c.value" @click="choose(c.value)")
        | {{ c.text }}

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
      picking: false,
      categorySearch: '',
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
    /** Every category that can be assigned to, as `Parent > Child`, alphabetically. */
    categoryOptions(): { value: any; text: string }[] {
      return this.categoryStore.classes
        .filter((c: any) => !(c.name.length === 1 && c.name[0] === 'Uncategorized'))
        .map((c: any) => ({ value: c.id, text: c.name.join(' > ') }))
        .sort((a: any, b: any) => (a.text > b.text ? 1 : -1));
    },
    /**
     * The categories the picker lists, narrowed by its own search box.
     *
     * Matched against the full `Parent > Child` path, so typing a parent finds all of
     * its children -- a set of categories deep enough to need searching is usually deep
     * because of nesting, not because of a long flat list.
     *
     * Substring, case-insensitive, and not a regex, for the same reason the app search
     * above it is not: the thing being searched here ends up next to a regex field, and
     * a box that silently treated `c++` as a pattern would teach the wrong lesson.
     */
    pickCategories(): { value: any; text: string }[] {
      const q = this.categorySearch.trim().toLowerCase();
      if (!q) return this.categoryOptions;
      return this.categoryOptions.filter(c => c.text.toLowerCase().includes(q));
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
    /**
     * Open the category picker for one app.
     *
     * A picker rather than the select this replaced: the select was the browser's own,
     * which on a phone is a wheel with no way to type, so finding one category among a
     * few dozen meant scrolling past all of them. Asked for after using it.
     */
    openPicker(label: string) {
      this.pendingLabel = label;
      this.categorySearch = '';
      this.picking = true;
    },
    async choose(id: any) {
      if (id === null || id === undefined) return;
      const label = this.pendingLabel;
      this.picking = false;
      await this.commit(() => this.categoryStore.appendClassRule(id, this.literal(label)));
    },
    /** Hand the same app off to the new-category modal, one modal at a time. */
    chooseCreate() {
      this.newCategoryName = this.pendingLabel;
      this.picking = false;
      this.$nextTick(() => {
        this.creating = true;
      });
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
