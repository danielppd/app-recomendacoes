// Store leve em memória (sem dependência externa) para passar o pack atual
// da Home para a tela de Pack sem serializar objeto grande na URL.
import { useSyncExternalStore } from "react";
import type { Pack } from "../types";

let current: Pack | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setCurrentPack(pack: Pack | null) {
  current = pack;
  emit();
}

export function useCurrentPack(): Pack | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current
  );
}
