import { useState } from "react";

const UploadBox = ({ onFileSelect, consent, onConsentChange }) => {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");

  const MAX_SIZE = 5 * 1024 * 1024;

  const handle = (f) => {
    setErr("");
    if (!f) return;

    if (!consent) {
      setErr("Please confirm the consent notice before uploading your resume.");
      return;
    }

    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErr("Only PDF files are allowed.");
      return;
    }

    if (f.size > MAX_SIZE) {
      setErr("File too large. Max 5MB allowed.");
      return;
    }

    setFile(f.name);
    onFileSelect(f);
  };

  return (
    <div className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition duration-200 sm:p-8 lg:p-10 ${drag ? "scale-[1.01] border-teal-500" : "border-(--border)"}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }} onClick={() => document.getElementById("file").click()}>
      <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        Warning: Do not upload passwords, bank details, or other sensitive personal data. Files may be processed by AI and retained according to the policy shown above.
      </div>

      <label className="mb-4 flex items-start justify-center gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => onConsentChange(e.target.checked)} onClick={(e) => e.stopPropagation()} />
        <span>I consent to processing and retention of this file for resume analysis.</span>
      </label>

      <input id="file" type="file" className="hidden" accept=".pdf" onChange={(e) => handle(e.target.files[0])} />

      <div className="font-display text-5xl text-teal-600 dark:text-teal-300">PDF</div>
      <p className="mt-3 font-medium text-(--text-h)">{file || "Drag and drop your resume"}</p>
      <p className="mt-1 text-sm opacity-60">PDF only • Max 5MB • Encrypted uploads</p>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  );
};

export default UploadBox;