export type StateListener<S extends string> = (to: S, from: S) => void;

/**
 * Tiny explicit state machine. Every legal transition is declared up front, so an
 * unexpected transition is a loud bug instead of a silently inconsistent boolean soup.
 */
export class StateMachine<S extends string> {
  private state: S;
  private readonly listeners = new Set<StateListener<S>>();

  constructor(
    initial: S,
    private readonly transitions: Readonly<Record<S, readonly S[]>>,
  ) {
    this.state = initial;
  }

  get current(): S {
    return this.state;
  }

  is(...states: S[]): boolean {
    return states.includes(this.state);
  }

  can(to: S): boolean {
    return this.transitions[this.state].includes(to);
  }

  transition(to: S): void {
    if (!this.can(to)) {
      throw new Error(`Invalid state transition ${this.state} -> ${to}`);
    }
    const from = this.state;
    this.state = to;
    for (const listener of this.listeners) listener(to, from);
  }

  onChange(listener: StateListener<S>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
