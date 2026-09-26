import { SectionCard } from "@/components/common/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Order } from "@/lib/api/types";
import { decimal, money } from "@/lib/format";

/** What was bought. Totals come from the order; quantities right-align. */
export function OrderItemsSection({
  order,
  showLogistics = true,
}: {
  order: Order;
  /** Unit CBM and weight columns — the client only needs price. */
  showLogistics?: boolean;
}) {
  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <SectionCard id="items" title="Items" flush>
      <Table style={{ minWidth: showLogistics ? 640 : 420 }}>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            {showLogistics && <TableHead className="text-right">Unit CBM</TableHead>}
            {showLogistics && <TableHead className="text-right">Unit weight</TableHead>}
            <TableHead className="text-right">Unit price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {order.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.description}</TableCell>
              <TableCell className="text-right">{item.quantity.toLocaleString("en-US")}</TableCell>
              {showLogistics && (
                <TableCell className="text-right">{decimal(item.unitCbm, 4)}</TableCell>
              )}
              {showLogistics && (
                <TableCell className="text-right">{decimal(item.unitWeightKg)} kg</TableCell>
              )}
              <TableCell className="text-right whitespace-nowrap">
                {money(item.unitPrice, order.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="text-fg-secondary">Order total</TableCell>
            <TableCell className="text-right">{totalQuantity.toLocaleString("en-US")}</TableCell>
            {showLogistics && (
              <TableCell className="text-right whitespace-nowrap">
                {decimal(order.totalCbm, 2)} CBM
              </TableCell>
            )}
            {showLogistics && (
              <TableCell className="text-right whitespace-nowrap">
                {decimal(order.totalWeightKg, 1)} kg
              </TableCell>
            )}
            <TableCell className="text-right whitespace-nowrap">
              {money(order.agreedPrice, order.currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </SectionCard>
  );
}
