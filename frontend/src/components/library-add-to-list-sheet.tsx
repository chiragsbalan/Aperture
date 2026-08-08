'use client';

import { useEffect, useRef, useState } from 'react';

import { CollectionSheet } from '@/components/collection-sheet';
import { CreateCustomListForm } from '@/components/create-custom-list-form';
import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import { MembershipMarkIcon } from '@/components/shelf-chrome-icons';
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
            <p className="text-muted">No custom lists yet.</p>
          ) : (
            <ul className="space-y-1">
              {lists.map((list) => {
                const checked = Boolean(listMembership[list.id]);
                const isNewList = list.id === focusCreatedListId;
                return (
                  <li key={list.id}>
                    <label
                      className={[
                        'flex cursor-pointer items-center gap-3 px-2 py-2.5 -mx-2 rounded-[var(--radius-sm)] transition-colors',
                        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
                        'has-[:focus-visible]:outline-offset-2',
                        'has-[:focus-visible]:outline-[var(--color-focus)]',
                        checked
                          ? 'bg-[var(--color-accent-soft)]'
                          : pending
                            ? ''
                            : 'hover:bg-[var(--color-surface)]/40',
                        pending ? 'opacity-60' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        ref={isNewList ? newListCheckboxRef : undefined}
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={pending}
                        onChange={() => {
                          onToggleList(list);
                        }}
                      />
                      <ListTitleWithVisibility
                        title={list.title}
                        visibility={list.visibility}
                        className="min-w-0 flex-1 font-medium text-foreground"
                      />
                      {checked ? (
                        <MembershipMarkIcon className="shrink-0 text-[var(--color-accent)]" />
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {error ? (
            <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              ref={createControlRef}
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setMode('create');
              }}
            >
              Create new list
            </button>
            <button
              ref={doneButtonRef}
              type="button"
              className="btn"
              onClick={onDismiss}
            >
              Done
            </button>
          </div>
        </>
      )}
    </CollectionSheet>
  );
}
