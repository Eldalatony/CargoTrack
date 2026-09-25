"use client";

import { useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { download } from "@/lib/api/client";
import type { CargoDocument, Role } from "@/lib/api/types";
import { date, label } from "@/lib/format";

/**
 * Documents with their download action.
 *
 * For a client, a withheld document keeps its row and its button — disabled,
 * with the reason beside it ("Withheld until the balance payment clears
 * (8,000.00 USD outstanding)"). A missing button would read as "no document";
 * this reads as "your document is here, and this is what releases it".
 *
 * The office always has the file, and sees what the client sees beside it.
 */
export function DocumentTable({
  documents,
  viewer,
}: {
  documents: CargoDocument[];
  viewer: Role;
}) {
  const [error, setError] = useState<unknown>(null);

  if (documents.length === 0) {
    return <p>No documents yet.</p>;
  }

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

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Version</th>
            <th>Uploaded</th>
            <th>Released to client</th>
            <th>{viewer === "CLIENT" ? "Download" : "Client access"}</th>
            {viewer === "OFFICE_MANAGER" && <th>File</th>}
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id} data-withheld={document.withheld}>
              <td>{label(document.docType)}</td>
              <td>
                v{document.version}
                {document.isCurrent ? "" : " (superseded)"}
              </td>
              <td>{date(document.createdAt)}</td>
              <td>{date(document.releasedToClientAt)}</td>
              <td>
                {viewer === "CLIENT" ? (
                  <>
                    <button
                      type="button"
                      disabled={document.withheld}
                      onClick={() => fetchFile(document)}
                    >
                      {document.withheld ? "Download unavailable" : "Download"}
                    </button>
                    {document.withheld && (
                      <>
                        <br />
                        Pending: {document.withheldReason}
                      </>
                    )}
                  </>
                ) : document.withheld ? (
                  `Withheld — ${document.withheldReason}`
                ) : (
                  "Released"
                )}
              </td>
              {viewer === "OFFICE_MANAGER" && (
                <td>
                  <button type="button" onClick={() => fetchFile(document)}>
                    Download
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorMessage error={error} />
    </>
  );
}
