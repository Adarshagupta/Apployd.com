'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef } from 'react';

// Monaco must be loaded client-side only
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface CodeEditorProps {
  path: string;
  content: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    mjs: 'javascript', cjs: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c', h: 'c',
    json: 'json',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini',
    md: 'markdown',
    mdx: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql',
    prisma: 'prisma',
    dockerfile: 'dockerfile',
    xml: 'xml',
    env: 'ini',
    txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

export default function CodeEditor({ path, content, onChange, language, readOnly }: CodeEditorProps) {
  const detectedLanguage = language ?? getLanguageFromPath(path);

  const handleChange = useCallback(
    (value: string | undefined) => {
      onChange(value ?? '');
    },
    [onChange],
  );

  return (
    <MonacoEditor
      height="100%"
      width="100%"
      language={detectedLanguage}
      value={content}
      onChange={handleChange}
      theme="vs-dark"
      options={{
        readOnly: readOnly ?? false,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        tabSize: 2,
        insertSpaces: true,
        automaticLayout: true,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true },
        folding: true,
        suggest: { showIcons: true },
      }}
    />
  );
}
