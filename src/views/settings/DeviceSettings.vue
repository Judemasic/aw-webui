<template lang="pug">
div
  div(v-if="!available")
    p.text-muted.small.mb-0
      | These settings belong to the Android app. Open ActivityWatch on your phone or
      | tablet to reach them.

  div(v-else)
    div.ds-row(v-for="s in screens" :key="s.id")
      div.flex-grow-1
        div.ds-title {{ s.title }}
        div.ds-help.text-muted.small {{ s.help }}
      b-button.ds-open(variant="outline-primary" @click="open(s.id)") Open

    p.text-muted.small.mt-3.mb-0
      | These open the app's own screens. Use the system back gesture to come back here.
</template>

<script lang="ts">
// Roadmap 4.1b-i — a home in the web UI for the two Android-only settings screens.
//
// They used to live only in the native navigation drawer, which is reached by the
// hamburger in the native action bar. 4.1b hides that bar on a phone — the app was
// showing two top bars stacked, and the aw-webui navbar is the one that survives —
// so without this the screens would exist with no entrance at all. That is not a
// theoretical worry: R30 records the last time these were unreachable on a stock
// device, and it took a device test to notice.
//
// Gated on the bridge actually being there rather than on VUE_APP_ON_ANDROID: the
// same bundle is served from a desktop aw-server, and a build flag says how the
// bundle was compiled, not whether there is an app on the other side of it.
import Vue from 'vue';

interface NativeScreen {
  id: string;
  title: string;
  help: string;
}

export default Vue.extend({
  name: 'DeviceSettings',
  data() {
    return {
      screens: [
        {
          id: 'sync',
          title: 'Sync Settings',
          help: 'The shared folder, how often this device syncs, and a button to sync now.',
        },
        {
          id: 'auth',
          title: 'API Authentication',
          help: "This device's API key, for reaching its server from elsewhere.",
        },
        {
          id: 'browser',
          title: 'Open in browser',
          help: 'Opens this dashboard in your browser, already signed in.',
        },
      ] as NativeScreen[],
    };
  },
  computed: {
    available(): boolean {
      const bridge = (window as any).Android;
      return !!(bridge && typeof bridge.openNativeSettings === 'function');
    },
  },
  methods: {
    open(id: string) {
      const bridge = (window as any).Android;
      if (bridge && typeof bridge.openNativeSettings === 'function') {
        bridge.openNativeSettings(id);
      }
    },
  },
});
</script>

<style scoped lang="scss">
.ds-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);

  &:last-of-type {
    border-bottom: 0;
  }
}
.ds-title {
  font-size: 14px;
  font-weight: 600;
}
.ds-help {
  line-height: 1.3;
}
// A phone reaches these by thumb, and they are the entrance to the sync settings --
// the one screen it is genuinely bad to miss.
.ds-open {
  flex: 0 0 auto;
  min-height: 44px;
  min-width: 84px;
}
</style>
