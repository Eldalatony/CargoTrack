"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { ErrorMessage } from "@/components/common/error-message";
import { LoadingPage } from "@/components/common/query-state";
import { ContainerStatusBadge } from "@/components/common/status-badge";
import { CapacityCard } from "@/components/containers/capacity-card";
import {
  AllocationsCard,
  ContainerDocumentsCard,
  ContainerStatusCard,
  TransitLegsCard,
} from "@/components/containers/container-sections";
import { Crumbs, PageContainer, PageHeader } from "@/components/layout/page";
import { Stagger, StaggerItem } from "@/components/motion";
import { StatusHistoryCard } from "@/components/orders/status-history";
import { containers } from "@/lib/api/queries";
import { CONTAINER_STATUS } from "@/lib/status";

export default function ContainerPage() {
  const { id } = useParams<{ id: string }>();
  const container = useQuery(containers.detail(id));
  const history = useQuery(containers.history(id));

  if (container.isPending) {
    return <LoadingPage />;
  }

  if (container.isError) {
    return (
      <PageContainer>
        <ErrorMessage error={container.error} />
      </PageContainer>
    );
  }

  const data = container.data;

  return (
    <PageContainer className="pt-5">
      <div className="flex flex-col gap-1.5">
        <Crumbs
          items={[
            { label: "Containers", href: "/manager/containers" },
            { label: data.containerRef, mono: true },
          ]}
        />
        <PageHeader
          title={
            <>
              <span className="font-mono font-medium">{data.containerRef}</span> —{" "}
              {CONTAINER_STATUS[data.status].label}
            </>
          }
          description={`${data.containerType} · ${data.originPort} → ${data.destinationPort} · ${data.routeType === "TRANSIT" ? "Via transit" : "Direct"}`}
        >
          <ContainerStatusBadge status={data.status} />
        </PageHeader>
      </div>

      <Stagger className="flex flex-col gap-5">
        <StaggerItem>
          <CapacityCard container={data} />
        </StaggerItem>
        <StaggerItem>
          <ContainerStatusCard container={data} history={history.data ?? []} />
        </StaggerItem>
        <StaggerItem>
          <AllocationsCard container={data} />
        </StaggerItem>
        <StaggerItem className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-start gap-5">
          <TransitLegsCard container={data} />
          <ContainerDocumentsCard containerId={data.id} />
        </StaggerItem>
        <StaggerItem>
          <StatusHistoryCard history={history.data ?? []} reasonHeader="Note" />
        </StaggerItem>
      </Stagger>
    </PageContainer>
  );
}
