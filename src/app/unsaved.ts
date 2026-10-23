import { useEffect } from "react";
const drafts = new Set<symbol>();
export const hasUnsavedChanges = () => drafts.size > 0;
export function useUnsavedChanges(dirty: boolean, protectNavigation = false) {
  useEffect(() => {
    const key = Symbol();
    if (dirty) drafts.add(key);
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (
        anchor &&
        anchor.origin === location.origin &&
        anchor.href !== location.href &&
        !confirm(
          "Tinggalkan formulir yang belum tersimpan? Simpan atau ekspor input terlebih dahulu.",
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    if (dirty && protectNavigation) {
      window.addEventListener("beforeunload", before);
      document.addEventListener("click", click, true);
    }
    return () => {
      drafts.delete(key);
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, protectNavigation]);
}
