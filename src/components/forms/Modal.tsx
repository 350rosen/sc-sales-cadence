import React from "react";
import { X } from "lucide-react";
import { Card, Button } from "../ui";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Modal({ open, title, onClose, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <Card className="w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          {footer ?? <Button variant="secondary" onClick={onClose}>Close</Button>}
        </div>
      </Card>
    </div>
  );
}
