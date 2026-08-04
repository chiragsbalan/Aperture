'use client';

import Link from 'next/link';

import { CollectionSheet } from '@/components/collection-sheet';
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
  onToggleList: (list: CustomListSummary) => void;
}

/** Add-to-list overlay for title-page library actions (lazy-loaded). */
export function LibraryAddToListSheet({
  open,
  onClose,
  onDismiss,
  lists,
  listMembership,
  pending,
  onToggleList,
}: LibraryAddToListSheetProps) {
  return (
    <CollectionSheet open={open} title="Add to list" onClose={onClose}>
      {lists.length === 0 ? (
        <p className="text-sm text-muted">
          No custom lists yet.{' '}
          <Link href="/library/lists" className="underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {lists.map((list) => {
            const checked = Boolean(listMembership[list.id]);
            return (
              <li key={list.id}>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
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
      <button type="button" className="btn mt-6" onClick={onDismiss}>
        Done
      </button>
    </CollectionSheet>
  );
}
