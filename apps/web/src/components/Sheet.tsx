import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Bottom sheet on phones, centred dialog on laptops. Radix handles focus and Escape. A dialog
 * floats, so it is the one surface allowed a shadow.
 */
export function Sheet({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 data-[state=open]:animate-[mj-fade_.18s_ease-out]" />
        <Dialog.Content
          data-lenis-prevent
          className="fixed inset-x-0 bottom-0 z-50 max-h-[88svh] overflow-y-auto overscroll-contain rounded-t-[26px] bg-surface p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_48px_rgba(0,0,0,.5)] focus:outline-none data-[state=open]:animate-[mj-sheet_.32s_var(--ease-out-quint)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[22px] md:p-7 md:data-[state=open]:animate-[mj-pop_.24s_var(--ease-out-quint)]"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-active md:hidden" aria-hidden />
          <Dialog.Title className="pr-10 text-[22px] leading-tight">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-1.5 text-[15px] text-muted">
              {description}
            </Dialog.Description>
          )}
          <Dialog.Close
            className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text md:top-5 md:right-5"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </Dialog.Close>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
