"use client";

import { ReactNode } from "react";

type Action = (formData: FormData) => void | Promise<void>;

export function ConfirmForm({
  action,
  confirmMessage,
  children,
}: {
  action: Action;
  confirmMessage: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
