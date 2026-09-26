"use client";

import type { UseQueryResult } from "@tanstack/react-query";

import { LoadingLines, QueryState } from "@/components/common/query-state";
import { AddBox, SectionCard } from "@/components/common/section-card";
import type { CargoDocument, Paginated } from "@/lib/api/types";
import { OfficeDocumentTable } from "./document-table";
import { UploadDocumentForm } from "./upload-document-form";

/** An order's documents in the office, with upload and new versions. */
export function DocumentsSection({
  orderId,
  query,
}: {
  orderId: string;
  query: UseQueryResult<Paginated<CargoDocument>>;
}) {
  return (
    <SectionCard id="documents" title="Documents">
      <QueryState query={query} loading={<LoadingLines rows={3} />}>
        {({ data }) => (
          <>
            <OfficeDocumentTable documents={data} />
            <AddBox title="Upload a document">
              <UploadDocumentForm orderId={orderId} current={data} />
            </AddBox>
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}
