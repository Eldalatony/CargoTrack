"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { DocumentTable } from "@/components/documents/document-table";
import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { QueryState } from "@/components/ui/query-state";
import { api } from "@/lib/api/client";
import type { CargoDocument, DocumentType, Paginated } from "@/lib/api/types";
import { label } from "@/lib/format";
import { useAction } from "@/lib/use-action";

const DOCUMENT_TYPES: DocumentType[] = [
  "BILL_OF_LADING",
  "PACKING_LIST",
  "COMMERCIAL_INVOICE",
  "CERTIFICATE_OF_ORIGIN",
  "CUSTOMS_DECLARATION",
  "INSURANCE_CERTIFICATE",
  "QC_REPORT",
  "OTHER",
];

/** Documents on an order or a container, with upload and new versions. */
export function DocumentsPanel({
  orderId,
  containerId,
}: {
  orderId?: string;
  containerId?: string;
}) {
  const filter = orderId ? `orderId=${orderId}` : `containerId=${containerId}`;

  const documents = useQuery({
    queryKey: ["documents", filter],
    queryFn: () => api<Paginated<CargoDocument>>(`/documents?${filter}&limit=100`),
  });

  return (
    <QueryState query={documents}>
      {({ data }) => (
        <>
          <DocumentTable documents={data} viewer="OFFICE_MANAGER" />
          <UploadDocument
            orderId={orderId}
            containerId={containerId}
            current={data.filter((doc) => doc.isCurrent)}
          />
        </>
      )}
    </QueryState>
  );
}

function UploadDocument({
  orderId,
  containerId,
  current,
}: {
  orderId?: string;
  containerId?: string;
  current: CargoDocument[];
}) {
  const [docType, setDocType] = useState<DocumentType>("BILL_OF_LADING");
  const [supersedesId, setSupersedesId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const replaceable = current.filter((doc) => doc.docType === docType);

  const upload = useAction(() => {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      return Promise.reject(new Error("Choose a file to upload"));
    }

    const form = new FormData();
    form.append("file", file);
    form.append("docType", docType);

    // A new version inherits its order and container from the one it replaces.
    if (supersedesId) {
      form.append("supersedesId", supersedesId);
    } else {
      if (orderId) form.append("orderId", orderId);
      if (containerId) form.append("containerId", containerId);
    }

    return api("/documents", { method: "POST", form }).then(() => {
      setSupersedesId("");
      if (fileInput.current) fileInput.current.value = "";
    });
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        upload.mutate();
      }}
    >
      <h4>Upload a document</h4>
      <Field label="Type">
        <select
          value={docType}
          onChange={(event) => {
            setDocType(event.target.value as DocumentType);
            setSupersedesId("");
          }}
        >
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {label(type)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Replaces">
        <select
          value={supersedesId}
          onChange={(event) => setSupersedesId(event.target.value)}
        >
          <option value="">Nothing — a new document</option>
          {replaceable.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {label(doc.docType)} v{doc.version}
            </option>
          ))}
        </select>
      </Field>
      <Field label="File (PDF, JPEG, PNG or WebP, up to 10 MB)">
        <input
          ref={fileInput}
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
        />
      </Field>
      <button type="submit" disabled={upload.isPending}>
        Upload
      </button>
      <ErrorMessage error={upload.error} />
    </form>
  );
}
