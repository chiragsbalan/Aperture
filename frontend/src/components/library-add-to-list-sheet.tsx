'use client';

import { useEffect, useRef, useState } from 'react';

import { CollectionSheet } from '@/components/collection-sheet';
import { CreateCustomListForm } from '@/components/create-custom-list-form';
import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import type { CustomListSummary } from '@/lib/library';

interface LibraryAddToListSheetProps {
  open: boolean;
  /** After leave animation — parent may unmount the sheet. */
  onClose: () => void;
  /** Begin close (set open=false); keeps mount for leave animation. */
  onDismiss: () => void;
  lists: CustomListSummary[];
  listMembership: Record<string, boolean>;
  pending: boolean;
  error: string | null;
  onToggleList: (list: CustomListSummary) => void;
  /** After create on this title page — parent prepends + may add the title. */
  onListCreated: (list: CustomListSummary) => void;
}

/** Add-to-list overlay for title-page library actions (lazy-loaded). */
export function LibraryAddToListSheet({
  open,
  onClose,
  onDismiss,
  lists,
  listMembership,
  pending,
  error,
  onToggleList,
  onListCreated,
}: LibraryAddToListSheetProps) {
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const createControlRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const newListCheckboxRef = useRef<HTMLInputElement>(null);
  const focusAfterPickRef = useRef<'create' | 'created' | null>(null);
  const [focusCreatedListId, setFocusCreatedListId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (open) {
      setMode('pick');
      focusAfterPickRef.current = null;
      setFocusCreatedListId(null);
    }
  }, [open]);

  useEffect(() => {
    if (mode !== 'pick') {
      return;
    }
    const target = focusAfterPickRef.current;
    if (target == null) {
      return;
    }
    focusAfterPickRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (target === 'create') {
        createControlRef.current?.focus();
        return;
      }
      if (newListCheckboxRef.current != null) {
        newListCheckboxRef.current.focus();
        return;
      }
      doneButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mode, lists, focusCreatedListId]);

  return (
    <CollectionSheet
      open={open}
      title={mode === 'create' ? 'Create a list' : 'Add to list'}
      onClose={onClose}
      onDismiss={onDismiss}
    >
      {mode === 'create' ? (
        <>
          {error ? (
            <p className="mb-4 text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <CreateCustomListForm
            autoFocusTitle
            onCancel={() => {
              focusAfterPickRef.current = 'create';
              setMode('pick');
            }}
            onCreated={(list) => {
              onListCreated(list);
              focusAfterPickRef.current = 'created';
              setFocusCreatedListId(list.id);
              setMode('pick');
            }}
          />
        </>
      ) : (
        <>
          {lists.length === 0 ? (
            <p className="text-sm text-muted">No custom lists yet.</p>
          ) : (
            <ul className="space-y-2">
              {lists.map((list) => {
                const checked = Boolean(listMembership[list.id]);
                const isNewList = list.id === focusCreatedListId;
                return (
                  <li key={list.id}>
                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                      <input
                        ref={isNewList ? newListCheckboxRef : undefined}
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={() => {
                          onToggleList(list);
                        }}
                      />
                      <ListTitleWithVisibility
                        title={list.title}
                        visibility={list.visibility}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {error ? (
            <p className="mt-4 text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            ref={createControlRef}
            type="button"
            className="btn btn-ghost mt-6"
            onClick={() => {
              setMode('create');
            }}
          >
            Create new list
          </button>
          <button
            ref={doneButtonRef}
            type="button"
            className="btn mt-3"
            onClick={onDismiss}
          >
            Done
          </button>
        </>
      )}
    </CollectionSheet>
  );
}
