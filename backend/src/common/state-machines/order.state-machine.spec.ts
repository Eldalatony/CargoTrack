import { UnprocessableEntityException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import {
  ORDER_HAPPY_PATH,
  ORDER_TRANSITIONS,
  orderStateMachine,
} from './order.state-machine';

describe('orderStateMachine', () => {
  const allStatuses = Object.values(OrderStatus);

  it('covers every OrderStatus in the enum', () => {
    // A status added to the schema without a transition rule would otherwise
    // silently become an unreachable dead end.
    expect(orderStateMachine.states().sort()).toEqual([...allStatuses].sort());
  });

  it('never lists a target that is not a real status', () => {
    for (const targets of Object.values(ORDER_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStatuses).toContain(target);
      }
    }
  });

  describe('the happy path', () => {
    it('walks all 8 states end to end', () => {
      for (let i = 0; i < ORDER_HAPPY_PATH.length - 1; i += 1) {
        const from = ORDER_HAPPY_PATH[i];
        const to = ORDER_HAPPY_PATH[i + 1];

        expect(orderStateMachine.can(from, to)).toBe(true);
      }
    });

    it('has 8 states', () => {
      expect(ORDER_HAPPY_PATH).toHaveLength(8);
    });

    it('starts at ORDER_PLACED and ends at CLOSED_OUT', () => {
      expect(ORDER_HAPPY_PATH[0]).toBe(OrderStatus.ORDER_PLACED);
      expect(ORDER_HAPPY_PATH[ORDER_HAPPY_PATH.length - 1]).toBe(
        OrderStatus.CLOSED_OUT,
      );
    });
  });

  describe('invalid transitions', () => {
    it('rejects skipping a state', () => {
      expect(() =>
        orderStateMachine.assert(
          OrderStatus.ORDER_PLACED,
          OrderStatus.IN_TRANSIT,
        ),
      ).toThrow(UnprocessableEntityException);
    });

    it('rejects moving backwards', () => {
      expect(() =>
        orderStateMachine.assert(
          OrderStatus.DELIVERED,
          OrderStatus.ORDER_PLACED,
        ),
      ).toThrow(UnprocessableEntityException);
    });

    it('rejects any move out of a terminal state', () => {
      for (const target of allStatuses) {
        expect(() =>
          orderStateMachine.assert(OrderStatus.CLOSED_OUT, target),
        ).toThrow(UnprocessableEntityException);
      }
    });

    it('rejects a no-op transition', () => {
      expect(() =>
        orderStateMachine.assert(
          OrderStatus.IN_TRANSIT,
          OrderStatus.IN_TRANSIT,
        ),
      ).toThrow(/already IN_TRANSIT/);
    });

    it('answers 422, not 400 - the request is valid, the state is not', () => {
      const attempt = () =>
        orderStateMachine.assert(
          OrderStatus.ORDER_PLACED,
          OrderStatus.CLOSED_OUT,
        );

      expect(attempt).toThrow(UnprocessableEntityException);

      try {
        attempt();
      } catch (error) {
        expect((error as UnprocessableEntityException).getStatus()).toBe(422);
      }
    });

    it('names the legal targets in the error', () => {
      expect(() =>
        orderStateMachine.assert(
          OrderStatus.ORDER_PLACED,
          OrderStatus.DELIVERED,
        ),
      ).toThrow(
        /Valid transitions from ORDER_PLACED: ORDER_CONFIRMED, CANCELLED/,
      );
    });
  });

  describe('exception branches', () => {
    it('lets a cancelled order go nowhere', () => {
      expect(orderStateMachine.isTerminal(OrderStatus.CANCELLED)).toBe(true);
    });

    it('lets an unfulfillable order be re-sourced or cancelled', () => {
      expect(
        orderStateMachine.targetsFrom(OrderStatus.FACTORY_CANNOT_FULFIL),
      ).toEqual([OrderStatus.ORDER_PLACED, OrderStatus.CANCELLED]);
    });

    it('lets a QC rejection close out against a refund', () => {
      expect(
        orderStateMachine.can(OrderStatus.QC_REJECTED, OrderStatus.CLOSED_OUT),
      ).toBe(true);
    });

    it('lets withheld documents rejoin the happy path once payment clears', () => {
      expect(
        orderStateMachine.targetsFrom(OrderStatus.DOCUMENTS_WITHHELD),
      ).toEqual([OrderStatus.CLOSED_OUT]);
    });

    it('reaches every exception branch from somewhere', () => {
      const reachable = new Set(Object.values(ORDER_TRANSITIONS).flat());

      for (const branch of [
        OrderStatus.CANCELLED,
        OrderStatus.FACTORY_CANNOT_FULFIL,
        OrderStatus.QC_REJECTED,
        OrderStatus.DOCUMENTS_WITHHELD,
      ]) {
        expect(reachable.has(branch)).toBe(true);
      }
    });
  });
});
