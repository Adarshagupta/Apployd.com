import type { ReactNode } from 'react';

// Override dashboard nav with a full-screen fixed overlay
export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
