<template lang="pug">
// We want to use another colorscheme than the default 'schemeAccent',
// unfortunately it seems like the color-scheme prop is broken.
// See this issue: https://github.com/David-Desmaisons/Vue.D3.sunburst/issues/11
sunburst.aw-sunburst-categories(:data="data", :colorScale="colorfunc", :getCategoryForColor="categoryForColor", :colorScheme="null" :showLabels="true")
  // Add behaviors
  template(slot-scope="{ on, actions }")
    highlightOnHover(v-bind="{ on, actions }")
    //- Deliberately not the library's `zoomOnClick`: it zooms on the very first tap, which on a
    //- phone means you can never just *look* at a slice. See `onClickNode`.
    tapBehavior(v-bind="{ on, actions }" :handler="onClickNode")

  // Add information to be displayed on top of the graph
  div(slot="top", slot-scope="{ nodes, actions }")
    //nodeInfoDisplayer(:current="nodes.mouseOver" :root="nodes.root" description="time spent" :show-all-number="false")
    //- Rendered as a v-for over nought-or-one node so the node is resolved once, and so the
    //- panel does not exist at all when nothing is picked -- an empty backing panel sitting in
    //- the middle of the chart would look like a bug.
    template(v-for="node in infoNodes(nodes)")
      div.info(:key="node.id")
        div.parent(v-if="node.data.parent && node.data.parent.length") {{ node.data.parent.join(" > ") }}
        div.name {{ node.data.name }}
        div.duration {{ node.value | friendlyduration }}
        //- Two shares, because they answer different questions: a category can be a small part
        //- of the day and most of what it sits inside.
        div.percent {{ $t('activity.sunburst.ofAll', { pct: share(node, nodes.root) }) }}
        div.percent(v-if="hasParent(node, nodes)")
          | {{ $t('activity.sunburst.ofParent', { pct: share(node, node.parent), name: node.parent.data.name }) }}
    //- The way back out. Tapping a slice highlights it and tapping again zooms in, and until
    //- this button existed there was no way to undo either: on a phone there is no hover, no
    //- breadcrumb trail is rendered, and the centre circle does not take a tap -- so the chart
    //- stayed zoomed until the whole view was torn down by switching tabs and back.
    div.zoomed-out(v-if="canGoBack(nodes)")
      b-btn(size="sm" variant="outline-secondary" @click="backToAll(nodes, actions)")
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

/**
 * Renderless behavior that hands every arc tap to the parent instead of zooming straight away.
 * Shaped like the library's own `zoomOnClick` so it drops into the same slot.
 */
const tapBehavior = {
  name: 'tapBehavior',
  props: {
    on: { required: true, type: Function },
    actions: { required: true, type: Object },
    handler: { required: true, type: Function },
  },
  render: () => null,
  created() {
    this.on('clickNode', ({ node }) => this.handler(node, this.actions));
  },
};

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
    tapBehavior,
    zoomOnClick,
  },
  props: {
    data: {
      type: Object,
      default: () => example_data,
    },
  },
  data() {
    return {
      // The slice the last tap picked out, if that tap has not been followed by a second one.
      // Held here rather than inside the behavior so the "back to all" button can see it: a
      // highlight is something to undo even when nothing has been zoomed.
      picked: null,
    };
  },
  methods: {
    /**
     * One tap picks a slice out; a second tap on the same slice zooms into it.
     *
     * The library zooms on the first tap, which is fine with a mouse -- the slice has already
     * highlighted under the pointer before you decide to click. On a phone there is no hover,
     * so the first touch is both the looking and the committing, and the chart jumps before
     * anything has been read.
     */
    onClickNode(node, actions) {
      if (this.picked === node) {
        this.picked = null;
        actions.zoomToNode(node);
        // A zoom is a fresh view; carrying the dimming into it would leave everything the zoom
        // just made room for greyed out.
        actions.resetHighlight();
      } else {
        this.picked = node;
        actions.highlightPath(node);
      }
    },
    /** Whether there is anything to undo: a zoom, a highlight, or both. */
    canGoBack(nodes): boolean {
      return this.picked !== null || this.isZoomed(nodes);
    },
    /** Whether a tap has zoomed the chart into some category below the root. */
    isZoomed(nodes): boolean {
      return !!(nodes && nodes.zoomed && nodes.root && nodes.zoomed !== nodes.root);
    },
    backToAll(nodes, actions) {
      if (!actions) return;
      // Every half, because any of them can be the thing that wants undoing -- and each has
      // survived this button at some point, which made it look like the button had not worked.
      this.picked = null;
      actions.resetHighlight();
      if (nodes) {
        // The library keeps `mouseOver` set until the pointer leaves the chart, and on a
        // touchscreen the pointer never leaves -- so the centre readout stayed up after the
        // highlight behind it had gone. Clearing it here is the only way back to the default:
        // the behaviours expose no action for it.
        nodes.mouseOver = null;
        nodes.clicked = null;
      }
      if (nodes && nodes.root && this.isZoomed(nodes)) actions.zoomToNode(nodes.root);
    },
    /** Whether this node sits inside a real category rather than directly under the root. */
    hasParent(node, nodes): boolean {
      return !!(node && node.parent && nodes && node.parent !== nodes.root);
    },
    /** This node's share of some ancestor, as a whole-number percentage. */
    share(node, of): number {
      if (!of || !of.value) return 0;
      return Math.round((100 * node.value) / of.value);
    },
    /**
     * Nought or one node for the centre panel: whatever is under the pointer, else whatever the
     * last tap picked out. The fallback is what makes the panel useful on a phone, where there
     * is nothing "under the pointer" once the finger has gone.
     */
    infoNodes(nodes) {
      if (!nodes || !nodes.root) return [];
      const node = nodes.mouseOver || this.picked;
      if (!node || !node.data) return [];
      return [node];
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
  //
  // It also has a backing panel now. It used to be bare text drawn straight over the arcs,
  // which reads over the pale ones and disappears into the dark ones -- and it sits in the
  // middle of the chart, so it was landing on a different colour every time.
  width: max-content;
  max-width: min(90%, 300px);
  padding: 6px 10px;
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 10;
  pointer-events: none;
  text-align: center;
  transform: translate(-50%, -50%);
  overflow: hidden;

  background: rgba(255, 255, 255, 0.92);
  color: #212529;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
  line-height: 1.3;

  .name {
    font-size: 1.25em;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .parent {
    font-size: 0.8em;
    opacity: 0.75;
  }

  .percent {
    font-size: 0.85em;
    opacity: 0.75;
  }
}

.zoomed-out {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;

  // An outline button is transparent, and this one sits over the widest ring of the chart,
  // where the arc labels are -- so a label showed straight through the words on it. It gets
  // its own opaque ground, like the centre readout.
  background: rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
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

    // Highlighting dims the *arcs* by setting `fill-opacity` on each group, and that value is
    // inherited by the label inside it. `fill-opacity` fades a fill and leaves a stroke alone,
    // so a dimmed label kept its full-strength black halo while the white letters faded out
    // from under it -- the "weird dark bolded look". Pinning both here keeps every label at
    // full strength and leaves the arcs alone to carry the dimming.
    fill-opacity: 1;
    stroke-opacity: 1;
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
