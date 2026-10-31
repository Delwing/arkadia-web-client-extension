import type React from "react";

/**
 * The host's React, as handed to plugins on `api.ui.react`.
 * Use it (or a bundler mapping of `react` to it) instead of bundling React.
 */
export type PluginReact = typeof import('react');

/** @experimental Props may change between client versions. */
export interface PluginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** solid = the one main action; secondary = default; ghost = quiet; danger = destructive */
  variant?: 'solid' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

/** @experimental Props may change between client versions. */
export interface PluginHeaderButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** A toggle that is on */
  active?: boolean;
  /** Destructive, or arming one (a second click confirms) */
  danger?: boolean;
}

/** @experimental Props may change between client versions. */
export interface PluginSegmentedProps<T extends string = string> {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  name?: string;
  /** sm = window header size */
  size?: 'sm' | 'md';
}

/** @experimental Props may change between client versions. */
export interface PluginFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** @experimental Props may change between client versions. */
export interface PluginCheckProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  type?: 'checkbox' | 'radio';
}

/** @experimental Props may change between client versions. */
export interface PluginInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Monospace with typing aids off - for patterns and commands */
  mono?: boolean;
}

/** @experimental Props may change between client versions. */
export interface PluginNoticeProps {
  variant?: 'success' | 'warning' | 'danger';
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}

/** @experimental Props may change between client versions. */
export interface PluginMenuButtonProps {
  label: React.ReactNode;
  items: { label: React.ReactNode; hint?: React.ReactNode; onSelect: () => void; disabled?: boolean }[];
  size?: 'sm' | 'md';
  title?: string;
  /** Makes it a split button: the label runs this, the chevron opens the list */
  onClick?: () => void;
  menuWidth?: number;
  disabled?: boolean;
}

/**
 * The client's own UI components, styled like its built-in windows in every theme.
 *
 * @experimental This set and its props may change between client versions.
 * Only components rendered inside a plugin popup or footer are supported.
 */
export interface PluginUiComponents {
  Button: React.ComponentType<PluginButtonProps>;
  HeaderButton: React.ComponentType<PluginHeaderButtonProps>;
  Segmented: <T extends string>(props: PluginSegmentedProps<T>) => React.ReactElement;
  Select: React.ComponentType<React.SelectHTMLAttributes<HTMLSelectElement>>;
  Input: React.ComponentType<PluginInputProps>;
  Field: React.ComponentType<PluginFieldProps>;
  Check: React.ComponentType<PluginCheckProps>;
  MenuButton: React.ComponentType<PluginMenuButtonProps>;
  Notice: React.ComponentType<PluginNoticeProps>;
}
