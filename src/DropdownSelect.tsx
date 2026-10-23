import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function DropdownSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "请选择",
  className = "",
  menuClassName = "",
  disabled = false,
  onContextMenu,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
  onContextMenu?: (event: MouseEvent, option?: DropdownOption) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value);

  function moveActive(direction: 1 | -1) {
    if (!options.length) return;
    setActiveIndex((current) => {
      let next = current;
      for (let attempt = 0; attempt < options.length; attempt += 1) {
        next = (next + direction + options.length) % options.length;
        if (!options[next].disabled) return next;
      }
      return current;
    });
  }

  function updateMenuPosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const width = Math.max(rect.width, 150);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const opensUp = below < 190 && above > below;
    const maxHeight = Math.max(90, Math.min(280, opensUp ? above : below));
    setMenuStyle({
      position: "fixed",
      left,
      width,
      maxHeight,
      ...(opensUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
        setOpen(true);
      } else {
        moveActive(event.key === "ArrowDown" ? 1 : -1);
      }
    } else if ((event.key === "Home" || event.key === "End") && open) {
      event.preventDefault();
      const direction = event.key === "Home" ? 1 : -1;
      const start = event.key === "Home" ? 0 : options.length - 1;
      const index = options.findIndex((option, optionIndex) => optionIndex >= start && !option.disabled);
      if (direction === 1 && index >= 0) setActiveIndex(index);
      else if (direction === -1) {
        for (let optionIndex = start; optionIndex >= 0; optionIndex -= 1) {
          if (!options[optionIndex].disabled) {
            setActiveIndex(optionIndex);
            break;
          }
        }
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && options[activeIndex] && !options[activeIndex].disabled) {
        onChange(options[activeIndex].value);
        setOpen(false);
      } else {
        const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
        setOpen(true);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`custom-dropdown ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) setOpen(false);
          else {
            const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
            setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        onContextMenu={(event) => onContextMenu?.(event, selected)}
        onBlur={() => setOpen(false)}
      >
        <span>{selected?.label || placeholder}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className={`custom-dropdown-menu ${menuClassName}`.trim()}
          role="listbox"
          aria-label={ariaLabel}
          style={menuStyle}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              disabled={option.disabled}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu?.(event, option);
              }}
              className={`${option.value === value ? "selected" : ""} ${index === activeIndex ? "active" : ""}`.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
          {!options.length && <div className="custom-dropdown-empty">没有可选项</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}
