"use client";

import { CircleCheckIcon, DownloadIcon, FileTextIcon, HistoryIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { ErrorMessage } from "@/components/common/error-message";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { download } from "@/lib/api/client";
import type { CargoDocument } from "@/lib/api/types";
import { date, label } from "@/lib/format";
import { cn } from "@/lib/utils";

function useDownload() {
  const [error, setError] = useState<unknown>(null);

  async function fetchFile(document: CargoDocument) {
    setError(null);
    try {
      await download(
        `/documents/${document.id}/file`,
        `${document.docType.toLowerCase()}-v${document.version}.pdf`,
      );
    } catch (caught) {
      setError(caught);
    }
  }

  return { error, fetchFile };
}

/**
 * The office view of an order's documents: every version, what the client
 * can see beside each, and the file itself (the office always has it).
 */
export function OfficeDocumentTable({ documents }: { documents: CargoDocument[] }) {
  const { error, fetchFile } = useDownload();

  if (documents.length === 0) {
    return <p className="m-0 text-sm text-fg-secondary">No documents yet.</p>;
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-border">
        <Table style={{ minWidth: 760 }}>
          <TableHeader>
            <TableRow>
              <TableHead>Document type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Released to client</TableHead>
              <TableHead>Client access</TableHead>
              <TableHead>
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => {
              const superseded = !document.isCurrent;
              return (
                <TableRow key={document.id} className={cn(superseded && "text-fg-tertiary")}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {label(document.docType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    v{document.version}
                  </TableCell>
                  <TableCell className="text-fg-secondary tabular-nums">
                    {date(document.createdAt)}
                  </TableCell>
                  <TableCell className="text-fg-secondary tabular-nums">
                    {date(document.releasedToClientAt)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex max-w-[360px] items-start gap-1.5 text-sm text-pretty",
                        superseded
                          ? "text-fg-tertiary"
                          : document.withheld
                            ? "font-medium text-warning-text"
                            : "text-success-text",
                      )}
                    >
                      {superseded ? (
                        <HistoryIcon className="mt-0.5 size-3.5 shrink-0" />
                      ) : document.withheld ? (
                        <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                      ) : (
                        <CircleCheckIcon className="mt-0.5 size-3.5 shrink-0" />
                      )}
                      {superseded
                        ? "Superseded by a newer version"
                        : document.withheld
                          ? (document.withheldReason ?? "Withheld until the balance is paid")
                          : "Released"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Download ${label(document.docType)} v${document.version}`}
                      onClick={() => fetchFile(document)}
                    >
                      <DownloadIcon />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ErrorMessage error={error} />
    </>
  );
}

/** A compact document list (container documents in the office). */
export function DocumentList({ documents }: { documents: CargoDocument[] }) {
  const { error, fetchFile } = useDownload();

  return (
    <>
      <ul className="m-0 list-none p-0">
        {documents.length === 0 && (
          <li className="px-4 py-5 text-sm text-fg-secondary">No documents yet.</li>
        )}
        {documents.map((document) => (
          <li
            key={document.id}
            className={cn(
              "flex items-center gap-3 border-b border-divider px-4 py-2.5 last:border-b-0",
              !document.isCurrent && "text-fg-tertiary",
            )}
          >
            <FileTextIcon className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{label(document.docType)}</div>
              <div className="truncate text-xs text-fg-tertiary">
                v{document.version}
                {!document.isCurrent && " · superseded"} · uploaded {date(document.createdAt)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Download ${label(document.docType)} v${document.version}`}
              onClick={() => fetchFile(document)}
            >
              <DownloadIcon />
              Download
            </Button>
          </li>
        ))}
      </ul>
      <ErrorMessage error={error} className="m-4" />
    </>
  );
}

/**
 * The client's documents. A withheld document keeps its row and its button
 * — disabled, with the reason beside it. A missing button would read as
 * "no document"; this reads as "it's here, and this is what releases it".
 */
export function ClientDocumentList({ documents }: { documents: CargoDocument[] }) {
  const { error, fetchFile } = useDownload();
  const current = documents.filter((document) => document.isCurrent);

  return (
    <>
      <ul className="m-0 list-none p-0">
        {current.length === 0 && (
          <li className="px-4 py-5 text-sm text-fg-secondary">
            Your documents will appear here once we upload them.
          </li>
        )}
        {current.map((document) => (
          <li
            key={document.id}
            className="flex min-h-14 items-center gap-3 border-b border-divider px-4 py-2.5 last:border-b-0"
          >
            {document.withheld ? (
              <LockIcon className="size-[18px] shrink-0 text-warning-text" aria-hidden />
            ) : (
              <FileTextIcon className="size-[18px] shrink-0 text-fg-tertiary" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div>{label(document.docType)}</div>
              {document.withheld && (
                <div className="text-xs text-fg-secondary">
                  {document.withheldReason ?? "Released after payment"}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              disabled={document.withheld}
              aria-label={
                document.withheld
                  ? `${label(document.docType)} is released after payment`
                  : `Download ${label(document.docType)}`
              }
              onClick={() => fetchFile(document)}
            >
              {document.withheld ? <LockIcon /> : <DownloadIcon />}
            </Button>
          </li>
        ))}
      </ul>
      <ErrorMessage error={error} className="m-4" />
    </>
  );
}
