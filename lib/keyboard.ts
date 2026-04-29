"use client";

import { useEffect, useRef } from "react";

interface KeyboardShortcutOptions {
  onFocusSearch: () => void;
  onEscape?: () => void;
  onAdminSeeds?: () => void;
  onAdminAlerts?: () => void;
  adminEnabled?: boolean;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
};

export function useKeyboardShortcuts({
  onFocusSearch,
  onEscape,
  onAdminSeeds,
  onAdminAlerts,
  adminEnabled = false,
}: KeyboardShortcutOptions): void {
  const sequenceRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    const clearSequence = (): void => {
      sequenceRef.current = null;
    };

    const handler = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const editable = isEditableTarget(event.target);

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        onFocusSearch();
        clearSequence();
        return;
      }

      if (key === "escape") {
        onEscape?.();
        clearSequence();
        return;
      }

      if (editable || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        onFocusSearch();
        clearSequence();
        return;
      }

      if (!adminEnabled) {
        clearSequence();
        return;
      }

      const now = Date.now();
      const previous = sequenceRef.current;

      if (key === "g") {
        sequenceRef.current = { key, at: now };
        return;
      }

      if (previous?.key === "g" && now - previous.at <= 700) {
        if (key === "s") {
          event.preventDefault();
          onAdminSeeds?.();
        }
        if (key === "a") {
          event.preventDefault();
          onAdminAlerts?.();
        }
        clearSequence();
        return;
      }

      clearSequence();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [adminEnabled, onAdminAlerts, onAdminSeeds, onEscape, onFocusSearch]);
}
