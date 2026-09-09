<template lang="pug">
div.rs-backdrop(@click.self="$emit('cancel')")
  div.rs-sheet(role="dialog" aria-modal="true" :aria-label="'Resolve ' + range")
    header.rs-head
      h5.mb-0 What were you doing?
      p.rs-when.mb-0 {{ range }} · {{ formatDuration(segment.seconds / 60) }}

    //- The competing activities, side by side (R9). This is the evidence; the
    //- choices below are the question.
    section.rs-part
      div.rs-p(v-for="(p, i) in participants" :key="i")
        span.rs-sw(:style="{ background: p.color }")
        div.flex-grow-1
          div.rs-p-app {{ p.label }}
          div.rs-p-dev {{ deviceLabel(p.device) }}
        span.rs-p-dur {{ formatDuration(p.minutes) }}

    section.rs-opts
      label.rs-opt(v-for="(p, i) in participants" :key="'p' + i" :class="{ on: pick === 'p' + i }")
        input(type="radio" :value="'p' + i" v-model="pick")
        span.rs-opt-t {{ p.label }}
        span.rs-opt-s {{ deviceLabel(p.device) }}

      label.rs-opt(:class="{ on: pick === 'relabel' }")
        input(type="radio" value="relabel" v-model="pick")
        span.rs-opt-t Something else…
        span.rs-opt-s neither of these is right
      b-form-input.rs-label-in(
        v-if="pick === 'relabel'"
        v-model="customLabel"
        size="sm"
        placeholder="e.g. reading with music on"
        @keydown.enter.native.prevent="onSave"
      )

      label.rs-opt(:class="{ on: pick === 'ignore' }")
        input(type="radio" value="ignore" v-model="pick")
        span.rs-opt-t Neither — I was away
        span.rs-opt-s this time counts as nothing

    //- `concurrent` is not a fifth radio: R6 says exactly one activity counts, so
    //- "I was doing both" is a note about the loser, not a different winner.
    section.rs-both(v-if="hasWinner")
      b-form-checkbox(v-model="both" size="sm")
        | I really was doing both — the other one was deliberate, not noise

    section.rs-scope
      label.rs-scope-label.mb-1 Apply to
      div.d-flex
        label.rs-scope-o(:class="{ on: scope === 'once' }")
          input(type="radio" value="once" v-model="scope")
          span.rs-opt-t Just this
          span.rs-opt-s {{ range }} only
        label.rs-scope-o(:class="{ on: scope === 'always' }")
          input(type="radio" value="always" v-model="scope")
          span.rs-opt-t Always
          //- Short on purpose. The signature can name three or four device/app pairs,
          //- which inside a half-width button wraps to five lines and makes the two
          //- scope choices different heights. It goes in the note below instead,
          //- where it has the full width and only appears once it is relevant.
          span.rs-opt-s whenever these clash

    p.rs-note.mb-2(v-if="scope === 'always'")
      | Whenever #[b {{ clashSummary }}] clash. This becomes a standing rule — it stays
      | listed and can be undone on its own, and a window it resolves is marked as
      | auto-resolved.

    footer.rs-foot
      //- Roadmap 4.1 builds the decision; 4.2 is what writes it to decisions.jsonl.
      //- Saying so beats a Save button that silently does nothing.
      div.rs-pending(v-if="pending")
        b Not written yet.
        |  Roadmap 4.2 persists decisions; this is the record it will append:
        pre.rs-json {{ pendingJson }}
      div.d-flex.justify-content-end
        b-button.mr-2(size="sm" variant="outline-secondary" @click="$emit('cancel')") Cancel
        b-button(size="sm" variant="primary" :disabled="!canSave" @click="onSave") Save
</template>

<script lang="ts">
// Roadmap 4.1 — the resolution sheet. Laid out from `04_COMBINED_TIMELINE.md` §4.2.
//
// In aw-webui rather than as a native Android BottomSheet, for the same reason the
// combined timeline itself moved here in 3.5: it opens from a shaded block in that
// view, and R35 says that view has to work on a PC as well as a tablet and a phone.
// A native sheet would be stranded on Android and written twice.
//
// This step is the sheet only. It builds a complete decision record — the full R14
// signature included, because R15 says today's decisions are tomorrow's rules and a
// signature not captured now cannot be recovered later — and emits it. Writing it to
// `decisions.jsonl` and recomputing the day is 4.2.

import Vue from 'vue';
import { ulid } from '~/util/ulid';

export default Vue.extend({
  name: 'ResolutionSheet',
  props: {
    /** The contended segment being resolved. */
    segment: { type: Object, required: true },
    /** `[{ device, label, minutes, color, isForeground }]`, the competitors. */
    participants: { type: Array as () => any[], required: true },
    /** uuid of this device — the decision's `created_by`. */
    ownDevice: { type: String, default: '' },
    /** uuid → human name, so the sheet never shows a raw uuid (a 3.4 defect). */
    deviceLabel: { type: Function, required: true },
    formatDuration: { type: Function, required: true },
    /** Timestamp → wall clock, for the header range. */
    clock: { type: Function, required: true },
  },
  data() {
    return {
      pick: null as string | null,
      customLabel: '',
      both: false,
      scope: 'once' as 'once' | 'always',
      pending: null as any,
    };
  },
  computed: {
    range(): string {
      return `${this.clock(this.segment.start)} – ${this.clock(this.segment.end)}`;
    },
    /** Index of the chosen participant, or -1 when the pick is relabel/ignore. */
    pickedIndex(): number {
      return this.pick && this.pick.startsWith('p') ? Number(this.pick.slice(1)) : -1;
    },
    hasWinner(): boolean {
      return this.pickedIndex >= 0 || this.pick === 'relabel';
    },
    clashSummary(): string {
      return this.participants.map(p => `${this.deviceLabel(p.device)}: ${p.label}`).join(' and ');
    },
    canSave(): boolean {
      if (!this.pick) return false;
      if (this.pick === 'relabel') return this.customLabel.trim().length > 0;
      return true;
    },
    pendingJson(): string {
      return JSON.stringify(this.pending, null, 2);
    },
  },
  mounted() {
    // Pre-selected to the provisional attribution rather than to nothing. The
    // provisional pick is already what the totals use (R10), so an owner who agrees
    // with it confirms in one tap, and one who does not still sees every option.
    const provisional = this.participants.findIndex((p: any) => p.isForeground);
    if (provisional >= 0) this.pick = `p${provisional}`;
    window.addEventListener('keydown', this.onKeydown, true);
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onKeydown, true);
  },
  methods: {
    onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') this.$emit('cancel');
      // The combined view binds ← / → to its block stepper. While the sheet is open
      // those would move the selection out from under the sheet, so swallow them
      // before they reach the view's own listener.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
    },
    /**
     * The R14 signature: *why* a decision applied, not just what was chosen.
     *
     * `category` is null because `/api/0/combined/timeline` does not surface one yet
     * — the field is written all the same, so a device on a later version that does
     * know the category produces records of the same shape rather than a new one.
     */
    signature(): any {
      return {
        participants: this.participants.map((p: any) => ({
          device_role: this.deviceLabel(p.device),
          device_uuid: p.device,
          app: p.label,
          category: null,
        })),
      };
    },
    resolution(): any {
      if (this.pick === 'ignore') {
        return { outcome: 'ignore', foreground: null, label: null, deliberate_background: [] };
      }
      // Everything the winner did not claim. `concurrent` is this list being
      // non-empty and deliberate; `foreground` is the same record with it empty.
      const losers = this.participants
        .filter((_: any, i: number) => i !== this.pickedIndex)
        .map((p: any) => p.label);
      const deliberate = this.both ? losers : [];
      if (this.pick === 'relabel') {
        return {
          outcome: 'relabel',
          foreground: null,
          label: this.customLabel.trim(),
          deliberate_background: deliberate,
        };
      }
      const w = this.participants[this.pickedIndex];
      return {
        outcome: 'foreground',
        foreground: {
          device_role: this.deviceLabel(w.device),
          device_uuid: w.device,
          app: w.label,
        },
        label: null,
        deliberate_background: deliberate,
      };
    },
    onSave() {
      if (!this.canSave) return;
      const decision = {
        id: ulid('d_'),
        type: 'decision',
        created_at: new Date().toISOString(),
        created_by: this.ownDevice,
        window: { start: this.segment.start, end: this.segment.end },
        signature: this.signature(),
        resolution: this.resolution(),
        scope: this.scope,
      };
      this.pending = decision;
      this.$emit('save', decision);
    },
  },
});
</script>

<style scoped lang="scss">
.rs-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1050;
  display: flex;
  // Bottom-anchored on a phone, which is where a thumb is; the media query below
  // recentres it once there is room, so it is a dialog on a desktop and a sheet on a
  // phone without being two components.
  align-items: flex-end;
  justify-content: center;
}
.rs-sheet {
  width: 100%;
  max-width: 460px;
  max-height: 92vh;
  overflow: auto;
  padding: 14px;
  border-radius: 12px 12px 0 0;
  background: #fff;
  color: inherit;
  box-shadow: 0 -2px 18px rgba(0, 0, 0, 0.3);
}
@media (min-width: 576px) {
  .rs-backdrop {
    align-items: center;
  }
  .rs-sheet {
    border-radius: 12px;
  }
}
// The app's dark mode is a body class, not a media query, but the WebView follows
// the system setting, so cover both rather than leave black text on white in a dark
// app.
@media (prefers-color-scheme: dark) {
  .rs-sheet {
    background: #2b2b2b;
  }
}

.rs-when {
  font-family: monospace;
  font-size: 11.5px;
  opacity: 0.7;
}
.rs-head {
  border-bottom: 1px solid rgba(128, 128, 128, 0.3);
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.rs-part {
  margin-bottom: 10px;
}
.rs-p {
  display: flex;
  align-items: center;
  padding: 4px 0;
}
.rs-sw {
  width: 10px;
  height: 22px;
  margin-right: 8px;
  border-radius: 2px;
  flex: 0 0 10px;
}
.rs-p-app {
  font-size: 13px;
}
.rs-p-dev,
.rs-opt-s {
  font-size: 11px;
  opacity: 0.65;
}
.rs-p-dur {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  opacity: 0.8;
}

.rs-opt,
.rs-scope-o {
  display: flex;
  align-items: baseline;
  // 44px so every option clears a thumb (R34). The whole row is the target, not the
  // radio dot -- a 13px dot is not tappable and this sheet is used on a phone.
  min-height: 44px;
  padding: 4px 8px;
  margin-bottom: 2px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  cursor: pointer;

  input {
    margin-right: 8px;
  }
  .rs-opt-t {
    margin-right: 6px;
  }

  &.on {
    border-color: #007bff;
    background: rgba(0, 123, 255, 0.08);
  }
}
.rs-scope-o {
  flex: 1 1 0;
  margin-right: 6px;
  &:last-child {
    margin-right: 0;
  }
}
.rs-opt-t {
  font-size: 13px;
}
.rs-label-in {
  margin: -2px 0 6px 26px;
  width: calc(100% - 26px);
}
.rs-both,
.rs-scope {
  margin: 10px 0;
}
.rs-note {
  font-size: 11px;
  opacity: 0.7;
}
.rs-foot {
  border-top: 1px solid rgba(128, 128, 128, 0.3);
  padding-top: 8px;
}
.rs-pending {
  font-size: 11px;
  margin-bottom: 8px;
}
.rs-json {
  max-height: 180px;
  overflow: auto;
  font-size: 10px;
  padding: 6px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.12);
}
.rs-scope-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
  display: block;
}
</style>
