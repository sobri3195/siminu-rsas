import { useEffect } from "react";
const drafts = new Set<symbol>();
export const hasUnsavedChanges = () => drafts.size > 0;
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    const key = Symbol();
    if (dirty) drafts.add(key);
    return () => {
      drafts.delete(key);
    };
  }, [dirty]);
}
