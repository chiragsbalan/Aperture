'use client';

import { useEffect, useState } from 'react';

import { CollectionSheet } from '@/components/collection-sheet';
import { CreateCustomListForm } from '@/components/create-custom-list-form';
import type { CustomListSummary } from '@/lib/library';

interface CreateCustomListSheetProps {
  open: boolean;
  onDismiss: () => void;
  onClose: () => void;
  onCreated: (list: CustomListSummary) => void;
}

/** Create-list overlay shared by library Lists (+ icon). */
export function CreateCustomListSheet({
  open,
  onDismiss,
  onClose,
  onCreated,
}: CreateCustomListSheetProps) {
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) {
      setFormKey((current) => current + 1);
    }
  }, [open]);

  return (
    <CollectionSheet
      open={open}
      title="Create a list"
      onDismiss={onDismiss}
      onClose={onClose}
    >
      <CreateCustomListForm
        key={formKey}
        autoFocusTitle
        onCancel={onDismiss}
        onCreated={(list) => {
          onCreated(list);
          onDismiss();
        }}
      />
    </CollectionSheet>
  );
}
