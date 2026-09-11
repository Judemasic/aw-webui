<template lang="pug">
div
  //- Hidden when this is a panel inside Settings, which draws its own heading. The page and the
  //- panel are the same component on purpose: two copies of a setup screen is two screens to keep
  //- in step, and the one that fell behind would be the one somebody followed.
  h2(v-if="!embedded") Sync

  p.text-muted.mb-4
    | Sync puts this computer's activity and your phones' activity in one place, so a day can
    | be read across all of them. Nothing is uploaded anywhere: the devices share a folder, and
    | a program you choose keeps that folder in step.

  b-alert(v-if="error" show variant="danger") {{ error }}

  b-alert(v-if="status && !status.can_sync" show variant="warning")
    b aw-sync is not installed next to this server.
    div.small This build cannot sync on its own. Reinstall ActivityWatch to get the whole suite.

  //- ---------------------------------------------------------------- switch + last run
  b-card.mb-3(v-if="status")
    div.d-flex.flex-wrap.align-items-center
      div.mr-auto
        h5.mb-1
          span(v-if="status.enabled") Sync is on
          span(v-else) Sync is off
        div.small.text-muted(v-if="status.enabled")
          | This device syncs every 15 minutes, and whenever you press Sync now.
        div.small.text-muted(v-else)
          | Nothing is being shared or read. Turn it on once the folder below is set up.
      div.mt-2.mt-sm-0
        b-btn(
          :variant="status.enabled ? 'outline-secondary' : 'success'"
          :disabled="busy || !status.can_sync"
          @click="setEnabled(!status.enabled)")
          | {{ status.enabled ? 'Turn sync off' : 'Turn sync on' }}
        b-btn.ml-2(
          variant="primary"
          :disabled="busy || syncing || !status.can_sync"
          @click="syncNow")
          b-spinner.mr-1(v-if="syncing" small)
          | {{ syncing ? 'Syncing…' : 'Sync now' }}

    div.mt-3(v-if="syncing")
      b-alert.mb-0.py-2(show variant="info")
        b-spinner.mr-2(small)
        span.small
          | Syncing. This can take a minute the first time, while every device's events are read.

    div.mt-3(v-else-if="status.last_run")
      b-alert.mb-0.py-2(show :variant="status.last_run.ok ? 'success' : 'danger'")
        div
          b {{ status.last_run.ok ? 'Last sync succeeded' : 'Last sync failed' }}
          span.small.ml-2.text-nowrap {{ friendlyTime(status.last_run.at) }}
        div.small {{ status.last_run.message }}

  //- ---------------------------------------------------------------- step 1: the folder
  b-card.mb-3(v-if="status")
    h5 1. The shared folder

    p.small.text-muted.mb-2
      | Every device that syncs writes its own database into this folder and reads the others'.
      | It has to be a folder your sync program can reach — not a hidden application directory.

    b-form(@submit.prevent="saveDir")
      b-input-group
        b-form-input(v-model="dirInput" :disabled="busy" placeholder="Full path to the folder")
        b-input-group-append
          b-btn(type="submit" variant="primary" :disabled="busy || dirInput === status.sync_dir")
            | Save
      div.d-flex.flex-wrap.align-items-center.mt-2
        span.small.mr-auto(:class="status.sync_dir_exists ? 'text-success' : 'text-warning'")
          icon.mr-1(:name="status.sync_dir_exists ? 'check' : 'exclamation-triangle'")
          span(v-if="status.sync_dir_exists") The folder exists.
          span(v-else) This folder does not exist yet — saving will create it.
        b-btn.small(
          v-if="status.sync_dir !== status.default_sync_dir"
          size="sm" variant="link"
          @click="dirInput = status.default_sync_dir")
          | Use the default

    b-alert.small.mt-3.mb-0(show variant="warning" v-if="status.enabled")
      b Careful changing this while sync is on.
      |  If your sync program is already watching the old folder, moving to a new one leaves the
      | other devices writing somewhere this computer no longer reads — and sync will look like it
      | is working from their side while nothing arrives here.

  //- ---------------------------------------------------------------- step 2: syncthing
  b-card.mb-3(v-if="status")
    h5 2. Keep the folder in step

    p.small.text-muted
      | ActivityWatch does not move files between your devices — it only reads and writes this one
      | folder. Something else has to carry it. #[b Syncthing] is free, needs no account, and sends
      | the files directly between your own devices.

    b-btn.mb-3(href="https://syncthing.net/downloads/" target="_blank" variant="outline-primary" size="sm")
      | Download Syncthing
      icon.ml-1(name="external-link-alt")

    b-list-group.small
      b-list-group-item
        b On this computer
        div.mt-1 Add a folder in Syncthing with this path:
        div.mt-1
          code.user-select-all {{ status.sync_dir }}
          b-btn.ml-2(size="sm" variant="outline-secondary" @click="copy(status.sync_dir)") Copy
        div.mt-2
          | Give it the Folder ID #[code.user-select-all activitywatch-sync] — type it yourself
          | rather than keeping the random one, so you can recognise it later. Then share it with
          | your phone and tablet.
      b-list-group-item
        b On each phone or tablet
        div.mt-1
          | Accept the shared folder when Syncthing offers it, and put it somewhere you can browse
          | to — #[code /storage/emulated/0/ActivityWatch-sync] works. Wait for both ends to say
          | #[b Up to Date].
      b-list-group-item
        b Then, in the ActivityWatch app on each device
        div.mt-1
          | #[b Settings ▸ Sync], choose that same folder, turn Sync on, and tap #[b Sync Now].
        div.mt-1.text-muted
          | The folder's name has to match on every device. The path does not — each device keeps
          | it wherever it likes.

  //- ---------------------------------------------------------------- step 3: devices
  b-card(v-if="status")
    div.d-flex.align-items-center.mb-2
      h5.mb-0.mr-auto 3. Devices in the folder
      b-btn(size="sm" variant="outline-secondary" :disabled="busy" @click="load") Refresh

    div(v-if="status.peers.length === 0")
      p.small.text-muted.mb-0(v-if="!status.sync_dir_exists")
        | Nothing to show yet — the folder does not exist.
      p.small.text-muted.mb-0(v-else-if="!status.enabled")
        | Nothing in the folder yet. Turn sync on, or press #[b Sync now], and this computer will
        | put its own database here. Your phones appear once they have synced at least once.
      p.small.text-muted.mb-0(v-else)
        | Nothing in the folder yet. If your phones have synced, check that Syncthing says
        | #[b Up to Date] on both ends.

    b-table.mb-0.small(
      v-else
      :items="peerRows"
      :fields="peerFields"
      responsive
      striped)
      template(#cell(name)="row")
        span {{ row.item.name }}
        b-badge.ml-2(v-if="row.item.is_own" variant="primary") this device
      template(#cell(last_modified)="row")
        span(:class="row.item.stale ? 'text-warning' : ''") {{ row.item.when }}

    p.small.text-muted.mt-2.mb-0(v-if="status.peers.length > 0")
      | "Last wrote" is when that device last put its data in the folder. A device that has not
      | written for days is a device whose sync has stopped — its data is not lost, it just is not
      | arriving.
</template>

<script lang="ts">
import 'vue-awesome/icons/check';
import 'vue-awesome/icons/exclamation-triangle';
import 'vue-awesome/icons/external-link-alt';
import moment from 'moment';
import { getClient } from '~/util/awclient';

export default {
  name: 'Sync',
  props: {
    /** True when rendered as a Settings panel rather than as the /sync page. */
    embedded: { type: Boolean, default: false },
  },
  data() {
    return {
      status: null as any,
      dirInput: '',
      error: null as string | null,
      busy: false,
      /** Set from the server's own `running` flag, so a pass the timer started shows here too. */
      syncing: false,
      pollTimer: null as any,
      peerFields: [
        { key: 'name', label: 'Device' },
        { key: 'last_modified', label: 'Last wrote' },
        { key: 'size', label: 'Size' },
      ],
    };
  },
  computed: {
    peerRows() {
      return (this.status?.peers || []).map((p: any) => {
        const modified = p.last_modified ? moment(p.last_modified) : null;
        return {
          // A hostname is a name a person chose; a uuid is not. Show the name where the device
          // wrote one and fall back to the id, shortened, rather than showing 36 characters of
          // hex in a column somebody has to scan.
          name: p.hostname || p.device_id.slice(0, 8),
          is_own: p.is_own,
          when: modified ? modified.fromNow() : 'unknown',
          // A day is the threshold: the background pass runs every 15 minutes, so anything
          // older than a day has missed roughly a hundred of them.
          stale: modified ? moment().diff(modified, 'hours') > 24 : false,
          size: this.humanSize(p.size_bytes),
        };
      });
    },
  },
  mounted() {
    this.load();
  },
  beforeDestroy() {
    // A timer that outlives the page would keep requesting forever, on a page nobody is looking
    // at -- and in the Settings panel this component is mounted and unmounted as groups change.
    this.stopPolling();
  },
  methods: {
    async load() {
      this.busy = true;
      this.error = null;
      try {
        const res = await getClient().req.get('/0/sync');
        this.apply(res.data);
      } catch (e: any) {
        this.error = this.messageOf(e, 'Could not read the sync settings.');
      } finally {
        this.busy = false;
      }
    },
    async saveDir() {
      await this.post({ dir: this.dirInput }, 'Could not save the folder.');
    },
    async setEnabled(enabled: boolean) {
      await this.post({ enabled }, 'Could not change the sync setting.');
    },
    async post(body: any, fallback: string) {
      this.busy = true;
      this.error = null;
      try {
        const res = await getClient().req.post('/0/sync', body);
        this.apply(res.data);
      } catch (e: any) {
        this.error = this.messageOf(e, fallback);
      } finally {
        this.busy = false;
      }
    },
    /**
     * Start a sync and watch for it to finish.
     *
     * The request only *starts* the pass. Waiting for it was the first design and it deadlocked:
     * aw-sync is a separate process that calls back into the same server, so a handler blocking
     * until it finished was waiting on a request that could not be served until it returned. What
     * that looked like from here was "timeout of 30000ms exceeded".
     */
    async syncNow() {
      this.busy = true;
      this.error = null;
      try {
        const res = await getClient().req.post('/0/sync/run');
        this.apply(res.data);
      } catch (e: any) {
        this.error = this.messageOf(e, 'Could not start a sync.');
      } finally {
        this.busy = false;
      }
    },

    /** Take a status response, and start or stop watching depending on what it says. */
    apply(data: any) {
      this.status = data;
      // Not while the owner is mid-edit: a poll landing between two keystrokes would put the
      // stored path back under their cursor.
      if (!this.busy || this.dirInput === '') this.dirInput = data.sync_dir;
      this.syncing = !!data.running;
      if (data.running) this.startPolling();
      else this.stopPolling();
    },

    startPolling() {
      if (this.pollTimer) return;
      // Two seconds: fast enough that the button stops saying "Syncing…" promptly, slow enough
      // that a pass reading three devices' databases is not also answering a request every tick.
      this.pollTimer = setInterval(async () => {
        try {
          const res = await getClient().req.get('/0/sync');
          this.apply(res.data);
        } catch {
          // A failed poll is not worth a banner: the next one is two seconds away, and the pass
          // it is watching is still running regardless of whether we could ask about it.
        }
      }, 2000);
    },

    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },
    messageOf(e: any, fallback: string): string {
      return e?.response?.data?.message || e?.message || fallback;
    },
    friendlyTime(ts: string): string {
      return moment(ts).fromNow();
    },
    humanSize(bytes: number): string {
      if (!bytes) return '—';
      const units = ['B', 'kB', 'MB', 'GB'];
      let n = bytes;
      let i = 0;
      while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
      }
      return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
    },
    async copy(text: string) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard access is refused in plenty of ordinary situations (an insecure origin, a
        // WebView without permission). The path is on screen and selectable, so failing here
        // costs nothing and an error toast would be noise.
      }
    },
  },
};
</script>

<style scoped lang="scss">
code {
  /* Readable in both themes: Bootstrap's default code colour is a pink tuned for white paper. */
  background-color: rgba(128, 128, 128, 0.15);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
</style>
