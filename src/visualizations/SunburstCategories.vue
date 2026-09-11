<template lang="pug">
// We want to use another colorscheme than the default 'schemeAccent',
// unfortunately it seems like the color-scheme prop is broken.
// See this issue: https://github.com/David-Desmaisons/Vue.D3.sunburst/issues/11
sunburst.aw-sunburst-categories(:data="data", :colorScale="colorfunc", :getCategoryForColor="categoryForColor", :colorScheme="null" :showLabels="true")
  // Add behaviors
  template(slot-scope="{ on, actions }")
    highlightOnHover(v-bind="{ on, actions }")
    zoomOnClick(v-bind="{ on, actions }")

  // Add information to be displayed on top of the graph
  div(slot="top", slot-scope="{ nodes, actions }")
    //nodeInfoDisplayer(:current="nodes.mouseOver" :root="nodes.root" description="time spent" :show-all-number="false")
    div.info
      div(v-if="nodes.mouseOver !== null && nodes.mouseOver")
        div.parent {{ nodes.mouseOver.data.parent ? nodes.mouseOver.data.parent.join(" > ") : " " }}
        div.name {{ nodes.mouseOver.data.name }}
        div {{ nodes.mouseOver.value | friendlyduration }}
        div ({{ Math.round(100 * nodes.mouseOver.value / nodes.root.value) }}%)
    //- The way back out. Tapping a slice zooms into it, and until this button existed there
    //- was no way to undo that: on a phone there is no hover, no breadcrumb trail is
    //- rendered, and the centre circle does not take a tap -- so the chart stayed zoomed
    //- until the whole view was torn down by switching tabs and back.
    div.zoomed-out(v-if="isZoomed(nodes)")
      b-btn(size="sm" variant="outline-secondary" @click="zoomOut(nodes, actions)")
        | ↩ {{ $t('activity.sunburst.backToAll') }}

  // Add legend
  //breadcrumbTrail(slot="legend" slot-scope="{ nodes, colorGetter, width }" :current="nodes.mouseOver" :root="nodes.root" :colorGetter="colorGetter" :from="nodes.clicked" :width="width" :item-width="100" :order="0")
</template>

<script lang="ts">
import {
  breadcrumbTrail,
  highlightOnHover,
  nodeInfoDisplayer,
  sunburst,
  zoomOnClick,
} from 'vue-d3-sunburst';
import 'vue-d3-sunburst/dist/vue-d3-sunburst.css';
import { getColorFromCategory } from '~/util/color';

import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';

const example_data = {
  name: 'flare',
  children: [
    {
      name: 'analytics',
      children: [
        {
          name: 'cluster',
          children: [
            { name: 'AgglomerativeCluster', size: 3938 },
            { name: 'CommunityStructure', size: 3812 },
            { name: 'HierarchicalCluster', size: 6714 },
            { name: 'MergeEdge', size: 743 },
          ],
        },
        {
          name: 'optimization',
          children: [{ name: 'AspectRatioBanker', size: 7074 }],
        },
      ],
    },
  ],
};

const SEP = '>';

export default {
  components: {
    breadcrumbTrail,
    highlightOnHover,
    nodeInfoDisplayer,
    sunburst,
    zoomOnClick,
  },
  props: {
    data: {
      type: Object,
      default: () => example_data,
    },
  },
  methods: {
    /** Whether a tap has zoomed the chart into some category below the root. */
    isZoomed(nodes): boolean {
      return !!(nodes && nodes.zoomed && nodes.root && nodes.zoomed !== nodes.root);
    },
    zoomOut(nodes, actions) {
      if (nodes && nodes.root && actions) actions.zoomToNode(nodes.root);
    },
    categoryForColor: function (d) {
      const category = d.parent ? d.parent.concat([d.name]) : [d.name];
      return category.join(SEP);
    },
    colorfunc: function (s) {
      // 'All' needs to be bright if light theme, and dark if dark theme
      const settings = useSettingsStore();
      if (s == 'All') return settings.theme == 'light' ? '#fff' : '#333';

      const categoryStore = useCategoryStore();
      const cat = categoryStore.get_category(s.split(SEP));
      const color = getColorFromCategory(cat, categoryStore.classes);
      return color;
    },
  },
};
</script>

<style lang="scss" scoped>
.info {
  // Not a fixed 300px any more: on a phone the chart is narrower than the box was, so a
  // long category name ran off both sides of it.
  width: 100%;
  max-width: 300px;
  height: 100px;
  padding: 8px;
  position: absolute;
  top: 50%;
  left: 50%;
  z-level: 10;
  pointer-events: none;
  text-align: center;
  transform: translate(-50%, -70%);
  margin-left: 0;
  margin-top: 0;
  overflow: hidden;

  .name {
    font-size: 1.25em;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .parent {
    font-size: 0.8em;
    opacity: 0.75;
  }
}

.zoomed-out {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
}
</style>

<style lang="scss">
// Deliberately **not** scoped: these arcs and labels are drawn by the library inside its own
// component, so a scoped rule never reaches them.
//
// The library ships `font-size: 8px` for every label and paints it in the default fill. Eight
// pixels is below what most people can read at all, and a single flat colour is unreadable
// over arcs that range from pale yellow to dark blue -- which is what "the text is somewhat
// unreadable" was about. White with a dark halo reads on every arc colour in both themes, and
// `paint-order` is what keeps the halo behind the glyph instead of eating into it.
.aw-sunburst-categories {
  svg text.node-info {
    font-size: 11px;
    font-weight: 600;
    fill: #fff;
    stroke: rgba(0, 0, 0, 0.7);
    stroke-width: 2.75px;
    paint-order: stroke fill;
  }

  svg .slice-4 text.node-info {
    font-size: 10px;
  }
  svg .slice-3 text.node-info {
    font-size: 11px;
  }
  svg .slice-2 text.node-info {
    font-size: 12px;
  }
  svg .slice-1 text.node-info {
    font-size: 13px;
  }
}
</style>
