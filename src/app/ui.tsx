// Building blocks shared by all screens. Looks follow the wireframes in
// docs/wireframes: one column in phone format, title bar on top, the main
// action in a grey bar at the bottom, touch targets of at least 44 px.

import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { navigate } from './router';

// --- layout ---------------------------------------------------------------

interface ScreenProps {
  title: ReactNode;
  /** Path the back button leads to; without it there is no back button. */
  back?: string;
  /** Buttons at the right end of the title bar. */
  actions?: ReactNode;
  /** Grey bar below the title, e.g. the receipt summary. */
  banner?: ReactNode;
  /** Grey bar at the bottom with the main action. */
  footer?: ReactNode;
  /** The title is the page heading (h1) unless the body brings its own. */
  titleAs?: 'h1' | 'div';
  children: ReactNode;
}

export function Screen({
  title,
  back,
  actions,
  banner,
  footer,
  titleAs = 'h1',
  children,
}: ScreenProps) {
  const Title = titleAs;
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-white text-ink shadow-sm">
      <header
        className={`flex min-h-[60px] shrink-0 items-center gap-2 border-b border-line py-2 pr-2 ${
          back ? 'pl-2' : 'pl-4'
        }`}
      >
        {back && (
          <IconButton label="Zurück" onClick={() => navigate(back)}>
            <ChevronLeft />
          </IconButton>
        )}
        <Title className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</Title>
        {actions}
      </header>
      {banner}
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      {footer && (
        <footer className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-panel px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      )}
    </div>
  );
}

/** Section heading as in the wireframes: small, grey, semibold. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-[13px] font-semibold text-muted">{children}</h2>;
}

/** Bordered list with hairlines between the rows. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-line-soft rounded-lg border border-line">
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13px] text-muted">{children}</p>;
}

export function Loading({ label = 'Lädt …' }: { label?: string }) {
  return (
    <p className="m-0 p-6 text-center text-sm text-muted" role="status">
      {label}
    </p>
  );
}

/** An error the user should read. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn" role="alert">
      {children}
    </p>
  );
}

// --- buttons ----------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'text' | 'dashed';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** 52 px for the main action of a screen, otherwise 48 px (44 px for text buttons). */
  tall?: boolean;
}

const BUTTON_STYLES: Record<Variant, string> = {
  primary:
    'rounded-lg border-0 bg-accent px-4 text-base font-semibold text-white disabled:bg-[#c9c9c9] disabled:text-[#3d3d3d]',
  secondary:
    'rounded-lg border border-field bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-50',
  text: 'border-0 bg-transparent px-1 text-sm font-semibold text-accent disabled:opacity-50',
  dashed:
    'rounded-lg border border-dashed border-field bg-white px-4 text-left text-[15px] text-ink disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  tall = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const height = variant === 'text' ? 'min-h-11' : tall ? 'min-h-[52px]' : 'min-h-12';
  return (
    <button
      type={type}
      className={`${height} cursor-pointer disabled:cursor-default ${BUTTON_STYLES[variant]} ${className}`}
      {...rest}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** What the button does, for screen readers. */
  label: string;
}

export function IconButton({ label, className = '', children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-ink ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A toggle in pill shape: a member on a position. */
export function Chip({
  pressed,
  onClick,
  children,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 cursor-pointer rounded-full border px-3 text-[13px] ${
        pressed
          ? 'border-accent bg-accent font-semibold text-white'
          : 'border-field bg-white text-ink'
      }`}
    >
      {children}
    </button>
  );
}

// --- form fields ------------------------------------------------------------

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
}

export const INPUT_STYLE =
  'min-h-12 w-full min-w-0 rounded-lg border border-field bg-white px-3 text-base text-ink';

export function TextField({
  label,
  value,
  onChange,
  hint,
  hideLabel = false,
  className = '',
  ...rest
}: TextFieldProps) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : 'text-[13px] font-semibold text-muted'}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_STYLE}
        {...rest}
      />
      {hint && <div className="text-[13px] text-muted">{hint}</div>}
    </div>
  );
}

// --- overlays ---------------------------------------------------------------

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A sheet that slides over the screen from the bottom. Escape or a tap outside closes it. */
export function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Put the keyboard focus into the sheet: first field, else the sheet itself.
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea');
    (first ?? panel.current)?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Schließen"
        tabIndex={-1}
        className="absolute inset-0 cursor-default border-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[90dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white px-4 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] outline-none"
      >
        <div className="flex items-center gap-2">
          <h2 id={titleId} className="m-0 flex-1 text-[17px] font-semibold">
            {title}
          </h2>
          <IconButton label="Schließen" onClick={onClose} className="-mr-2">
            <CloseIcon />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Shows a short confirmation at the bottom for a few seconds. */
export function useToast(): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);
  const node = message ? (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
    >
      <div className="rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">{message}</div>
    </div>
  ) : null;
  return [node, setMessage];
}

// --- icons (from the wireframes) ---------------------------------------------

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = () => (
  <Svg size={22}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ChevronRight = () => (
  <Svg size={18}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const MenuIcon = () => (
  <Svg size={22}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg size={18}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const PencilIcon = () => (
  <Svg size={18}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Svg>
);
