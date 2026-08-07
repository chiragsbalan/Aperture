'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';

import { CollectionSheet } from '@/components/collection-sheet';
import { DiaryEntryLayout } from '@/components/diary-entry-layout';
import { FormDatePicker } from '@/components/form-date-picker';
import {
  PencilOutlineIcon,
  TrashOutlineIcon,
} from '@/components/shelf-chrome-icons';
import { StarRatingInput } from '@/components/star-rating';
import {
  deleteWatchEntry,
  patchWatchEntry,
  type WatchEntry,
} from '@/lib/library';

type SheetMode = 'detail' | 'edit' | 'delete';

interface DiaryEntrySheetProps {
  entry: WatchEntry | null;
  open: boolean;
  /** Begin close (set open=false); keeps mount for leave animation. */
  onDismiss: () => void;
  /** After leave animation — parent may clear selected entry. */
  onClose: () => void;
  onUpdated: (entry: WatchEntry) => void;
  onDeleted: (entryId: string) => void;
}

/**
 * Owner diary log popup: detail (card layout) → edit form or delete confirm.
 */
export function DiaryEntrySheet({
  entry,
  open,
  onDismiss,
  onClose,
  onUpdated,
  onDeleted,
}: DiaryEntrySheetProps) {
  const formId = useId();
  const [mode, setMode] = useState<SheetMode>('detail');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editRating, setEditRating] = useState<number | null>(null);
  const [activeEntry, setActiveEntry] = useState<WatchEntry | null>(entry);

  useEffect(() => {
    if (!open || entry == null) {
      return;
    }
    setActiveEntry(entry);
    setMode('detail');
    setError(null);
    setPending(false);
    setEditDate(entry.watched_at);
    setEditNote(entry.note ?? '');
    setEditRating(entry.rating);
  }, [open, entry]);

  const title = mode === 'delete' ? 'Delete this diary entry?' : 'Edit log';

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (activeEntry == null || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await patchWatchEntry(activeEntry.id, {
        watched_at: editDate,
        note: editNote.trim() || null,
        rating: editRating,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setActiveEntry(result.entry);
      onUpdated(result.entry);
      onDismiss();
    } catch {
      setError('Could not update diary entry.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (activeEntry == null || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await deleteWatchEntry(activeEntry.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const deletedId = activeEntry.id;
      onDismiss();
      onDeleted(deletedId);
    } catch {
      setError('Could not delete diary entry.');
    } finally {
      setPending(false);
    }
  }

  return (
    <CollectionSheet
      open={open}
      title={title}
      onDismiss={onDismiss}
      onClose={onClose}
    >
      {activeEntry == null ? null : mode === 'detail' ? (
        <div className="space-y-6">
          <DiaryEntryLayout entry={activeEntry} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              aria-label="Edit diary entry"
              onClick={() => {
                setEditDate(activeEntry.watched_at);
                setEditNote(activeEntry.note ?? '');
                setEditRating(activeEntry.rating);
                setError(null);
                setMode('edit');
              }}
            >
              <PencilOutlineIcon />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              aria-label="Delete diary entry"
              onClick={() => {
                setError(null);
                setMode('delete');
              }}
            >
              <TrashOutlineIcon />
            </button>
          </div>
        </div>
      ) : mode === 'delete' ? (
        <div className="space-y-6">
          <p className="text-sm text-muted">
            Remove the watch of {activeEntry.content.title} on{' '}
            {activeEntry.watched_at}. This cannot be undone.
          </p>
          {error != null ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              className="btn btn-danger"
              onClick={() => {
                void handleDelete();
              }}
            >
              {pending ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMode('detail');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            void handleSaveEdit(event);
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor={`${formId}-date`}
              className="block text-sm text-muted"
            >
              Watched on
            </label>
            <div className="mt-1">
              <FormDatePicker
                id={`${formId}-date`}
                value={editDate}
                onChange={setEditDate}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor={`${formId}-note`}
              className="block text-sm text-muted"
            >
              Review
            </label>
            <textarea
              id={`${formId}-note`}
              maxLength={1000}
              rows={3}
              value={editNote}
              onChange={(event) => {
                setEditNote(event.target.value);
              }}
              className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2"
            />
          </div>
          <div>
            <p className="block text-sm text-muted">Rating</p>
            <div className="mt-2">
              <StarRatingInput
                id={`${formId}-rating`}
                value={editRating}
                onChange={setEditRating}
              />
            </div>
          </div>
          {error != null ? (
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMode('detail');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </CollectionSheet>
  );
}
