import type { LucideIcon } from 'lucide-react'
import type { ComponentPropsWithRef, ReactElement } from 'react'
import './button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

/** The classes of a button — also for a link that looks like one */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra?: string | undefined,
): string {
  return ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, extra]
    .filter(Boolean)
    .join(' ')
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  /** A leading icon, decorative: the text names the button */
  icon?: LucideIcon | undefined
}

export function Button({
  variant,
  size,
  icon: Icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className="ui-button-icon" aria-hidden="true" />}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: LucideIcon
  /** The button's accessible name, also shown as its tooltip */
  label: string
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
}

/** A button that shows only an icon; `label` names it for assistive technology */
export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={buttonClass(
        variant,
        size,
        ['ui-button--icon', className].filter(Boolean).join(' '),
      )}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon className="ui-button-icon" aria-hidden="true" />
    </button>
  )
}
