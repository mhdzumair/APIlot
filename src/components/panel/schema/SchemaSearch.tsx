import * as React from 'react';
import { Input } from '@/components/ui/input';

interface SchemaSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SchemaSearch({ value, onChange, placeholder = 'Search…' }: SchemaSearchProps) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        ⌕
      </span>
      <Input
        className="h-8 text-xs rounded-[9px] pl-7"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
