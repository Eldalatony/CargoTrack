"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { PackagePlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
import { Optional, Required, SectionCard } from "@/components/common/section-card";
import { Crumbs, PageContainer, PageHeader } from "@/components/layout/page";
import { AnimatePresence, motion, transitions } from "@/components/motion";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input, UnitInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { clients } from "@/lib/api/queries";
import type { Order } from "@/lib/api/types";
import { amount, parseAmount } from "@/lib/format";
import { positiveAmount, requiredText, wholeNumber } from "@/lib/schemas";
import { useAction } from "@/lib/use-action";

const nonNegative = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && parseAmount(value) >= 0, message);

const itemSchema = z.object({
  description: requiredText("Describe the item."),
  quantity: wholeNumber(1, "At least 1."),
  unitCbm: nonNegative("Enter the volume."),
  unitWeightKg: nonNegative("Enter the weight."),
  unitPrice: nonNegative("Enter the price."),
});

const schema = z.object({
  clientId: requiredText("Choose the client."),
  agreedPrice: positiveAmount("Enter the price agreed with the client."),
  currency: z.string().trim().length(3, "Three letters, e.g. USD."),
  depositPercentage: z
    .string()
    .refine((value) => Number(value) >= 15 && Number(value) <= 25, "Between 15 and 25%."),
  requiredBy: z.string(),
  items: z.array(itemSchema).min(1),
});

type Values = z.infer<typeof schema>;

const EMPTY_ITEM: Values["items"][number] = {
  description: "",
  quantity: "1",
  unitCbm: "",
  unitWeightKg: "",
  unitPrice: "",
};

export default function PlaceOrderPage() {
  const router = useRouter();
  const clientList = useQuery(clients.all());

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: "",
      agreedPrice: "",
      currency: "USD",
      depositPercentage: "20",
      requiredBy: "",
      items: [{ ...EMPTY_ITEM }],
    },
  });

  const items = useFieldArray({ control: form.control, name: "items" });
  const [currency, agreedPrice, depositPercentage] = useWatch({
    control: form.control,
    name: ["currency", "agreedPrice", "depositPercentage"],
  });
  const depositPreview = parseAmount(agreedPrice) * (Number(depositPercentage) / 100);

  const place = useAction(
    (values: Values) =>
      api<Order>("/orders", {
        method: "POST",
        body: {
          clientId: values.clientId,
          agreedPrice: parseAmount(values.agreedPrice),
          currency: values.currency.toUpperCase(),
          depositPercentage: Number(values.depositPercentage),
          ...(values.requiredBy ? { requiredBy: values.requiredBy } : {}),
          items: values.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitCbm: parseAmount(item.unitCbm),
            unitWeightKg: parseAmount(item.unitWeightKg),
            unitPrice: parseAmount(item.unitPrice),
          })),
        },
      }),
    {
      success: "Order placed",
      onDone: (order) => router.push(`/manager/orders/${order.id}`),
    },
  );

  return (
    <PageContainer className="max-w-[1040px] pt-5">
      <div className="flex flex-col gap-4">
        <Crumbs items={[{ label: "Orders", href: "/manager" }, { label: "New order" }]} />
        <PageHeader
          title="Place an order"
          description="A client asked you to buy from a factory. Record what they want and the price you agreed."
        />
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => place.mutate(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          <SectionCard title="Client and price">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      Client <Required />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="sm:max-w-[420px]">
                          <SelectValue placeholder="Choose a client…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientList.data?.data.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Not listed? <Link href="/manager/clients">Add a client</Link> first.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="agreedPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Agreed price <Required />
                    </FormLabel>
                    <FormControl>
                      <UnitInput unit={currency.toUpperCase() || "—"} placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={3}
                        className="max-w-[120px] font-mono uppercase"
                        {...field}
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="depositPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Deposit <Required />
                    </FormLabel>
                    <FormControl>
                      <UnitInput unit="%" wrapperClassName="max-w-[160px]" {...field} />
                    </FormControl>
                    <FormDescription>
                      15–25% of the price
                      {depositPreview > 0 && ` · ${amount(depositPreview)} ${currency}`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requiredBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Required by <Optional />
                    </FormLabel>
                    <FormControl>
                      <Input type="date" className="max-w-[200px]" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Items"
            description="Volume and weight per unit decide how much container space the order takes."
          >
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.fields.map((row, index) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transitions.base}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 items-start gap-3 rounded-md border border-divider bg-subtle p-3 md:grid-cols-[minmax(0,2.2fr)_90px_repeat(3,minmax(0,1fr))_auto]">
                      <FormField
                        control={form.control}
                        name={`items.${index}.description`}
                        render={({ field }) => (
                          <FormItem className="col-span-2 md:col-span-1">
                            <FormLabel className="md:sr-only">Description</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Ceramic dinner plates, 27 cm" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="md:sr-only">Quantity</FormLabel>
                            <FormControl>
                              <Input inputMode="numeric" className="text-right tabular-nums" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitCbm`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="md:sr-only">Unit CBM</FormLabel>
                            <FormControl>
                              <UnitInput unit="CBM" placeholder="0.000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitWeightKg`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="md:sr-only">Unit weight</FormLabel>
                            <FormControl>
                              <UnitInput unit="kg" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="md:sr-only">Unit price</FormLabel>
                            <FormControl>
                              <UnitInput unit={currency || "—"} placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex items-end justify-end md:h-8.5 md:items-center">
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon"
                          aria-label={`Remove item ${index + 1}`}
                          disabled={items.fields.length === 1}
                          onClick={() => items.remove(index)}
                          className="disabled:border-transparent disabled:bg-transparent"
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="hidden px-3 text-xs text-fg-tertiary md:grid md:grid-cols-[minmax(0,2.2fr)_90px_repeat(3,minmax(0,1fr))_36px] md:gap-3 md:[&>span]:px-0.5 -order-1">
                <span>Description</span>
                <span className="text-right">Quantity</span>
                <span className="text-right">Unit CBM</span>
                <span className="text-right">Unit weight</span>
                <span className="text-right">Unit price</span>
                <span />
              </div>
              <div>
                <Button type="button" variant="outline" onClick={() => items.append({ ...EMPTY_ITEM })}>
                  <PlusIcon />
                  Add item
                </Button>
              </div>
            </div>
          </SectionCard>

          <ErrorMessage error={place.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/manager">Cancel</Link>
            </Button>
            <Button type="submit" disabled={place.isPending}>
              <PackagePlusIcon />
              {place.isPending ? "Placing…" : "Place order"}
            </Button>
          </div>
        </form>
      </Form>
    </PageContainer>
  );
}
