import { useEffect, useId, useRef, useState } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import { downloadFile } from "../data/download.ts";
import { Icon } from "../ui/Icon.tsx";
import type { PdfDocumentModel } from "./document.ts";

/**
 * Export, as a Menu (`rc-menu`) of two downloads, CSV and PDF, made on this device (DL-152, DL-153).
 * Funding's filter bar offers it for the list as shown, and the shortlist for the kind it shows. The
 * PDF loads its maker only when asked. With nothing to export it is not drawn at all, since a menu
 * that can only say so is a control that does nothing (Refactoring UI, empty states).
 */
export function ExportMenu({
  count,
  what,
  size,
  waiting = false,
  csv,
  pdf,
  onProblem,
}: {
  /** How many records the export takes. */
  count: number;
  /** What it takes, in a few words: "the 12 funds shown", "your 3 shortlisted initiatives". */
  what: string;
  size?: "sm";
  /** The records are still arriving, so the button waits in its place. */
  waiting?: boolean;
  csv(): Promise<{ name: string; text: string }>;
  pdf(): Promise<{ name: string; document: PdfDocumentModel }>;
  onProblem(message: string): void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [making, setMaking] = useState(false);
  const [said, setSaid] = useState("");
  const shown = waiting || count > 0;
  useEffect(() => {
    if (shown && !waiting && trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, [shown, waiting]);

  async function download(format: "csv" | "pdf") {
    onProblem("");
    setMaking(true);
    setSaid(format === "pdf" ? "Making the PDF." : "Making the CSV.");
    try {
      if (format === "csv") {
        const file = await csv();
        downloadFile(file.text, file.name, "text/csv;charset=utf-8");
      } else {
        const [file, { pdfBytes }] = await Promise.all([pdf(), import("./pdf-document.ts")]);
        downloadFile(await pdfBytes(file.document), file.name, "application/pdf");
      }
      setSaid(`Downloaded ${what} as ${format === "pdf" ? "a PDF" : "CSV"}.`);
    } catch {
      setSaid("");
      onProblem(
        format === "pdf"
          ? "Weave could not make the PDF. It needs a connection the first time; try again, or download the CSV."
          : "Weave could not make the CSV. Try again.",
      );
    } finally {
      setMaking(false);
    }
  }

  if (!shown) return null;
  if (waiting)
    return (
      <button className="rc-button" data-variant="secondary" data-size={size} data-menu type="button" disabled>
        <Icon name="download" size="sm" />
        Export
      </button>
    );
  return (
    <>
      <button
        ref={trigger}
        className="rc-button"
        data-variant="secondary"
        data-size={size}
        type="button"
        popoverTarget={id}
        aria-busy={making || undefined}
      >
        <Icon name="download" size="sm" />
        Export
      </button>
      <div className="rc-menu" ref={panel} id={id} popover="auto" data-align="end" aria-labelledby={`${id}-head`}>
        <p className="rc-menu-head" id={`${id}-head`}>
          Export {what}
        </p>
        <button className="rc-menu-item" type="button" data-close-popover disabled={making} onClick={() => void download("csv")}>
          Download CSV
        </button>
        <button className="rc-menu-item" type="button" data-close-popover disabled={making} onClick={() => void download("pdf")}>
          Download PDF
        </button>
      </div>
      <span className="rc-visually-hidden" role="status">
        {said}
      </span>
    </>
  );
}
