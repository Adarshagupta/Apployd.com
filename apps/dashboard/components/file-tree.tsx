'use client';

import { useState } from 'react';

export interface FileEntry {
  path: string;
  absPath: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

interface FileTreeProps {
  entries: FileEntry[];
  selectedPath?: string | undefined;
  onSelect: (entry: FileEntry) => void;
  onRefresh: () => void;
  onNewFile?: (dirPath: string) => void;
  onDelete?: (entry: FileEntry) => void;
}

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '🟡', jsx: '⚛️', mjs: '🟡',
    py: '🐍', rs: '🦀', go: '🐹', java: '☕', cs: '🔵',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    md: '📝', mdx: '📝', txt: '📄',
    html: '🌐', css: '🎨', scss: '🎨',
    sh: '💻', bash: '💻',
    sql: '🗄️',
    dockerfile: '🐳',
    env: '🔑',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🖼️', gif: '🖼️',
  };
  return icons[ext] ?? '📄';
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[] | undefined;
  entry?: FileEntry | undefined;
}

function buildTree(entries: FileEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const byPath: Map<string, TreeNode> = new Map();

  // Sort: dirs first, then alpha
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of sorted) {
    const parts = entry.path.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!byPath.has(currentPath)) {
        const isLast = i === parts.length - 1;
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? entry.type : 'directory',
          children: !isLast || entry.type === 'directory' ? [] : undefined,
          entry: isLast ? entry : undefined,
        };
        byPath.set(currentPath, node);

        if (parentPath) {
          const parent = byPath.get(parentPath);
          parent?.children?.push(node);
        } else {
          roots.push(node);
        }
      }
    }
  }

  return roots;
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onNewFile,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  selectedPath?: string | undefined;
  onSelect: (entry: FileEntry) => void;
  onNewFile?: (dirPath: string) => void;
  onDelete?: (entry: FileEntry) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [, setShowCtx] = useState(false);

  const isSelected = selectedPath === node.path;
  const isDir = node.type === 'directory';

  const handleClick = () => {
    if (isDir) {
      setOpen((o) => !o);
    } else if (node.entry) {
      onSelect(node.entry);
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer select-none text-sm
          ${isSelected ? 'bg-blue-600/30 text-blue-200' : 'hover:bg-white/5 text-gray-300 hover:text-white'}
        `}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); setShowCtx((v) => !v); }}
      >
        <span className="shrink-0 text-xs">{isDir ? (open ? '▾' : '▸') : ' '}</span>
        <span className="shrink-0">{getFileIcon(node.name, isDir)}</span>
        <span className="truncate">{node.name}</span>

        {/* Inline actions */}
        {isDir && onNewFile && (
          <button
            className="ml-auto hidden group-hover:block text-gray-500 hover:text-white px-1"
            onClick={(e) => { e.stopPropagation(); onNewFile(node.path); }}
            title="New file"
          >+</button>
        )}
        {!isDir && onDelete && node.entry && (
          <button
            className="ml-auto hidden group-hover:block text-gray-500 hover:text-red-400 px-1"
            onClick={(e) => { e.stopPropagation(); onDelete(node.entry!); }}
            title="Delete"
          >✕</button>
        )}
      </div>

      {isDir && open && node.children?.map((child) => (
        <TreeNodeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onNewFile={onNewFile}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default function FileTree({
  entries,
  selectedPath,
  onSelect,
  onRefresh,
  onNewFile,
  onDelete,
}: FileTreeProps) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? entries.filter((e) => e.path.toLowerCase().includes(search.toLowerCase()) && e.type === 'file')
    : entries;

  const tree = buildTree(filtered);

  return (
    <div className="flex flex-col h-full bg-gray-950 border-r border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Files</span>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="text-gray-500 hover:text-white text-sm"
        >⟳</button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-gray-800">
        <input
          className="w-full bg-gray-900 text-gray-200 text-xs rounded px-2 py-1 outline-none placeholder-gray-600 border border-gray-700 focus:border-blue-500"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="text-gray-600 text-xs px-4 py-4 text-center">
            {search ? 'No files match' : 'No files yet. Clone a repo or create files.'}
          </div>
        ) : (
          tree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onNewFile={onNewFile}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
