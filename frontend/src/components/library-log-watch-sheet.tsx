'use client';

import type { FormEvent } from 'react';

import { CollectionSheet } from '@/components/collection-sheet';
import { FormDatePicker } from '@/components/form-date-picker';
import { StarRatingInput } from '@/components/star-rating';

interface LibraryLogWatchSheetProps {
  open: boolean;
  /** After leave animation — parent may unmount the sheet. */
  onClose: () => void;
  /** Begin close (set open=false); keeps mount for leave animation. */
  onDismiss: () => void;
  formId: string;
  watchedAt: string;
  onWatchedAtChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  rating: number | null;
  onRatingChange: (value: number | null) => void;
  error: string | null;
  pending: boolean;
  onSubmit: (event: FormEvent) => void;
}

/** Log-watch overlay for title-page library actions (lazy-loaded). */
export function LibraryLogWatchSheet({
  open,
  onClose,
  onDismiss,
  formId,
  watchedAt,
  onWatchedAtChange,
  note,
  onNoteChange,
  rating,
  onRatingChange,
  error,
  pending,
  onSubmit,
}: LibraryLogWatchSheetProps) {
  return (
    <CollectionSheet
      open={open}
      title="Log watch"
      onClose={onClose}
      onDismiss={onDismiss}
    >
      <form
        onSubmit={(event) => {
          onSubmit(event);
        }}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor={`${formId}-watched-at`}
            className="block text-sm text-muted"
          >
            Watched on
          </label>
          <div className="mt-1">
            <FormDatePicker
              id={`${formId}-watched-at`}
              value={watchedAt}
              onChange={onWatchedAtChange}
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
            value={note}
            onChange={(event) => {
              onNoteChange(event.target.value);
            }}
            className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2"
          />
        </div>
        <div>
          <p className="block text-sm text-muted">Rating</p>
          <div className="mt-2">
            <StarRatingInput
              id={`${formId}-rating`}
              value={rating}
              onChange={onRatingChange}
            />
          </div>
        </div>
        {error ? (
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={onDismiss}>
            Cancel
          </button>
        </div>
      </form>
    </CollectionSheet>
  );
}
