import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuOption {
  value: string;
  label: string;
}

export interface MenuGroup {
  label?: string;
  options: MenuOption[];
}

export function MenuSelect({
  value,
  groups,
  onChange,
  disabled,
  label,
  className = "",
}: {
  value: string;
  groups: MenuGroup[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(value);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, maxHeight: 240, up: false });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const options = groups.flatMap((group) => group.options);
  const current = options.find((option) => option.value === value);

  function place() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const up = spaceBelow < 220 && spaceAbove > spaceBelow;
    const room = Math.max(120, Math.min(288, up ? spaceAbove : spaceBelow));
    setBox({
      top: up ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      maxHeight: room,
      up,
    });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    }
    function onLayout() {
      place();
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open]);

  function move(delta: number) {
    const index = options.findIndex((option) => option.value === highlight);
    const next = options[(Math.max(0, index) + delta + options.length) % options.length];
    if (next) setHighlight(next.value);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    button.current?.focus();
  }

  function toggle() {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    setHighlight(value);
    setOpen(true);
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        className="mv-input flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              toggle();
              return;
            }
            move(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(highlight);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <span className="truncate text-mv-ink">{current?.label ?? ""}</span>
        <ChevronDown className={`size-4 shrink-0 text-mv-accent transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open
        ? createPortal(
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="overflow-auto rounded-xl border border-mv-line bg-mv-solid p-1.5 text-mv-ink shadow-[0_18px_40px_-12px_rgb(9_10_19/0.65)]"
          style={{
            position: "fixed",
            zIndex: 80,
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
            ...(box.up ? { bottom: window.innerHeight - box.top + 6 } : { top: box.top + 6 }),
          }}
        >
          {groups.map((group) => (
            <div key={group.label ?? "options"} role="group" aria-label={group.label}>
              {group.label ? (
                <p className="px-2.5 pt-2 pb-1 text-[0.65rem] font-semibold tracking-[0.14em] text-mv-muted uppercase">{group.label}</p>
              ) : null}
              {group.options.map((option) => {
                const selected = option.value === value;
                const active = option.value === highlight;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-mv-ink ${
                      active || selected ? "bg-mv-accent/15" : "hover:bg-mv-accent/10"
                    }`}
                    onMouseEnter={() => setHighlight(option.value)}
                    onClick={() => choose(option.value)}
                  >
                    <span>{option.label}</span>
                    {selected ? <Check className="size-4 shrink-0 text-mv-accent" aria-hidden /> : <span className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}
