import type { Settlement } from "@/lib/api/types";
import { money } from "@/lib/format";

export function SettlementSummary({ settlement }: { settlement: Settlement }) {
  const { currency } = settlement;

  return (
    <table>
      <tbody>
        <tr>
          <th>Agreed price</th>
          <td>{money(settlement.agreedPrice, currency)}</td>
        </tr>
        <tr>
          <th>Deposit required</th>
          <td>{money(settlement.depositRequired, currency)}</td>
        </tr>
        <tr>
          <th>Deposit received</th>
          <td>
            {money(settlement.depositReceived, currency)}{" "}
            {settlement.depositMet ? "(met)" : "(not met)"}
          </td>
        </tr>
        <tr>
          <th>Collected</th>
          <td>{money(settlement.collected, currency)}</td>
        </tr>
        <tr>
          <th>Balance due</th>
          <td>
            {money(settlement.balanceDue, currency)}{" "}
            {settlement.paidInFull ? "(paid in full)" : "(outstanding)"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
