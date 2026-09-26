"use client";

import { useQuery } from "@tanstack/react-query";
import { ContainerIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingLines, QueryState } from "@/components/common/query-state";
import { containerColumns } from "@/components/containers/container-columns";
import { OpenContainerForm } from "@/components/containers/open-container-form";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { containers } from "@/lib/api/queries";

export default function ContainersPage() {
  const router = useRouter();
  const list = useQuery(containers.list());

  return (
    <PageContainer>
      <PageHeader
        title="Containers"
        description="Consolidated boxes: several clients share each one, up to its CBM and weight limits."
        actions={
          <Button asChild>
            <a href="#open-container">
              <PlusIcon />
              Open a container
            </a>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <QueryState query={list} loading={<LoadingLines rows={6} />}>
          {({ data }) => (
            <>
              <DataTable
                columns={containerColumns}
                data={data}
                minWidth={820}
                initialSorting={[{ id: "ref", desc: false }]}
                onRowClick={(container) => router.push(`/manager/containers/${container.id}`)}
                empty={
                  <EmptyState
                    icon={ContainerIcon}
                    title="No containers yet"
                    description="Open a container when you book one; then allocate orders to it until it’s full."
                  />
                }
              />
              <div className="flex flex-wrap justify-between gap-3 px-4 py-2.5 text-sm text-fg-secondary tabular-nums">
                <span>
                  {data.length} {data.length === 1 ? "container" : "containers"} ·{" "}
                  {data.filter((c) => c.status === "OPEN_FOR_ALLOCATION").length} open for allocation
                </span>
                <span className="inline-flex gap-3.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-2.5 rounded-[2px] bg-brand" />
                    CBM
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-2.5 rounded-[2px] bg-weight-bar" />
                    Weight
                  </span>
                </span>
              </div>
            </>
          )}
        </QueryState>
      </Card>

      <OpenContainerForm />
    </PageContainer>
  );
}
