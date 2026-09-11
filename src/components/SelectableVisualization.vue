<template lang="pug">
div(v-if="editable || !activityStore.buckets.loaded || has_prerequisites || !settingsStore.hideUnsupportedVisualizations")
  h5
    icon.handle(name="bars" v-if="editable" style="opacity: 0.6; cursor: grab;")
    | {{ visualizations[type].title }}
  div(v-if="editable").vis-style-dropdown-btn
    b-dropdown.mr-1(size="sm" variant="outline-secondary" right)
      template(v-slot:button-content)
        icon(name="cog")
      b-dropdown-item(v-for="t in types" :key="t" variant="outline-secondary" @click="$emit('onTypeChange', id, t)")
        | {{ visualizations[t].title }} #[span.small.text-warning(v-if="!visualizations[t].available") (no data)]
    b-button.p-0(size="sm", variant="outline-danger" @click="$emit('onRemove', id)")
      icon(name="times")

  div(v-if="!supports_period")
    b-alert.small.px-2.py-1(show variant="warning")
      | This feature doesn't support the current time period.

  div(v-if="activityStore.buckets.loaded")
    // Check data prerequisites
    div(v-if="!has_prerequisites")
      b-alert.small.px-2.py-1(show variant="warning")
        | This feature is missing data from a required watcher.
        | You can find a list of all watchers in #[a(href="https://docs.activitywatch.net/en/latest/watchers.html") the documentation].

    div(v-if="type == 'top_apps'")
      aw-summary(:fields="activityStore.window.top_apps",
                 :namefunc="e => e.data.app",
                 :colorfunc="e => e.data.app",
                 with_limit)
    div(v-if="type == 'top_titles' && !activityStore.android.available")
      aw-summary(:fields="activityStore.window.top_titles",
                 :namefunc="e => e.data.title",
                 :colorfunc="e => e.data['$category']",
                 with_limit)
    // The same rows answer two questions: an iOS bundle id, and -- since 4.4h -- the
    // Android Activity class, which is the only per-screen detail Android has.
    div(v-if="type == 'top_bundle_ids' && hasScreens")
      aw-summary(:fields="activityStore.window.top_titles",
                 :namefunc="top_screen_namefunc",
                 :hoverfunc="top_screen_hoverfunc",
                 :colorfunc="e => e.data.app",
                 with_limit)
    div(v-if="type == 'top_domains'")
      aw-summary(:fields="activityStore.browser.top_domains",
                 :namefunc="e => e.data.$domain",
                 :colorfunc="e => e.data.$domain",
                 with_limit)
    div(v-if="type == 'top_urls'")
      aw-summary(:fields="activityStore.browser.top_urls",
                 :namefunc="e => e.data.url",
                 :colorfunc="e => e.data.$domain",
                 with_limit)
    div(v-if="type == 'top_browser_titles'")
      aw-summary(:fields="activityStore.browser.top_titles",
                 :namefunc="e => e.data.title",
                 :colorfunc="e => e.data.$domain",
                 with_limit)
    div(v-if="type == 'top_editor_files'")
      aw-summary(:fields="activityStore.editor.top_files",
                 :namefunc="top_editor_files_namefunc",
                 :hoverfunc="top_editor_files_hoverfunc",
                 :colorfunc="e => e.data.language",
                 with_limit)
    div(v-if="type == 'top_editor_languages'")
      aw-summary(:fields="activityStore.editor.top_languages",
                 :namefunc="e => e.data.language",
                 :colorfunc="e => e.data.language",
                 with_limit)
    div(v-if="type == 'top_editor_projects'")
      aw-summary(:fields="activityStore.editor.top_projects",
                 :namefunc="top_editor_projects_namefunc",
                 :hoverfunc="top_editor_projects_hoverfunc",
                 :colorfunc="e => e.data.language",
                 with_limit)
    div(v-if="type == 'top_categories'")
      aw-summary(:fields="activityStore.category.top",
                 :namefunc="e => e.data['$category'].join(' > ')",
                 :colorfunc="e => e.data['$category']",
                 :linkfunc="e => '#' + $route.path + '?category=' + encodeURIComponent(e.data['$category'].join('>'))",
                 with_limit)
    div(v-if="type == 'category_tree'")
      aw-categorytree(:events="activityStore.category.top")
    div(v-if="type == 'category_sunburst'")
      aw-sunburst-categories(:data="top_categories_hierarchy", style="height: 20em")
    div(v-if="type == 'timeline_barchart'")
      aw-timeline-barchart(:datasets="datasets", :timeperiod_start="activityStore.query_options.timeperiod.start", :timeperiod_length="activityStore.query_options.timeperiod.length", style="height: 100")
    div(v-if="type == 'sunburst_clock'")
      aw-sunburst-clock(:date="date", :afkBucketId="activityStore.buckets.afk[0]", :windowBucketId="activityStore.buckets.window[0]")
    div(v-if="type == 'custom_vis'")
      aw-custom-vis(:visname="props.visname" :title="props.title")
    div(v-if="type == 'vis_timeline' && isSingleDay")
      vis-timeline(:buckets="timeline_buckets", :showRowLabels='true', :queriedInterval="timeline_daterange")
    div(v-if="type == 'score'")
      aw-score()
    div(v-if="type == 'top_stopwatches'")
      aw-summary(:fields="activityStore.stopwatch.top_stopwatches",
                 :namefunc="e => e.data.label",
                 :colorfunc="e => e.data.label",
                 with_limit)
    div(v-if="type == 'top_bucket_data'")
      aw-top-bucket-data(
        :initialBucketId="props ? props.bucketId : ''",
        :initialField="props ? props.field : ''",
        :initialCustomField="props ? props.customField : ''",
        @update-props="onWatcherPropsChange"
      )
</template>

<style lang="scss">
.vis-style-dropdown-btn {
  position: absolute;
  top: 0.8em;
  right: 0.8em;

  .btn {
    border: 0;
  }
}
</style>

<script lang="ts">
import _ from 'lodash';
import 'vue-awesome/icons/cog';
import 'vue-awesome/icons/times';
import 'vue-awesome/icons/bars';

import { buildBarchartDataset } from '~/util/datasets';
import { screenRowName } from '~/util/screenNames';
import { COMBINED_UNAVAILABLE_TYPES } from '~/util/combinedActivity';

// TODO: Move this somewhere else
import { build_category_hierarchy } from '~/util/classes';

import { useActivityStore } from '~/stores/activity';
import { useCategoryStore } from '~/stores/categories';
import { useBucketsStore } from '~/stores/buckets';
import { useViewsStore } from '~/stores/views';
import { useSettingsStore } from '~/stores/settings';

import moment from 'moment';

function pick_subname_as_name(c) {
  c.name = c.subname;
  c.children = c.children.map(pick_subname_as_name);
  return c;
}

export default {
  name: 'aw-selectable-vis',
  props: {
    id: Number,
    type: String,
    props: Object,
    viewId: { type: String, default: '' },
    editable: { type: Boolean, default: true },
  },
  data: function () {
    return {
      activityStore: useActivityStore(),
      categoryStore: useCategoryStore(),
      settingsStore: useSettingsStore(),

      types: [
        'top_apps',
        'top_titles',
        'top_bundle_ids',
        'top_domains',
        'top_urls',
        'top_browser_titles',
        'top_categories',
        'category_tree',
        'category_sunburst',
        'top_editor_files',
        'top_editor_languages',
        'top_editor_projects',
        'timeline_barchart',
        'sunburst_clock',
        'custom_vis',
        'vis_timeline',
        'score',
        'top_stopwatches',
        'top_bucket_data',
      ],
      // An iOS bundle id is already readable and is what the owner would search for;
      // an Android class path is not, and is cleaned. The raw value stays on the hover.
      top_screen_namefunc: e =>
        this.activityStore.ios.available
          ? e.data.classname
          : screenRowName(e.data.classname, e.data.app),
      top_screen_hoverfunc: e => [e.data.app, e.data.classname].filter(Boolean).join('\n'),
      // TODO: Move this function somewhere else
      top_editor_files_namefunc: e => {
        let f = e.data.file || '';
        f = f.split('/');
        f = f[f.length - 1];
        return f;
      },
      top_editor_files_hoverfunc: e => {
        return 'file: ' + e.data.file + '\n' + 'project: ' + e.data.project;
      },
      // TODO: Move this function somewhere else
      top_editor_projects_namefunc: e => {
        let f = e.data.project || '';
        f = f.split('/');
        f = f[f.length - 1];
        return f;
      },
      top_editor_projects_hoverfunc: e => e.data.project,
      timeline_buckets: null,
    };
  },
  computed: {
    visualizations: function () {
      return {
        top_apps: {
          title: 'Top Applications',
          available: this.activityStore.window.available || this.activityStore.android.available,
        },
        top_titles: {
          title: 'Top Window Titles',
          available: this.activityStore.window.available && this.combinedAllows('top_titles'),
        },
        top_bundle_ids: {
          // Named for what it is on the platform being looked at. On Android it is the
          // Activity class -- the screen inside an app -- and calling that a "bundle id"
          // or a "window title" would both be wrong.
          title: this.activityStore.ios.available ? 'Bundle IDs' : 'Top Screens',
          available: this.hasScreens,
        },
        top_domains: {
          title: 'Top Browser Domains',
          available: this.activityStore.browser.available,
        },
        top_urls: {
          title: 'Top Browser URLs',
          available: this.activityStore.browser.available,
        },
        top_browser_titles: {
          title: 'Top Browser Titles',
          available: this.activityStore.browser.available,
        },
        top_editor_files: {
          title: 'Top Editor Files',
          available: this.activityStore.editor.available,
        },
        top_editor_languages: {
          title: 'Top Editor Languages',
          available: this.activityStore.editor.available,
        },
        top_editor_projects: {
          title: 'Top Editor Projects',
          available: this.activityStore.editor.available,
        },
        top_categories: {
          title: 'Top Categories',
          available: this.activityStore.category.available,
        },
        category_tree: {
          title: 'Category Tree',
          available: this.activityStore.category.available,
        },
        category_sunburst: {
          title: 'Category Sunburst',
          available: this.activityStore.category.available,
        },
        timeline_barchart: {
          title: 'Timeline (barchart)',
          available: this.combinedAllows('timeline_barchart'),
        },
        sunburst_clock: {
          title: 'Sunburst clock',
          available:
            this.activityStore.window.available &&
            this.activityStore.active.available &&
            this.combinedAllows('sunburst_clock'),
        },
        vis_timeline: {
          title: 'Daily Timeline (Chronological)',
          available: this.combinedAllows('vis_timeline'),
        },
        custom_vis: {
          title: 'Custom Visualization',
          available: true, // TODO: Implement
        },
        score: {
          title: 'Score',
          available: this.activityStore.category.available,
        },
        top_stopwatches: {
          title: 'Top Stopwatch Events',
          available: this.activityStore.stopwatch.available,
        },
        top_bucket_data: {
          title: 'Top Bucket Data',
          available: true,
        },
      };
    },
    has_prerequisites() {
      return this.visualizations[this.type].available;
    },
    supports_period: function () {
      if (this.type == 'sunburst_clock' || this.type == 'vis_timeline') {
        return this.isSingleDay;
      }
      return true;
    },
    top_categories_hierarchy: function () {
      const top_categories = this.activityStore.category.top;
      if (top_categories) {
        const categories = top_categories.map(c => {
          return { name: c.data.$category, size: c.duration };
        });

        return {
          name: 'All',
          children: build_category_hierarchy(categories).map(c => pick_subname_as_name(c)),
        };
      } else {
        return null;
      }
    },
    /**
     * False when this visualization has no answer on the combined day.
     *
     * The list of which ones lives beside the adapter that builds the combined day, so
     * the panel's availability flag and the view-tab filter cannot drift apart.
     */
    /**
     * Whether there are per-screen rows to show at all.
     *
     * Per device, that is a question about the platform: iOS reports a bundle id, Android an
     * Activity class, a desktop neither. On the combined day it is a question about the *day* --
     * the rows arrive only where the device that won a block reported one (roadmap 4.4i) -- so a
     * combined day of desktop activity has no panel rather than an empty one.
     */
    hasScreens() {
      if (this.activityStore.combined.active) return this.activityStore.combined.has_screens;
      return this.activityStore.ios.available || this.activityStore.android.available;
    },
    combinedAllows() {
      return (type: string): boolean =>
        !this.activityStore.combined.active || !COMBINED_UNAVAILABLE_TYPES.has(type);
    },
    datasets: function () {
      // Return empty array if not loaded
      if (!this.activityStore.category.by_period) return [];

      const datasets = buildBarchartDataset(
        this.activityStore.category.by_period,
        this.categoryStore.classes
      );

      // Return dataset if data found, else return null (indicating no data)
      if (datasets.length > 0) return datasets;
      else return null;
    },
    date: function () {
      let date = this.activityStore.query_options.date;
      if (!date) {
        date = this.activityStore.query_options.timeperiod.start;
      }
      return date;
    },
    timeline_daterange: function () {
      if (this.activityStore.query_options === null) return null;

      let date = this.activityStore.query_options.date;
      if (!date) {
        date = this.activityStore.query_options.timeperiod.start;
      }

      return [moment(date), moment(date).add(1, 'day')];
    },
    isSingleDay: function () {
      return _.isEqual(this.activityStore.query_options.timeperiod.length, [1, 'day']);
    },
  },
  watch: {
    timeline_daterange: async function () {
      await this.getTimelineBuckets();
    },
    type: async function (newType) {
      if (newType == 'vis_timeline') await this.getTimelineBuckets();
    },
  },
  mounted: async function () {
    if (this.type == 'vis_timeline') {
      await this.getTimelineBuckets();
    }
  },
  methods: {
    onWatcherPropsChange(newProps) {
      if (!this.viewId) return;
      const mergedProps = { ...(this.props || {}), ...newProps };
      useViewsStore().editView({
        view_id: this.viewId,
        el_id: this.id,
        type: this.type,
        props: mergedProps,
      });
    },
    getTimelineBuckets: async function () {
      if (this.type != 'vis_timeline') return;
      if (!this.timeline_daterange) return;

      await useBucketsStore().ensureLoaded();
      this.timeline_buckets = Object.freeze(
        await useBucketsStore().getBucketsWithEvents({
          start: this.timeline_daterange[0].format(),
          end: this.timeline_daterange[1].format(),
        })
      );
    },
  },
};
</script>
