"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { QueryState } from "@/components/ui/query-state";
import { api } from "@/lib/api/client";
import type { OrderSummary, Paginated } from "@/lib/api/types";
import { useUser } from "@/lib/auth/auth-context";
import { date, label, money } from "@/lib/format";

/**
 * The client's orders. The request carries no client id — the API scopes it
 * to the signed-in client, so there is nothing here that could ask for
 * someone else's.
 */
export default function PortalOrdersPage() {
  const user = useUser();

  const orders = useQuery({
    queryKey: ["orders", "mine"],
    queryFn: () => api<Paginated<OrderSummary>>("/orders?limit=100"),
  });

  return (
    <>
      <h1>My orders</h1>
      <p>Welcome, {user.name}.</p>
      <QueryState query={orders}>
        {({ data }) =>
          data.length === 0 ? (
            <p>You have no orders yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Placed</th>
                  <th>Status</th>
                  <th>Agreed price</th>
                  <th>Items</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((order) => (
                  <tr key={order.id}>
                    <td>{date(order.placedAt)}</td>
                    <td>{label(order.status)}</td>
                    <td>{money(order.agreedPrice, order.currency)}</td>
                    <td>{order._count.items}</td>
                    <td>
                      <Link href={`/portal/orders/${order.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
    </>
  );
}
