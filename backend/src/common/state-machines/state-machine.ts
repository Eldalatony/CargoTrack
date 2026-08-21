import { UnprocessableEntityException } from '@nestjs/common';

/**
 * A transition table with teeth.
 *
 * Status is a Postgres enum column, so the database rejects nonsense values —
 * but it has no opinion about *order*, and "DELIVERED back to ORDER_PLACED" is
 * a valid enum value in an invalid place. That ordering is the business rule,
 * and it is enforced here, on the server, for every caller.
 *
 * An illegal move raises 422 rather than 400: the request is well-formed and
 * the target status is a real status, but the entity's current state makes the
 * move unprocessable. The message always names the legal targets, because an
 * error a client cannot act on is only half an error.
 */
export class StateMachine<TState extends string> {
  private readonly transitions: ReadonlyMap<TState, readonly TState[]>;

  constructor(
    /** Used in error messages: "Order cannot move from …". */
    readonly entity: string,
    transitions: Readonly<Record<TState, readonly TState[]>>,
  ) {
    this.transitions = new Map(
      Object.entries(transitions) as [TState, readonly TState[]][],
    );
  }

  /** Every state the machine knows about. */
  states(): TState[] {
    return [...this.transitions.keys()];
  }

  targetsFrom(state: TState): readonly TState[] {
    return this.transitions.get(state) ?? [];
  }

  isTerminal(state: TState): boolean {
    return this.targetsFrom(state).length === 0;
  }

  can(from: TState, to: TState): boolean {
    return this.targetsFrom(from).includes(to);
  }

  /** Throws 422 unless the move is on the transition table. */
  assert(from: TState, to: TState): void {
    if (this.can(from, to)) {
      return;
    }

    if (from === to) {
      throw new UnprocessableEntityException(
        `${this.entity} is already ${from}`,
      );
    }

    if (this.isTerminal(from)) {
      throw new UnprocessableEntityException(
        `${from} is a terminal state for ${this.entity.toLowerCase()}s — no further transitions are possible`,
      );
    }

    throw new UnprocessableEntityException(
      `${this.entity} cannot move from ${from} to ${to}. ` +
        `Valid transitions from ${from}: ${this.targetsFrom(from).join(', ')}`,
    );
  }
}
