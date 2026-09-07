import { useId, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as RadioPrimitive from '@radix-ui/react-radio-group';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';

const classes = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

export function Button({ className, ...props }: ComponentProps<'button'>) {
  return <button className={classes('ui-button', className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={classes('ui-input', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={classes('ui-textarea', className)} {...props} />;
}

type SelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
};

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  id,
  label,
  className,
}: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  id?: string;
  label: string;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(defaultValue ?? options[0]?.value ?? '');
  const current = value ?? localValue;
  // Radix reserves the empty string for its placeholder. Encode only the UI value;
  // forms and callers continue to receive the original value, including "".
  const encode = (item: string) => `option:${item}`;
  return (
    <>
      <SelectPrimitive.Root
        value={encode(current)}
        disabled={disabled}
        onValueChange={(next) => {
          const decoded = next.slice('option:'.length);
          setLocalValue(decoded);
          onValueChange?.(decoded);
        }}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-label={label}
          className={classes('ui-select-trigger', className)}
        >
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon className="ui-select-chevron">
            <ChevronDown size={16} aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="ui-select-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <SelectPrimitive.ScrollUpButton className="ui-select-scroll">
              <ChevronUp size={14} aria-hidden="true" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="ui-select-viewport">
              <SelectPrimitive.Group>
                <SelectPrimitive.Label className="ui-select-heading">{label}</SelectPrimitive.Label>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={encode(option.value)}
                    textValue={option.label}
                    disabled={option.disabled}
                    className="ui-select-item"
                  >
                    <span className="ui-select-copy">
                      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                      {option.description && <small>{option.description}</small>}
                    </span>
                    {option.badge && <span className="ui-select-badge">{option.badge}</span>}
                    <span className="ui-select-check">
                      <SelectPrimitive.ItemIndicator>
                        <Check size={16} aria-hidden="true" />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="ui-select-scroll">
              <ChevronDown size={14} aria-hidden="true" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
    </>
  );
}

export function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const [returnFocus] = useState(() => {
    const active = document.activeElement as HTMLElement | null;
    const menu = active?.closest<HTMLElement>('[data-ui-return-focus]');
    // A menu item is removed when it opens a dialog. Return to its trigger instead.
    return (menu && document.getElementById(menu.dataset.uiReturnFocus!)) || active;
  });
  const descriptionId = useId();
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog-overlay">
          <DialogPrimitive.Content
            className={classes('dialog ui-dialog', wide ? 'wide' : undefined)}
            aria-describedby={description ? descriptionId : undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (returnFocus?.isConnected) returnFocus.focus();
            }}
          >
            <div className="dialog-heading">
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close className="icon-button" aria-label="关闭弹窗">
                <X size={19} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            {description && (
              <DialogPrimitive.Description id={descriptionId} className="dialog-intro">
                {description}
              </DialogPrimitive.Description>
            )}
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={classes('ui-checkbox', className)} {...props}>
      <CheckboxPrimitive.Indicator>
        <Check size={13} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={classes('ui-switch', className)} {...props}>
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export function Disclosure({
  title,
  children,
  className,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const id = useId();
  return (
    <CollapsiblePrimitive.Root
      className={classes('ui-disclosure', className)}
      defaultOpen={defaultOpen}
    >
      <CollapsiblePrimitive.Trigger id={id} className="ui-disclosure-trigger">
        {title}
        <ChevronDown className="ui-disclosure-chevron" size={15} aria-hidden="true" />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="ui-disclosure-content" aria-labelledby={id}>
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

export function ActionMenu({
  trigger,
  open,
  onOpenChange,
  items,
}: {
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: { label: string; icon: ReactNode; disabled?: boolean; onSelect: () => void }[];
}) {
  const triggerId = useId();
  return (
    <MenuPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <MenuPrimitive.Trigger id={triggerId} asChild>
        {trigger}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          className="ui-menu-content"
          data-ui-return-focus={triggerId}
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          {items.map((item) => (
            <MenuPrimitive.Item
              key={item.label}
              className="ui-menu-item"
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </MenuPrimitive.Item>
          ))}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export const RadioGroup = RadioPrimitive.Root;
export const RadioItem = RadioPrimitive.Item;
