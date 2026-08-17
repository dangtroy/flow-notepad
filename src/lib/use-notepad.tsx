import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  getNotepads,
  removeNotepad,
  reorderNotepadList,
  saveNotepad,
  setActiveNotepad,
} from "./flow.functions";
import { sortNotepads, type Notepad } from "./notepads";

const ACTIVE_STORAGE_KEY = "flow.activeNotepad";

export const NOTEPADS_KEY = ["notepads"] as const;

type NotepadContextValue = {
  notepads: Notepad[];
  activeId: string | null;
  active: Notepad | null;
  isLoading: boolean;
  /** Switching is local-first so it feels instantaneous, then remembered server-side. */
  switchTo: (id: string) => void;
  create: (input: { name: string; icon?: string; accent?: string }) => Promise<string | null>;
  update: (input: {
    id: string;
    name?: string;
    icon?: string;
    accent?: string;
    isPinned?: boolean;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
};

const NotepadContext = createContext<NotepadContextValue | null>(null);

export function NotepadProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const fetchNotepads = useServerFn(getNotepads);
  const persistActive = useServerFn(setActiveNotepad);
  const persist = useServerFn(saveNotepad);
  const destroy = useServerFn(removeNotepad);
  const persistOrder = useServerFn(reorderNotepadList);

  const query = useQuery({
    queryKey: NOTEPADS_KEY,
    queryFn: () => fetchNotepads(),
    staleTime: 60_000,
  });

  // Remembered locally as well: reopening lands in the same notepad with no flash.
  const [localId, setLocalId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_STORAGE_KEY);
  });

  const notepads = useMemo(() => sortNotepads(query.data?.notepads ?? []), [query.data]);

  const activeId = useMemo(() => {
    if (!notepads.length) return null;
    if (localId && notepads.some((notepad) => notepad.id === localId)) return localId;
    const serverId = query.data?.activeId ?? null;
    if (serverId && notepads.some((notepad) => notepad.id === serverId)) return serverId;
    return notepads[0]!.id;
  }, [notepads, localId, query.data]);

  useEffect(() => {
    if (activeId && typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_STORAGE_KEY, activeId);
    }
  }, [activeId]);

  const switchTo = useCallback(
    (id: string) => {
      setLocalId(id);
      void persistActive({ data: { notepadId: id } }).catch(() => {});
    },
    [persistActive],
  );

  const create = useCallback<NotepadContextValue["create"]>(
    async (input) => {
      const result = await persist({ data: input });
      queryClient.setQueryData(NOTEPADS_KEY, result);
      setLocalId(result.activeId);
      return result.activeId;
    },
    [persist, queryClient],
  );

  const update = useCallback<NotepadContextValue["update"]>(
    async (input) => {
      const result = await persist({ data: input });
      queryClient.setQueryData(NOTEPADS_KEY, (current: typeof result | undefined) => ({
        notepads: result.notepads,
        activeId: current?.activeId ?? result.activeId,
      }));
    },
    [persist, queryClient],
  );

  const remove = useCallback(
    async (id: string) => {
      const result = await destroy({ data: { id } });
      queryClient.setQueryData(NOTEPADS_KEY, result);
      setLocalId(result.activeId);
    },
    [destroy, queryClient],
  );

  const reorder = useCallback(
    async (ids: string[]) => {
      const result = await persistOrder({ data: { ids } });
      queryClient.setQueryData(NOTEPADS_KEY, (current: { activeId?: string | null } | undefined) => ({
        notepads: result.notepads,
        activeId: current?.activeId ?? null,
      }));
    },
    [persistOrder, queryClient],
  );

  const value = useMemo<NotepadContextValue>(
    () => ({
      notepads,
      activeId,
      active: notepads.find((notepad) => notepad.id === activeId) ?? null,
      isLoading: query.isPending,
      switchTo,
      create,
      update,
      remove,
      reorder,
    }),
    [notepads, activeId, query.isPending, switchTo, create, update, remove, reorder],
  );

  return <NotepadContext.Provider value={value}>{children}</NotepadContext.Provider>;
}

export function useNotepads(): NotepadContextValue {
  const value = useContext(NotepadContext);
  if (!value) throw new Error("useNotepads must be used inside NotepadProvider");
  return value;
}

/** The id every notepad-scoped query and mutation passes along. */
export function useActiveNotepadId(): string | null {
  return useNotepads().activeId;
}
