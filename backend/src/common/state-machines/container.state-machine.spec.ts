import { UnprocessableEntityException } from '@nestjs/common';
import { ContainerStatus, StockStatus } from '@prisma/client';

import {
  CONTAINER_HAPPY_PATH,
  CONTAINER_TRANSITIONS,
  containerStateMachine,
} from './container.state-machine';
import { stockRecordStateMachine } from './stock-record.state-machine';

describe('containerStateMachine', () => {
  const allStatuses = Object.values(ContainerStatus);

  it('covers every ContainerStatus in the enum', () => {
    expect(containerStateMachine.states().sort()).toEqual(
      [...allStatuses].sort(),
    );
  });

  it('never lists a target that is not a real status', () => {
    for (const targets of Object.values(CONTAINER_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStatuses).toContain(target);
      }
    }
  });

  it('walks all 5 states end to end', () => {
    expect(CONTAINER_HAPPY_PATH).toHaveLength(5);

    for (let i = 0; i < CONTAINER_HAPPY_PATH.length - 1; i += 1) {
      expect(
        containerStateMachine.can(
          CONTAINER_HAPPY_PATH[i],
          CONTAINER_HAPPY_PATH[i + 1],
        ),
      ).toBe(true);
    }
  });

  it('is strictly linear — one way forward from every state', () => {
    for (const status of allStatuses) {
      expect(containerStateMachine.targetsFrom(status).length).toBeLessThan(2);
    }
  });

  it('refuses to skip straight from allocation to arrival', () => {
    expect(() =>
      containerStateMachine.assert(
        ContainerStatus.OPEN_FOR_ALLOCATION,
        ContainerStatus.ARRIVED,
      ),
    ).toThrow(UnprocessableEntityException);
  });

  it('refuses to reopen a container that has departed', () => {
    expect(() =>
      containerStateMachine.assert(
        ContainerStatus.DEPARTED,
        ContainerStatus.OPEN_FOR_ALLOCATION,
      ),
    ).toThrow(/Valid transitions from DEPARTED: ARRIVED/);
  });

  it('treats CLOSED as terminal', () => {
    expect(containerStateMachine.isTerminal(ContainerStatus.CLOSED)).toBe(true);
  });
});

describe('stockRecordStateMachine', () => {
  it('lets a hold be lifted without the goods leaving', () => {
    expect(
      stockRecordStateMachine.can(StockStatus.ON_HOLD, StockStatus.IN_STOCK),
    ).toBe(true);
  });

  it('releases from stock or from hold', () => {
    expect(
      stockRecordStateMachine.can(StockStatus.IN_STOCK, StockStatus.RELEASED),
    ).toBe(true);
    expect(
      stockRecordStateMachine.can(StockStatus.ON_HOLD, StockStatus.RELEASED),
    ).toBe(true);
  });

  it('treats RELEASED as final', () => {
    expect(stockRecordStateMachine.isTerminal(StockStatus.RELEASED)).toBe(true);
  });
});
