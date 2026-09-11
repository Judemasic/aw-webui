<template lang="pug">
div
  h3.mb-3 {{ $t('settings.title') }}

  div.settings-layout
    nav.settings-nav
      b-nav(pills vertical)
        b-nav-item(
          v-for="group in groups"
          :key="group.id"
          :active="activeGroup === group.id"
          :to="`/settings/${group.id}`"
          link-classes="settings-nav__link"
          replace
        ) {{ group.label }}

    div.settings-content
      template(v-for="group in groups")
        section.settings-section(v-show="activeGroup === group.id" :key="group.id")
          h4.settings-section__title {{ group.label }}
          p.text-muted.small.mb-3(v-if="group.help") {{ group.help }}
          component(
            v-for="comp in group.components"
            :key="comp.name"
            :is="comp.name"
            v-bind="comp.props || {}")
</template>

<script lang="ts">
import { useSettingsStore } from '~/stores/settings';
import { useCategoryStore } from '~/stores/categories';

import LanguageSettings from '~/views/settings/LanguageSettings.vue';
import DaystartSettings from '~/views/settings/DaystartSettings.vue';
import TimelineDurationSettings from '~/views/settings/TimelineDurationSettings.vue';
import ReleaseNotificationSettings from '~/views/settings/ReleaseNotificationSettings.vue';
import UncategorizedHintSettings from '~/views/settings/UncategorizedHintSettings.vue';
import CategorizationSettings from '~/views/settings/CategorizationSettings.vue';
import LandingPageSettings from '~/views/settings/LandingPageSettings.vue';
import DeveloperSettings from '~/views/settings/DeveloperSettings.vue';
import Theme from '~/views/settings/Theme.vue';
import ColorSettings from '~/views/settings/ColorSettings.vue';
import ActivePatternSettings from '~/views/settings/ActivePatternSettings.vue';
import PrivacyFilterSettings from '~/views/settings/PrivacyFilterSettings.vue';
import AwNotifySettings from '~/views/settings/AwNotifySettings.vue';
import DeviceSettings from './DeviceSettings.vue';
import Sync from '~/views/Sync.vue';

interface Group {
  id: string;
  label: string;
  help?: string;
  components: { name: string; props?: Record<string, unknown> }[];
}

/**
 * Roadmap 4.1b-i. True only inside the Android app's WebView, where WebUIFragment
 * installs the bridge. Checked at runtime rather than through VUE_APP_ON_ANDROID:
 * the flag says how the bundle was built, not whether an app is on the other side.
 */
function hasNativeBridge(): boolean {
  const bridge = (window as any).Android;
  return !!(bridge && typeof bridge.openNativeSettings === 'function');
}

export default {
  name: 'Settings',
  components: {
    LanguageSettings,
    DaystartSettings,
    TimelineDurationSettings,
    ReleaseNotificationSettings,
    UncategorizedHintSettings,
    CategorizationSettings,
    LandingPageSettings,
    Theme,
    ColorSettings,
    DeveloperSettings,
    ActivePatternSettings,
    PrivacyFilterSettings,
    AwNotifySettings,
    DeviceSettings,
    Sync,
  },
  beforeRouteLeave(to, from, next) {
    const categoryStore = useCategoryStore();
    if (categoryStore.classes_unsaved_changes) {
      if (confirm(this.$t('settings.unsavedCategoriesLeave'))) {
        next();
      } else {
        next(false);
      }
    } else {
      next();
    }
  },
  props: {
    group: { type: String, default: '' },
  },
  computed: {
    activeGroup(): string {
      const requested = this.group || 'general';
      return this.groups.some(g => g.id === requested) ? requested : 'general';
    },
    groups(): Group[] {
      const general: Group = {
        id: 'general',
        label: this.$t('settings.groups.general'),
        help: this.$t('settings.groups.generalHelp'),
        components: [
          { name: 'LanguageSettings' },
          { name: 'DaystartSettings' },
          { name: 'TimelineDurationSettings' },
          { name: 'LandingPageSettings' },
          { name: 'UncategorizedHintSettings' },
          ...(this.$isAndroid ? [] : [{ name: 'ReleaseNotificationSettings' }]),
        ],
      };
      const appearance: Group = {
        id: 'appearance',
        label: this.$t('settings.groups.appearance'),
        help: this.$t('settings.groups.appearanceHelp'),
        components: [{ name: 'Theme' }, { name: 'ColorSettings' }],
      };
      const categorization: Group = {
        id: 'categorization',
        label: this.$t('settings.groups.categorization'),
        help: this.$t('settings.groups.categorizationHelp'),
        components: [{ name: 'CategorizationSettings' }, { name: 'ActivePatternSettings' }],
      };
      // Sync belongs here as well as at /sync. Somebody who has just installed the exe and
      // wants their phone's categories goes to Settings and looks for it; a top-level nav item
      // alone assumes they already know it exists.
      const sync: Group = {
        id: 'sync',
        label: 'Sync',
        help: "Share this computer's activity, categories and rules with your other devices.",
        components: [{ name: 'Sync', props: { embedded: true } }],
      };
      const privacy: Group = {
        id: 'privacy',
        label: this.$t('settings.groups.privacy'),
        help: this.$t('settings.groups.privacyHelp'),
        components: [{ name: 'PrivacyFilterSettings' }],
      };
      const developer: Group = {
        id: 'developer',
        label: this.$t('settings.groups.developer'),
        components: [{ name: 'DeveloperSettings' }],
      };

      const notifications: Group = {
        id: 'notifications',
        label: 'Notifications',
        help: 'Configure shared aw-notify alert thresholds for Android and desktop.',
        components: [{ name: 'AwNotifySettings' }],
      };

      // Roadmap 4.1b-i. Only where there is an app on the other side of the WebView
      // bridge: on a desktop aw-server serving the same bundle there is no device to
      // settle, and an empty group in the sidebar is worse than no group.
      const device: Group = {
        id: 'device',
        label: 'This device',
        help: 'Settings that belong to the Android app rather than to the server.',
        components: [{ name: 'DeviceSettings' }],
      };

      // Not on Android: the app has its own sync screen, and its folder is chosen with a file
      // picker rather than typed. Two sync screens on one device would be two owners.
      const groups = [
        general,
        appearance,
        categorization,
        ...(this.$isAndroid ? [] : [sync]),
        notifications,
        privacy,
        developer,
      ];
      if (hasNativeBridge()) groups.splice(1, 0, device);
      return groups;
    },
  },
  async created() {
    await this.init();
  },
  methods: {
    async init() {
      const settingsStore = useSettingsStore();
      return settingsStore.load();
    },
  },
};
</script>

<style scoped lang="scss">
.settings-layout {
  display: grid;
  grid-template-columns: minmax(180px, 220px) 1fr;
  gap: 2rem;
  margin-top: 0.5rem;
}

.settings-nav {
  position: sticky;
  // Clear the fixed navbar, which overlaps the top of the viewport
  top: calc(var(--aw-navbar-height) + 1rem);
  align-self: start;
}

::v-deep .settings-nav .nav-link {
  color: #495057;
  border-radius: 0.25rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.125rem;
}

::v-deep .settings-nav .nav-link:hover {
  background-color: #f0f1f3;
}

::v-deep .settings-nav .nav-link.active,
::v-deep .settings-nav .nav-link.active:hover {
  background-color: #495057 !important;
  color: #fff !important;
}

.settings-content {
  min-width: 0;
}

.settings-section {
  padding-bottom: 1rem;
}

.settings-section__title {
  margin-bottom: 0.25rem;
}

.settings-section ::v-deep > * + * {
  margin-top: 1.25rem;
}

.settings-section ::v-deep .form-group,
.settings-section ::v-deep .b-form-group {
  margin-bottom: 0;
}

.settings-section ::v-deep hr {
  margin: 1.5rem 0;
}

@media (max-width: 767.98px) {
  .settings-layout {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .settings-nav {
    position: static;
    min-width: 0;
    max-width: 100%;
  }

  ::v-deep .settings-nav .nav {
    flex-direction: row !important;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  ::v-deep .settings-nav .nav-link {
    white-space: nowrap;
    padding: 0.375rem 0.625rem;
  }
}
</style>
