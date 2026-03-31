import * as React from 'react';
import { Input } from '@/components/ui/input';

interface SchemaSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SchemaSearch({ value, onChange, placeholder = 'Search…' }: SchemaSearchProps) {
  return (
    <Input
      className="h-7 text-xs"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
