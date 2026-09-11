<template lang="pug">
div(:class="{'fixed-top-padding': fixedTopMenu}")
  b-navbar.aw-navbar(toggleable="lg" :fixed="fixedTopMenu ? 'top' : null")
    // Brand on mobile
    b-navbar-nav.d-block.d-lg-none
      b-navbar-brand(to="/" style="background-color: transparent;")
        img.aligh-middle(src="/logo.png" style="height: 1.5em;")
        span.ml-2.align-middle(style="font-size: 1em; color: #000;") {{ $t('app.name') }}
        b-badge.ml-2.align-middle(v-if="researchEdition" variant="info" data-testid="research-edition-badge") {{ $t('app.researchEdition') }}

    b-navbar-toggle(target="nav-collapse")

    b-collapse#nav-collapse(is-nav)
      b-navbar-nav
        // Activity now means "across every device" by default -- the owner asked for the
        // combined day to *be* Activity rather than sit beside it as a fifth tab, because
        // the nav had no room for another. The per-device views are still here, one level
        // down, exactly as they were.
        b-nav-item-dropdown
          template(slot="button-content")
            div.d-inline.px-2.px-lg-1
              icon(name="calendar-day")
              | {{ $t('nav.activity') }}
          b-dropdown-item(:to="combinedActivityUrl")
            icon(name="layer-group")
            | {{ $t('nav.allDevices') }}
          b-dropdown-divider(v-if="activityViews && activityViews.length > 0")
          b-dropdown-item(v-if="activityViews === null", disabled)
            span.text-muted {{ $t('nav.loading') }}
            br
          b-dropdown-item(v-for="view in activityViews", :key="view.name", :to="view.pathUrl")
            icon(:name="view.icon")
            | {{ view.name }}

        b-nav-item(to="/timeline" style="font-color: #000;")
          div.px-2.px-lg-1
            icon(name="stream")
            | {{ $t('nav.timeline') }}

        b-nav-item(to="/combined")
          div.px-2.px-lg-1
            icon(name="layer-group")
            | {{ $t('nav.combined') }}

        b-nav-item(to="/stopwatch")
          div.px-2.px-lg-1
            icon(name="stopwatch")
            | {{ $t('nav.stopwatch') }}

      // Brand on large screens (centered)
      // xl, not lg: the brand is absolutely centred, so it collides with the left
      // nav once that has enough items. Adding "Combined" crossed that line at
      // ~1180px, which is an ordinary laptop width.
      b-navbar-nav.abs-center.d-none.d-xl-block
        b-navbar-brand(to="/" style="background-color: transparent;")
          img.ml-0.aligh-middle(src="/logo.png" style="height: 1.5em;")
          span.ml-2.align-middle(style="font-size: 1.0em; color: #000;") {{ $t('app.name') }}
          b-badge.ml-2.align-middle(v-if="researchEdition" variant="info" data-testid="research-edition-badge") {{ $t('app.researchEdition') }}

      b-navbar-nav.ml-auto
        b-nav-item-dropdown
          template(slot="button-content")
            div.d-inline.px-2.px-lg-1
              icon(name="tools")
              | {{ $t('nav.tools') }}
          b-dropdown-item(to="/search")
            icon(name="search")
            | {{ $t('nav.search') }}
          b-dropdown-item(to="/work-report")
            icon(name="briefcase")
            | {{ $t('nav.workReport') }}
          b-dropdown-item(to="/billing")
            icon(name="dollar-sign")
            | Billable Hours
          b-dropdown-item(to="/analysis/activity" v-if="devmode")
            icon(name="robot")
            | {{ $t('nav.aiSummary') }}
          b-dropdown-item(to="/trends" v-if="devmode")
            icon(name="chart-line")
            | {{ $t('nav.trends') }}
          b-dropdown-item(to="/report" v-if="devmode")
            icon(name="chart-pie")
            | {{ $t('nav.report') }}
          b-dropdown-item(to="/alerts" v-if="devmode")
            icon(name="flag-checkered")
            | {{ $t('nav.alerts') }}
          b-dropdown-item(to="/timespiral" v-if="devmode")
            icon(name="history")
            | {{ $t('nav.timespiral') }}
          b-dropdown-item(to="/query")
            icon(name="code")
            | {{ $t('nav.query') }}
          b-dropdown-item(to="/graph" v-if="devmode")
            icon(name="project-diagram")
            | {{ $t('nav.graph') }}

        b-nav-item(to="/buckets")
          div.px-2.px-lg-1
            icon(name="database")
            | {{ $t('nav.rawData') }}
        b-nav-item(to="/sync")
          div.px-2.px-lg-1
            icon(name="sync-alt")
            |  Sync
        b-nav-item(to="/settings")
          div.px-2.px-lg-1
            icon(name="cog")
            | {{ $t('nav.settings') }}
</template>

<style lang="scss" scoped>
.fixed-top-padding {
  padding-bottom: var(--aw-navbar-height);
}
</style>

<script lang="ts">
// only import the icons you use to reduce bundle size
import 'vue-awesome/icons/calendar-day';
import 'vue-awesome/icons/briefcase';
import 'vue-awesome/icons/dollar-sign';
import 'vue-awesome/icons/calendar-week';
import 'vue-awesome/icons/stream';
import 'vue-awesome/icons/database';
import 'vue-awesome/icons/search';
import 'vue-awesome/icons/code';
import 'vue-awesome/icons/chart-line';
import 'vue-awesome/icons/chart-pie';
import 'vue-awesome/icons/flag-checkered';
import 'vue-awesome/icons/stopwatch';
import 'vue-awesome/icons/layer-group';
import 'vue-awesome/icons/robot';
import 'vue-awesome/icons/cog';
import 'vue-awesome/icons/sync-alt';
import 'vue-awesome/icons/tools';
import 'vue-awesome/icons/history';
import 'vue-awesome/icons/project-diagram';
import 'vue-awesome/icons/ellipsis-h';
import 'vue-awesome/icons/mobile';
import 'vue-awesome/icons/desktop';

import { mapState } from 'pinia';
import { useSettingsStore } from '~/stores/settings';
import { useBucketsStore } from '~/stores/buckets';
import { IBucket } from '~/util/interfaces';
import { COMBINED_HOST } from '~/util/combinedActivity';
import { activityViewsFromBuckets } from '~/util/hostnames';

export default {
  name: 'Header',
  data() {
    return {
      activityViews: null,
      // Sticky on every platform: tall pages (the timeline, a long activity
      // view) otherwise scroll the navigation out of reach.
      // See https://github.com/ActivityWatch/aw-webui/issues/299
      fixedTopMenu: true,
      researchEdition: typeof AW_RESEARCH_EDITION !== 'undefined' && AW_RESEARCH_EDITION,
    };
  },
  computed: {
    ...mapState(useSettingsStore, ['devmode']),
    combinedActivityUrl() {
      return `/activity/${COMBINED_HOST}`;
    },
  },
  mounted: async function () {
    const bucketStore = useBucketsStore();
    await bucketStore.ensureLoaded();
    // The rule for which hosts appear lives in a util so it can be tested without
    // mounting the navbar -- see activityViewsFromBuckets for why "has any bucket" was
    // the wrong rule.
    this.activityViews = activityViewsFromBuckets(bucketStore.buckets as IBucket[]);
  },
};
</script>

<style lang="scss" scoped>
@import '../style/globals';

.aw-navbar {
  background-color: white;
  border: solid $lightBorderColor;
  border-width: 0 0 1px 0;
}

.nav-item {
  align-items: center;

  margin-left: 0.2em;
  margin-right: 0.2em;
  border-radius: 0.5em;

  &:hover {
    background-color: #ddd;
  }
}

.abs-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
</style>

<style lang="scss">
.nav-item {
  .nav-link {
    color: #555 !important;
  }
}
</style>
