import { expect, it } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import { WorkspaceDirectoryReplica } from "./workspace-replica";

function workspace(id: string, projectId = "project"): WorkspaceDescriptorPayload {
  return {
    id,
    projectId,
    projectDisplayName: projectId,
    projectRootPath: `/repo/${projectId}`,
    workspaceDirectory: `/repo/${projectId}/${id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: id,
    title: id,
    status: "done",
    activityAt: null,
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
  } as unknown as WorkspaceDescriptorPayload;
}

// #5447: the daemon builds the response descriptor during provisioning, so a
// workspace_update that pins the row can be followed by an older snapshot.
it("keeps a live workspace update when an older creation snapshot arrives", () => {
  const serverId = "creation-snapshot-after-pin";
  const store = useSessionStore.getState();
  store.initializeSession(serverId, null as unknown as DaemonClient);
  const replica = new WorkspaceDirectoryReplica(serverId);
  const initial = workspace("new");
  const pinned = { ...initial, pinnedAt: "2026-10-13T00:00:00.000Z", title: "updated" };

  try {
    replica.applyDelta({ kind: "upsert", workspace: pinned });

    expect(replica.acceptWorkspaces([normalizeWorkspaceDescriptor(initial)])).toEqual([]);
    expect(replica.snapshot().workspaces.get(initial.id)).toEqual(
      normalizeWorkspaceDescriptor(pinned),
    );
  } finally {
    store.clearSession(serverId);
  }
});

it("seeds a workspace that was never received from the directory", () => {
  const serverId = "creation-snapshot-seeds-missing";
  const store = useSessionStore.getState();
  store.initializeSession(serverId, null as unknown as DaemonClient);
  const replica = new WorkspaceDirectoryReplica(serverId);
  const initial = normalizeWorkspaceDescriptor(workspace("new"));

  try {
    expect(replica.acceptWorkspaces([initial])).toEqual([
      { kind: "workspace", type: "upsert", id: initial.id, value: initial },
    ]);
    expect(replica.snapshot().workspaces.get(initial.id)).toEqual(initial);
  } finally {
    store.clearSession(serverId);
  }
});

it("keeps a manual unpin when a stale pinned snapshot arrives", () => {
  const serverId = "creation-snapshot-after-unpin";
  const store = useSessionStore.getState();
  store.initializeSession(serverId, null as unknown as DaemonClient);
  const replica = new WorkspaceDirectoryReplica(serverId);
  const pinned = { ...workspace("new"), pinnedAt: "2026-10-13T00:00:00.000Z" };
  const unpinned = { ...pinned, pinnedAt: null };

  try {
    replica.acceptWorkspaces([normalizeWorkspaceDescriptor(pinned)]);
    replica.applyDelta({ kind: "upsert", workspace: unpinned });
    expect(replica.acceptWorkspaces([normalizeWorkspaceDescriptor(pinned)])).toEqual([]);
  } finally {
    store.clearSession(serverId);
  }
});
