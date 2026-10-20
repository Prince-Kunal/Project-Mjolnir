import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Bottom sheet on phones, centred dialog on laptops. Radix handles focus and Escape. */
export function Sheet({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] focus:outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-2 md:hidden" aria-hidden />
          <Dialog.Title className="pr-8 text-lg font-semibold">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-1 text-sm text-muted">
              {description}
            </Dialog.Description>
          )}
          <Dialog.Close
            className="absolute top-4 right-4 rounded-md p-1 text-muted hover:text-text"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </Dialog.Close>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
