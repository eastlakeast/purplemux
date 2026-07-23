export interface IWebviewKeyboardInput {
  type: string;
  key: string;
  code: string;
  isAutoRepeat: boolean;
  shift: boolean;
  control: boolean;
  alt: boolean;
  meta: boolean;
}

export const normalizeWebviewKeyboardInput = (input: IWebviewKeyboardInput): string => {
  const parts: string[] = [];
  if (input.meta) parts.push('meta');
  if (input.control) parts.push('ctrl');
  if (input.alt) parts.push('alt');
  if (input.shift) parts.push('shift');
  parts.push(input.code);
  return parts.join('+');
};

export const toKeyboardEventInit = (input: IWebviewKeyboardInput): KeyboardEventInit => ({
  key: input.key,
  code: input.code,
  repeat: input.isAutoRepeat,
  shiftKey: input.shift,
  ctrlKey: input.control,
  altKey: input.alt,
  metaKey: input.meta,
  bubbles: true,
  cancelable: true,
});

