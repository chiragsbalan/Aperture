'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { FormSelect } from '@/components/form-select';
import {
  createCustomList,
  type CustomListSummary,
  type ListVisibility,
} from '@/lib/library';

const VISIBILITY_OPTIONS = [
  { value: 'public' as const, label: 'Anyone' },
  { value: 'private' as const, label: 'Private' },
];

interface CreateCustomListFormProps {
  /** Called after a list is created successfully. */
  onCreated: (list: CustomListSummary) => void;
  /** Optional secondary action (e.g. return to add-to-list picker). */
  onCancel?: () => void;
  /** Focus the Title field when the form mounts / becomes active. */
  autoFocusTitle?: boolean;
}

/** Shared create-list fields for library Lists and title-page add-to-list. */
export function CreateCustomListForm({
  onCreated,
  onCancel,
  autoFocusTitle = false,
}: CreateCustomListFormProps) {
  const formId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('private');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoFocusTitle) {
      return;
    }
    // Defer past CollectionSheet's panel focus (parent effect + one rAF).
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          titleInputRef.current?.focus();
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocusTitle]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (creating || !title.trim()) {
      return;
    }
    setCreating(true);
    setActionError(null);
    const result = await createCustomList({
      title: title.trim(),
      description: description.trim() || null,
      visibility,
    });
    setCreating(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    const summary: CustomListSummary = {
      id: result.list.id,
      title: result.list.title,
      description: result.list.description,
      visibility: result.list.visibility,
      item_count: result.list.item_count,
      created_at: result.list.created_at,
      updated_at: result.list.updated_at,
    };
    onCreated(summary);
  }

  return (
    <form
      onSubmit={(event) => {
        void handleCreate(event);
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor={`${formId}-title`} className="block text-sm text-muted">
          Title
        </label>
        <input
          ref={titleInputRef}
          id={`${formId}-title`}
          name="title"
          required
          maxLength={100}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-description`}
          className="block text-sm text-muted"
        >
          Description (optional)
        </label>
        <textarea
          id={`${formId}-description`}
          name="description"
          maxLength={2000}
          rows={3}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
        />
      </div>
      <div>
        <span
          id={`${formId}-visibility-label`}
          className="block text-sm text-muted"
        >
          Visibility
        </span>
        <FormSelect
          id={`${formId}-visibility`}
          name="visibility"
          aria-labelledby={`${formId}-visibility-label`}
          value={visibility}
          options={VISIBILITY_OPTIONS}
          onChange={setVisibility}
          className="mt-1"
        />
      </div>
      {actionError ? (
        <p className="text-[var(--color-danger)]" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={creating || !title.trim()}
          aria-busy={creating}
          className="btn btn-primary"
        >
          {creating ? 'Creating…' : 'Create list'}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
