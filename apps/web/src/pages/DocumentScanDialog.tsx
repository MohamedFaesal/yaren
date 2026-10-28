import { useEffect, useState } from "react";
import { visitDocumentIssue } from "../visitDocuments";
import { primary, secondary } from "./ui";

const scannerOrigin = "http://127.0.0.1:4738";

function scannerMessage(caught: unknown) {
  if (caught instanceof TypeError) return "The scanner on this computer could not be reached.";
  return caught instanceof Error && caught.message ? caught.message : "The scanner could not complete the scan.";
}

type ScannerDevice = { id: string; name: string };

export function DocumentScanDialog({
  title,
  onClose,
  onUse,
}: {
  title: string;
  onClose: () => void;
  onUse: (file: File) => void;
}) {
  const [devices, setDevices] = useState<ScannerDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Looking for the connected scanner…");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !scanning) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, scanning]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    void loadScanners();
    return () => {
      cancelled = true;
    };

    async function loadScanners() {
      try {
        const response = await fetch(`${scannerOrigin}/scanners`);
        const body = await response.json() as { devices?: ScannerDevice[]; error?: string };
        if (!response.ok) throw new Error(body.error || "The scanner could not be found.");
        if (cancelled) return;
        const found = body.devices ?? [];
        setDevices(found);
        const current = found[0];
        if (!current) {
          setError("No scanner is plugged in or connected over Wi-Fi.");
          setStatus("");
          return;
        }
        setDeviceId(current.id);
        await scanWith(current.id, current.name);
      } catch (caught) {
        if (!cancelled) {
          setError(scannerMessage(caught));
          setStatus("");
        }
      }
    }

    async function scanWith(id: string, name: string) {
      setScanning(true);
      setError(null);
      setStatus(`Scanning from ${name}…`);
      try {
        const response = await fetch(`${scannerOrigin}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: id }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || "The scanner could not complete the scan.");
        }
        const blob = await response.blob();
        if (cancelled) return;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const next = new File([blob], `scan-${stamp}.jpg`, { type: "image/jpeg" });
        const issue = visitDocumentIssue(next);
        if (issue) throw new Error(issue);
        setFile(next);
        setPreviewUrl((currentUrl) => {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          return URL.createObjectURL(blob);
        });
        setStatus("");
      } catch (caught) {
        if (!cancelled) {
          setError(scannerMessage(caught));
          setStatus("");
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    }
  }, []);

  const selected = devices.find((device) => device.id === deviceId) ?? devices[0];

  async function scanAgain() {
    if (!selected || scanning) return;
    setScanning(true);
    setError(null);
    setFile(null);
    setStatus(`Scanning from ${selected.name}…`);
    try {
      const response = await fetch(`${scannerOrigin}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selected.id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "The scanner could not complete the scan.");
      }
      const blob = await response.blob();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const next = new File([blob], `scan-${stamp}.jpg`, { type: "image/jpeg" });
      const issue = visitDocumentIssue(next);
      if (issue) throw new Error(issue);
      setFile(next);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setStatus("");
    } catch (caught) {
      setError(scannerMessage(caught));
      setStatus("");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div
      className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/50 px-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={() => { if (!scanning) onClose(); }}
    >
      <div
        className="triage-dialog-panel w-full max-w-lg rounded-2xl bg-surface p-5 shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="scan-title" className="text-lg font-bold text-ink">Scan {title}</h2>
        <p className="mt-1 text-sm text-muted-strong">
          {selected ? `Using the connected scanner: ${selected.name}.` : "Looking for a scanner plugged into this computer or connected over Wi-Fi."}
        </p>
        {devices.length > 1 ? (
          <label className="mt-4 block text-[13px] font-medium text-muted-strong">
            Scanner
            <select
              className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
              value={deviceId}
              disabled={scanning}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>{device.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-4 flex min-h-40 items-center justify-center overflow-hidden rounded-xl bg-ink">
          {previewUrl ? (
            <img src={previewUrl} alt="Scanned document" className="max-h-[50vh] w-full object-contain" />
          ) : (
            <p className="px-6 text-center text-sm text-white/80">{status || "The scanned page will appear here."}</p>
          )}
        </div>
        {status && previewUrl ? <p className="mt-3 text-sm text-muted-strong">{status}</p> : null}
        {error ? <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondary} disabled={scanning} onClick={onClose}>Cancel</button>
          <button type="button" className={secondary} disabled={scanning || !selected} onClick={() => void scanAgain()}>Scan again</button>
          <button type="button" className={`${primary} !text-white`} disabled={!file || scanning} onClick={() => { if (file) onUse(file); }}>Use scan</button>
        </div>
      </div>
    </div>
  );
}
