"use client";

import { useActionState } from "react";
import { StatusBanner, StatusChip } from "@/components/status";
import { SubmitButton } from "@/components/submit-button";
import { FOCUS_RING } from "@/components/ui";
import {
  removeGsCredential,
  saveGsCredential,
  setGsEnabled,
  testGsConnection,
  type GsSettingsResult,
} from "./actions";

const INITIAL: GsSettingsResult = {};

export interface GsConnectionFormProps {
  workspace: string | null;
  saved: { source_name: string; api_key_last4: string; enabled: boolean } | null;
  canSave: boolean;
}

/**
 * The credential is WRITE-ONLY. The input is always empty on load — the saved
 * key is shown as gs_live_••••4f2a from `api_key_last4` and is never returned
 * to the browser in any form. Submitting a new value rotates it.
 */
export function GsConnectionForm({ workspace, saved, canSave }: GsConnectionFormProps) {
  const [saveState, saveAction] = useActionState(
    async (_prev: GsSettingsResult, fd: FormData) => saveGsCredential(fd),
    INITIAL,
  );
  const [toggleState, toggleAction] = useActionState(
    async (_prev: GsSettingsResult, fd: FormData) => setGsEnabled(fd),
    INITIAL,
  );
  const [testState, testAction] = useActionState(
    async () => testGsConnection(),
    INITIAL,
  );
  const [removeState, removeAction] = useActionState(
    async () => removeGsCredential(),
    INITIAL,
  );

  const message = saveState.error || toggleState.error || testState.error || removeState.error;
  const ok = saveState.success || toggleState.success || testState.success || removeState.success;

  return (
    <div className="mt-6 rounded-surface border border-paper-300 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-subhead font-medium text-paper-900">Connection</h2>
        {saved ? (
          saved.enabled ? (
            <StatusChip state="verified">Connected</StatusChip>
          ) : (
            <StatusChip state="unknown">Disconnected</StatusChip>
          )
        ) : (
          <StatusChip state="unknown">Not connected</StatusChip>
        )}
      </div>

      {saved ? (
        <dl className="mt-4 space-y-2 text-body">
          <div className="flex justify-between gap-4">
            <dt className="text-paper-600">API key</dt>
            <dd className="font-mono text-paper-900">gs_live_••••{saved.api_key_last4}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-paper-600">Source name</dt>
            <dd className="text-paper-900">{saved.source_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-paper-600">Workspace</dt>
            <dd className="text-paper-900">{workspace}</dd>
          </div>
        </dl>
      ) : null}

      {message ? (
        <StatusBanner state="failed" className="mt-4" title="That did not work">
          {message}
        </StatusBanner>
      ) : null}
      {ok ? (
        <StatusBanner state="verified" className="mt-4" title="Done">
          {ok}
        </StatusBanner>
      ) : null}

      <form action={saveAction} className="mt-5 space-y-4">
        <input type="hidden" name="workspace" value={workspace ?? ""} />

        <div>
          <label htmlFor="api_key" className="block text-caption font-medium text-paper-700">
            {saved ? "Replace the API key" : "GroundStream API key"}
          </label>
          <input
            id="api_key"
            name="api_key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder="gs_live_…"
            disabled={!canSave}
            className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 font-mono text-base disabled:bg-paper-100 disabled:text-paper-600 focus:border-ink-500 focus:ring-1 focus:ring-ink-500 focus:outline-none sm:text-body"
          />
          <p className="mt-1 text-caption text-paper-600">
            Shown once by GroundStream and never retrievable. It is stored encrypted and can be
            replaced here, but never read back.
          </p>
        </div>

        <div>
          <label htmlFor="source_name" className="block text-caption font-medium text-paper-700">
            Source name
          </label>
          <input
            id="source_name"
            name="source_name"
            type="text"
            required
            defaultValue={saved?.source_name ?? ""}
            placeholder="Meeting Minutes"
            disabled={!canSave}
            className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base disabled:bg-paper-100 disabled:text-paper-600 focus:border-ink-500 focus:ring-1 focus:ring-ink-500 focus:outline-none sm:text-body"
          />
          <p className="mt-1 text-caption text-paper-600">
            Must match the name registered in GroundStream <strong>character-for-character</strong>
            . The comparison is case-sensitive, and a stray space creates a third source that
            matches nothing.
          </p>
        </div>

        <SubmitButton
          pendingLabel={saved ? "Replacing…" : "Connecting…"}
          className={`inline-flex min-h-11 items-center justify-center rounded-surface bg-ink-600 px-4 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          {saved ? "Replace key" : "Connect"}
        </SubmitButton>
      </form>

      {saved ? (
        <div className="rule-subblock mt-6 flex flex-wrap items-center gap-2">
          <form action={testAction}>
            <SubmitButton
              pendingLabel="Testing…"
              className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 text-body font-medium text-paper-700 hover:bg-paper-50 disabled:opacity-60 ${FOCUS_RING}`}
            >
              Test connection
            </SubmitButton>
          </form>

          <form action={toggleAction}>
            <input type="hidden" name="workspace" value={workspace ?? ""} />
            <input type="hidden" name="enabled" value={saved.enabled ? "false" : "true"} />
            <SubmitButton
              pendingLabel={saved.enabled ? "Disconnecting…" : "Re-enabling…"}
              className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 text-body font-medium text-paper-700 hover:bg-paper-50 disabled:opacity-60 ${FOCUS_RING}`}
            >
              {saved.enabled ? "Disconnect" : "Re-enable"}
            </SubmitButton>
          </form>

          <form action={removeAction}>
            <SubmitButton
              pendingLabel="Removing…"
              className={`inline-flex min-h-11 items-center rounded-control px-3 text-body text-paper-600 hover:text-status-failed-600 disabled:opacity-60 ${FOCUS_RING}`}
            >
              Remove
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <p className="mt-4 text-caption text-paper-600">
        Testing sends one probe with a fixed id. The first press reports{" "}
        <strong>accepted: 1</strong>; every press after reports <strong>deduped: 1</strong>.{" "}
        <strong>Both mean it worked</strong> — a dedupe is the proof that retries cannot create
        duplicates.
      </p>
    </div>
  );
}
