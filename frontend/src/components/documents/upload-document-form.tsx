"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileTextIcon, UploadIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import type { CargoDocument, DocumentType } from "@/lib/api/types";
import { label } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const DOCUMENT_TYPES = [
  "BILL_OF_LADING",
  "PACKING_LIST",
  "COMMERCIAL_INVOICE",
  "CERTIFICATE_OF_ORIGIN",
  "CUSTOMS_DECLARATION",
  "INSURANCE_CERTIFICATE",
  "QC_REPORT",
  "OTHER",
] as const satisfies readonly DocumentType[];

const NEW_DOCUMENT = "new";
const MAX_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  docType: z.enum(DOCUMENT_TYPES),
  supersedesId: z.string(),
  file: z
    .instanceof(File, { message: "Choose a file to upload." })
    .refine((file) => file.size <= MAX_BYTES, "That file is over 10 MB."),
});

type Values = z.infer<typeof schema>;

/**
 * Upload a document or a new version of one. A new version inherits its
 * order and container from the one it replaces.
 */
export function UploadDocumentForm({
  orderId,
  containerId,
  current,
  onDone,
}: {
  orderId?: string;
  containerId?: string;
  current: CargoDocument[];
  onDone?: () => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { docType: "BILL_OF_LADING", supersedesId: NEW_DOCUMENT },
  });

  const [docType, file] = useWatch({ control: form.control, name: ["docType", "file"] });
  const replaceable = current.filter((doc) => doc.isCurrent && doc.docType === docType);

  const upload = useAction(
    (values: Values) => {
      const body = new FormData();
      body.append("file", values.file);
      body.append("docType", values.docType);
      if (values.supersedesId !== NEW_DOCUMENT) {
        body.append("supersedesId", values.supersedesId);
      } else {
        if (orderId) body.append("orderId", orderId);
        if (containerId) body.append("containerId", containerId);
      }
      return api("/documents", { method: "POST", form: body });
    },
    {
      success: (_, values) => `${label(values.docType)} uploaded`,
      onDone: () => {
        form.reset({ docType: form.getValues("docType"), supersedesId: NEW_DOCUMENT });
        onDone?.();
      },
    },
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => upload.mutate(values))}
        className="flex flex-col gap-3"
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="docType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue("supersedesId", NEW_DOCUMENT);
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {label(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="supersedesId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Replaces</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NEW_DOCUMENT}>Nothing — new document</SelectItem>
                    {replaceable.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {label(doc.docType)} v{doc.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Pick the version this one supersedes</FormDescription>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="file"
          render={({ field, fieldState }) => (
            <FormItem>
              <label
                className={cn(
                  "flex cursor-pointer flex-wrap items-center gap-3 rounded-md border border-dashed bg-surface px-3.5 py-3 transition-colors duration-150 hover:bg-hover",
                  fieldState.error ? "border-danger-solid" : "border-strong",
                )}
              >
                {file ? (
                  <FileTextIcon className="size-[18px] text-fg-tertiary" aria-hidden />
                ) : (
                  <UploadIcon className="size-[18px] text-fg-tertiary" aria-hidden />
                )}
                <div className="min-w-[200px] flex-1">
                  <div className="truncate text-sm">{file ? file.name : "Choose a file to upload"}</div>
                  <div className="text-xs text-fg-tertiary">PDF, JPEG, PNG or WebP · up to 10 MB</div>
                </div>
                <span className="inline-flex h-7 items-center rounded-md border border-strong bg-surface px-2.5 text-xs font-medium">
                  Choose file
                </span>
                <FormControl>
                  <input
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    disabled={field.disabled}
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => field.onChange(event.target.files?.[0])}
                  />
                </FormControl>
              </label>
              <FormMessage />
            </FormItem>
          )}
        />

        <ErrorMessage error={upload.error} />
        <div>
          <Button type="submit" variant="outline" disabled={upload.isPending}>
            <UploadIcon />
            {upload.isPending ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
