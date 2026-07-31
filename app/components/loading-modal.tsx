"use client";

export type LoadingModalProps = {
  open: boolean;
  message?: string;
};

export function LoadingModal({ open, message = "Please wait..." }: LoadingModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d1d5db] border-t-[#1f2937]" />
          </div>
        </div>
        <div className="mt-5 text-center">
          <p className="text-lg font-semibold text-[#111827]">Processing...</p>
          <p className="mt-2 text-sm leading-6 text-[#475569]">{message}</p>
        </div>
      </div>
    </div>
  );
}
