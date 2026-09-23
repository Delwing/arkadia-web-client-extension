import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import type {
    Ref,
    AnchorHTMLAttributes,
    ButtonHTMLAttributes,
    InputHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
} from 'react';

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ');

/**
 * Password managers ignore autocomplete=off and offer logins on any lone text
 * field. Every dialog field opts out; the login form doesn't use these
 * primitives, so it keeps its password-manager support.
 */
export const NO_PASSWORD_MANAGER = {
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
} as const;

/** Typing aids off: patterns and commands are code, not prose. */
const CODE_INPUT = {
    autoCorrect: 'off',
    autoComplete: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
} as const;

// ── Button ────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** solid = the one main action; secondary = default; ghost = quiet; danger = destructive. */
    variant?: 'solid' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
}

const buttonClass = (variant: ButtonProps['variant'], size: ButtonProps['size'], className?: string) => cx(
    'popup-btn popup-btn--control',
    size === 'sm' && 'popup-btn--sm',
    variant === 'solid' && 'popup-btn--solid',
    variant === 'ghost' && 'popup-btn--ghost',
    variant === 'danger' && 'popup-btn--danger',
    className,
);

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
    return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

/** A link that looks like a Button — for actions that open a page (opens in a new tab). */
export function LinkButton({ variant = 'secondary', size = 'md', className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & Pick<ButtonProps, 'variant' | 'size'>) {
    return <a target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)} {...rest} />;
}

/**
 * Removes one item from a list: a quiet red bin, named by its tooltip. The
 * confirming button of a delete dialog stays a worded (tinted) danger Button.
 */
export function DeleteButton({ title = 'Usuń', size = 'sm', className, ...rest }: Omit<ButtonProps, 'variant' | 'children'>) {
    return (
        <Button variant="danger" size={size} title={title} className={cx('popup-btn--icon popup-btn--ghost', className)} {...rest}>
            <Trash2 size={size === 'sm' ? 15 : 17} strokeWidth={1.75} />
        </Button>
    );
}

// ── Notice ───────────────────────────────────────────────────────────────

/** An inline message (result, warning, error); `onClose` adds a × to dismiss it. */
export function Notice({ variant, onClose, className, children }: {
    variant?: 'success' | 'warning' | 'danger';
    onClose?: () => void;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cx('popup-notice', variant && `popup-notice--${variant}`, onClose && 'popup-notice--dismissible', className)}>
            <div className="popup-notice__body">{children}</div>
            {onClose && (
                <button type="button" className="popup-notice__close" title="Zamknij" onClick={onClose}>×</button>
            )}
        </div>
    );
}

// ── Text inputs and select ────────────────────────────────────────────────

interface MonoProp {
    /** Monospace, and typing aids off — for patterns and commands. */
    mono?: boolean;
}

export function Input({ mono, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & MonoProp & { ref?: Ref<HTMLInputElement> }) {
    return (
        <input
            type="text"
            {...NO_PASSWORD_MANAGER}
            {...(mono ? CODE_INPUT : {})}
            className={cx('popup-input popup-input--control', mono && 'popup-input--mono', className)}
            {...rest}
        />
    );
}

export function TextArea({ mono, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & MonoProp & { ref?: Ref<HTMLTextAreaElement> }) {
    return (
        <textarea
            {...NO_PASSWORD_MANAGER}
            {...(mono ? CODE_INPUT : {})}
            className={cx('popup-input popup-input--control', mono && 'popup-input--mono', className)}
            {...rest}
        />
    );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return <select className={cx('popup-input popup-input--control', className)} {...rest} />;
}

/** Fixed text before/after an input, e.g. ^ … $ around a regex. */
export function InputGroup({ before, after, children }: { before?: ReactNode; after?: ReactNode; children: ReactNode }) {
    return (
        <div className="popup-input-group">
            {before !== undefined && <span className="popup-input-group__addon">{before}</span>}
            {children}
            {after !== undefined && <span className="popup-input-group__addon">{after}</span>}
        </div>
    );
}

// ── Field ─────────────────────────────────────────────────────────────────

export interface FieldProps {
    label?: ReactNode;
    /** Connects the label to its control. */
    htmlFor?: string;
    hint?: ReactNode;
    error?: ReactNode;
    children: ReactNode;
    className?: string;
}

/** Label, control, then a hint or an error below. */
export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
    return (
        <div className={cx('popup-field', className)}>
            {label !== undefined && (
                <label className="popup-field__label" htmlFor={htmlFor}>{label}</label>
            )}
            {children}
            {error ? <div className="popup-field__error">{error}</div> : hint ? <div className="popup-field__hint">{hint}</div> : null}
        </div>
    );
}

// ── Checkbox / radio ──────────────────────────────────────────────────────

export interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    /** Omit in a table cell whose column header names the option. */
    label?: ReactNode;
    type?: 'checkbox' | 'radio';
}

export function Check({ label, type = 'checkbox', className, ...rest }: CheckProps) {
    return (
        <label className={cx('popup-check', className)}>
            <input type={type} {...rest} />
            {label != null && <span>{label}</span>}
        </label>
    );
}

// ── Segmented choice ──────────────────────────────────────────────────────

export interface SegmentedProps<T extends string> {
    value: T;
    options: { value: T; label: ReactNode }[];
    onChange: (value: T) => void;
    /** Radio group name; one is generated when omitted. */
    name?: string;
}

/**
 * Two to four mutually exclusive options drawn as one segmented control. Each
 * option is a real radio input (visually hidden, covering its label), so it is
 * a proper radio group for the keyboard and for label lookups.
 */
export function Segmented<T extends string>({ value, options, onChange, name }: SegmentedProps<T>) {
    const generated = useId();
    const group = name ?? generated;
    return (
        <div className="popup-segmented">
            {options.map(o => (
                <label key={o.value} className={cx('popup-segmented__item', o.value === value && 'is-active')}>
                    <input
                        type="radio"
                        className="popup-segmented__input"
                        name={group}
                        value={o.value}
                        checked={o.value === value}
                        onChange={() => onChange(o.value)}
                    />
                    {o.label}
                </label>
            ))}
        </div>
    );
}
