"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ContainerIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
import { Required, SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api/client";
import { parseAmount } from "@/lib/format";
import {
  CONTAINER_TYPES,
  DESTINATION_PORTS,
  ORIGIN_PORTS,
  type ContainerType,
} from "@/lib/ports";
import { positiveAmount, requiredText } from "@/lib/schemas";
import { useAction } from "@/lib/use-action";

const schema = z.object({
  containerRef: requiredText("Enter the container reference."),
  containerType: z.enum(Object.keys(CONTAINER_TYPES) as [ContainerType, ...ContainerType[]]),
  capacityCbm: positiveAmount("Enter the volume limit."),
  capacityWeightKg: positiveAmount("Enter the weight limit."),
  originPort: requiredText("Choose the origin port."),
  destinationPort: requiredText("Choose the destination port."),
  routeType: z.enum(["DIRECT", "TRANSIT"]),
});

type Values = z.infer<typeof schema>;

const BLANK: Values = {
  containerRef: "",
  containerType: "40HC",
  capacityCbm: CONTAINER_TYPES["40HC"].cbm,
  capacityWeightKg: CONTAINER_TYPES["40HC"].kg,
  originPort: "Ningbo",
  destinationPort: "Alexandria",
  routeType: "DIRECT",
};

/** Opens a new box. It starts Open for allocation; the capacity guard uses these limits. */
export function OpenContainerForm() {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: BLANK });

  const create = useAction(
    (values: Values) =>
      api("/containers", {
        method: "POST",
        body: {
          ...values,
          containerRef: values.containerRef.toUpperCase(),
          capacityCbm: parseAmount(values.capacityCbm),
          capacityWeightKg: parseAmount(values.capacityWeightKg),
        },
      }),
    {
      success: (_, values) => `${values.containerRef.toUpperCase()} is open for allocation`,
      onDone: () => form.reset(BLANK),
    },
  );

  return (
    <SectionCard
      id="open-container"
      title="Open a container"
      description="It starts as Open for allocation. The capacity guard uses the limits you set here."
      bodyClassName="p-0"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => create.mutate(values))} noValidate>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4 p-4">
            <FormField
              control={form.control}
              name="containerRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Reference <Required />
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="TGHU-9920355"
                      className="font-mono uppercase"
                      {...field}
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>As painted on the box, e.g. MSKU-4471820</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="containerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value: ContainerType) => {
                      field.onChange(value);
                      form.setValue("capacityCbm", CONTAINER_TYPES[value].cbm);
                      form.setValue("capacityWeightKg", CONTAINER_TYPES[value].kg);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(CONTAINER_TYPES) as ContainerType[]).map((type) => (
                        <SelectItem key={type} value={type}>
                          {CONTAINER_TYPES[type].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Fills in the typical capacity</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacityCbm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Volume limit <Required />
                  </FormLabel>
                  <FormControl>
                    <UnitInput unit="CBM" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacityWeightKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Weight limit <Required />
                  </FormLabel>
                  <FormControl>
                    <UnitInput unit="kg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="originPort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Origin port</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ORIGIN_PORTS.map((port) => (
                        <SelectItem key={port} value={port}>
                          {port}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="destinationPort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination port</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DESTINATION_PORTS.map((port) => (
                        <SelectItem key={port} value={port}>
                          {port}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="routeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Route</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      aria-label="Route"
                      className="w-full"
                      value={field.value}
                      onValueChange={(value) => value && field.onChange(value)}
                    >
                      <ToggleGroupItem value="DIRECT">Direct</ToggleGroupItem>
                      <ToggleGroupItem value="TRANSIT">Via transit</ToggleGroupItem>
                    </ToggleGroup>
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          {create.error ? <ErrorMessage error={create.error} className="mx-4 mb-4" /> : null}
          <CardFooter className="justify-end">
            <Button type="button" variant="outline" onClick={() => form.reset(BLANK)}>
              Clear
            </Button>
            <Button type="submit" disabled={create.isPending}>
              <ContainerIcon />
              Open container
            </Button>
          </CardFooter>
        </form>
      </Form>
    </SectionCard>
  );
}
