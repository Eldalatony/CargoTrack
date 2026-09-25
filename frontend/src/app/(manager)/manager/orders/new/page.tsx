"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api/client";
import type { Client, Order, Paginated } from "@/lib/api/types";
import { useAction } from "@/lib/use-action";

interface ItemRow {
  description: string;
  quantity: string;
  unitCbm: string;
  unitWeightKg: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemRow = {
  description: "",
  quantity: "1",
  unitCbm: "",
  unitWeightKg: "",
  unitPrice: "",
};

export default function PlaceOrderPage() {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [depositPercentage, setDepositPercentage] = useState("20");
  const [requiredBy, setRequiredBy] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);

  const clients = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => api<Paginated<Client>>("/clients?limit=100"),
  });

  const place = useAction(
    () =>
      api<Order>("/orders", {
        method: "POST",
        body: {
          clientId,
          agreedPrice: Number(agreedPrice),
          currency,
          depositPercentage: Number(depositPercentage),
          ...(requiredBy ? { requiredBy } : {}),
          items: items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitCbm: Number(item.unitCbm),
            unitWeightKg: Number(item.unitWeightKg),
            unitPrice: Number(item.unitPrice),
          })),
        },
      }),
    (order) => router.push(`/manager/orders/${order.id}`),
  );

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  return (
    <>
      <h1>Place an order</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          place.mutate();
        }}
      >
        <Field label="Client">
          <select
            required
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="">Choose a client…</option>
            {clients.data?.data.map((client) => (
              <option key={client.id} value={client.id}>
                {client.companyName}
              </option>
            ))}
          </select>
        </Field>
        <Link href="/manager/clients">Add a client</Link>
        <br />
        <Field label="Agreed price">
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={agreedPrice}
            onChange={(event) => setAgreedPrice(event.target.value)}
          />
        </Field>
        <Field label="Currency">
          <input
            required
            maxLength={3}
            size={4}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Deposit % (15–25)">
          <input
            type="number"
            step="0.01"
            min="15"
            max="25"
            required
            value={depositPercentage}
            onChange={(event) => setDepositPercentage(event.target.value)}
          />
        </Field>
        <Field label="Required by (optional)">
          <input
            type="date"
            value={requiredBy}
            onChange={(event) => setRequiredBy(event.target.value)}
          />
        </Field>

        <fieldset>
          <legend>Items</legend>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit CBM</th>
                <th>Unit weight (kg)</th>
                <th>Unit price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index}>
                  <td>
                    <input
                      required
                      aria-label="Description"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      aria-label="Quantity"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(index, "quantity", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      required
                      aria-label="Unit CBM"
                      value={item.unitCbm}
                      onChange={(e) =>
                        updateItem(index, "unitCbm", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      required
                      aria-label="Unit weight (kg)"
                      value={item.unitWeightKg}
                      onChange={(e) =>
                        updateItem(index, "unitWeightKg", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      aria-label="Unit price"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(index, "unitPrice", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems((rows) => rows.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setItems((rows) => [...rows, { ...EMPTY_ITEM }])}
          >
            Add item
          </button>
        </fieldset>

        <button type="submit" disabled={place.isPending}>
          {place.isPending ? "Placing…" : "Place order"}
        </button>
      </form>
      <ErrorMessage error={place.error} />
    </>
  );
}
