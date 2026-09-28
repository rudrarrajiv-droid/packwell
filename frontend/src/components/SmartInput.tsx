import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';

interface SmartInputProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export default function SmartInput({ value, onChange, options = [], placeholder, className }: SmartInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const safeValue = value || '';
  const [inputValue, setInputValue] = useState(safeValue);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // On blur, update the parent with whatever is typed
        if (inputValue !== (value || '')) {
          onChange(inputValue.trim().toUpperCase());
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue, value, onChange]);

  const searchWords = inputValue.toLowerCase().split(' ').filter(Boolean);

  const filteredOptions = useMemo(() => {
    if (searchWords.length === 0) return options;
    return options.filter(opt => {
      const lowerOpt = opt.toLowerCase();
      // Match if ALL typed words are present in the option
      return searchWords.every(word => lowerOpt.includes(word));
    });
  }, [options, searchWords]);

  const exactMatch = options.some(opt => opt.toLowerCase() === inputValue.trim().toLowerCase());

  const handleSelect = (opt: string) => {
    setInputValue(opt);
    onChange(opt);
    setIsOpen(false);
  };

  const handleCreate = () => {
    const newVal = inputValue.trim().toUpperCase();
    setInputValue(newVal);
    onChange(newVal);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={inputValue}
        onChange={e => {
          setInputValue(e.target.value.toUpperCase());
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-xl max-h-60 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, i) => (
                <div
                  key={i}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-muted text-foreground"
                  onClick={() => handleSelect(opt)}
                >
                  {opt}
                </div>
              ))
            ) : (
              !inputValue.trim() && (
                <div className="px-3 py-2 text-sm text-muted-foreground italic">
                  Start typing to search...
                </div>
              )
            )}
            
            {inputValue.trim() && !exactMatch && (
              <div
                className="px-3 py-2 text-sm cursor-pointer text-primary hover:bg-primary/10 flex items-center gap-2 border-t border-border mt-1 pt-2 font-medium"
                onClick={handleCreate}
              >
                <Plus className="w-4 h-4" />
                Create "{inputValue.trim().toUpperCase()}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
