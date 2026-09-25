import { ContainerStatus } from '@prisma/client';

import { StateMachine } from './state-machine';

/**
 * The container lifecycle from Information/Cargo_Track_StateDiagram.png
 * (right panel): 5 states, strictly linear.
 *
 *   OPEN_FOR_ALLOCATION → FULLY_ALLOCATED → DEPARTED → ARRIVED → CLOSED
 *
 * The one sub-flow on the diagram — transit legs between DEPARTED and
 * ARRIVED — is not a state. It is rows in TRANSIT_LEGS, and it gates the move
 * to ARRIVED rather than adding a stop of its own.
 *
 * There is no way back and no exception branch, because the diagram draws
 * none: a container that has left port cannot un-leave it, and a booking that
 * falls through is a new container, not a rewound one.
 *
 * The two lifecycles meet only at CLOSED: a container closes once every order
 * allocated to it has independently reached CLOSED_OUT. That precondition
 * lives in ContainersService, since it is about other rows, not this one.
 */
export const CONTAINER_TRANSITIONS: Readonly<
  Record<ContainerStatus, readonly ContainerStatus[]>
> = {
  [ContainerStatus.OPEN_FOR_ALLOCATION]: [ContainerStatus.FULLY_ALLOCATED],
  [ContainerStatus.FULLY_ALLOCATED]: [ContainerStatus.DEPARTED],
  [ContainerStatus.DEPARTED]: [ContainerStatus.ARRIVED],
  [ContainerStatus.ARRIVED]: [ContainerStatus.CLOSED],
  [ContainerStatus.CLOSED]: [],
};

export const containerStateMachine = new StateMachine<ContainerStatus>(
  'Container',
  CONTAINER_TRANSITIONS,
);

/** The 5 states in order — the walk Gate 3 is verified against. */
export const CONTAINER_HAPPY_PATH: readonly ContainerStatus[] = [
  ContainerStatus.OPEN_FOR_ALLOCATION,
  ContainerStatus.FULLY_ALLOCATED,
  ContainerStatus.DEPARTED,
  ContainerStatus.ARRIVED,
  ContainerStatus.CLOSED,
];
