type Child = Node | string | null | undefined | false;

export interface ElementProps {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly onClick?: () => void;
}

/** Tiny DOM builder - enough for menus without pulling in a framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.onClick) {
    const handler = props.onClick;
    node.addEventListener('click', (e) => {
      e.preventDefault();
      handler();
    });
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function button(label: string | Node, cls: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  return el('button', { class: cls, onClick, attrs: { type: 'button', ...attrs } }, label);
}
