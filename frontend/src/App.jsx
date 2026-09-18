import { useState, useEffect } from "react";
import UploadBox from "./components/UploadBox";
import ScoreCard from "./components/ScoreCard";
import ResultsPanel from "./components/ResultsPanel";
import Loader from "./components/Loader";
import { analyzeResume, deleteUploadedFile } from "./api/resumeApi";
import { motion } from "framer-motion";
import Confetti from "react-confetti";

function App() {
  const [dark, setDark] = useState(true);
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);
  const [extraction, setExtraction] = useState(null);

  const [error, setError] = useState("");

  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const [consent, setConsent] = useState(false);

  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [uploadedPublicId, setUploadedPublicId] = useState("");

  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  /*
   * ---------------------------------------------------------
   * DARK MODE
   * ---------------------------------------------------------
   */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  /*
   * ---------------------------------------------------------
   * WINDOW RESIZE
   * ---------------------------------------------------------
   */
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // BACKGROUND MOUSE EFFECT
  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const handleFileSelect = async (file) => {
    if (!file) return;
    if (!consent) {
      setError(
        "Please confirm the consent notice before uploading your resume.",
      );
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setExtraction(null);
    setUploadedFileUrl("");
    setUploadedPublicId("");

    try {
      const data = await analyzeResume(
        file,
        role.trim(),
        jobDescription.trim(),
      );

      /* * Defensive API response handling. */ const analysis =
        data?.analysis ?? null;
      const extracted = data?.extraction ?? null;
      if (!analysis) {
        throw new Error("The server did not return a valid resume analysis.");
      }
      setResult(analysis);
      setExtraction(extracted);
      setUploadedFileUrl(data?.fileUrl ?? "");
      setUploadedPublicId(data?.publicId ?? "");
    } catch (err) {
      console.error("Resume analysis error:", err);
      setResult(null);
      setExtraction(null);
      setError(
        err?.message ||
          "Analysis failed. Please check your resume and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!uploadedFileUrl) return;
    try {
      await deleteUploadedFile(uploadedFileUrl, uploadedPublicId);
      setUploadedFileUrl("");
      setUploadedPublicId("");
      setError("Uploaded file removed from storage.");
    } catch (err) {
      setError(err?.message || "Could not delete uploaded file.");
    }
  };

  const reset = () => {
    setResult(null);
    setExtraction(null);
    setError("");
    setUploadedFileUrl("");
    setUploadedPublicId("");
    setRole("");
    setJobDescription("");
  };

  const celebrate = Number(result?.score || 0) >= 8;

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-(--bg) text-(--text)"
      onMouseMove={handleMouseMove}
    >
      {celebrate && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={220}
          recycle={false}
          gravity={0.25}
        />
      )}

      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div
          className="absolute inset-0 transition-[background-position] duration-300"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(20,184,166,0.25), transparent 20%), radial-gradient(circle at 80% 30%, rgba(14,165,233,0.22), transparent 25%), radial-gradient(circle at 50% 80%, rgba(245,158,11,0.17), transparent 22%)",
            backgroundPosition: `${pointer.x / 10}px ${pointer.y / 10}px`,
          }}
        />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-20 top-[8%] h-56 w-56 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute -right-16 top-[18%] h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-20 left-[20%] h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-3 py-6 sm:px-4 lg:px-6">
        <div className="w-full max-w-6xl">
          <div className="mb-5 text-center sm:mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-(--border) bg-white/60 px-3 py-1 text-xs uppercase tracking-[0.24em] text-teal-600 dark:bg-white/10">
              AI hiring copilot
            </div>
            <h1 className="font-display mt-3 text-3xl font-semibold text-(--text-h) sm:text-4xl lg:text-5xl">
              AI Resume Analyzer for modern hiring teams
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-(--text)/75 sm:text-base">
              Upload a resume, share a target role, job description and receive
              a polished review with alignment guidance and practical
              recommendations.
            </p>
            {/* Theme toggle */}
            <button
              type="button"
              onClick={() => setDark((previous) => !previous)}
              className="mt-4 h-10 w-10 rounded-full border border-(--border) bg-white/70 text-lg shadow-sm transition hover:scale-105 dark:bg-white/10"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? "🌙" : "☀️"}
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl border border-white/25 p-4 shadow-2xl sm:p-6 lg:p-8"
          >
            {!result && !loading && (
              <div className="space-y-4 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:gap-6 lg:space-y-0">
                {/* LEFT SIDE */}
                <div className="space-y-4">
                  {/* Job description */}
                  <div className="rounded-2xl border border-(--border) bg-white/65 p-4 text-left shadow-sm dark:bg-black/20">
                    <label
                      htmlFor="job-description"
                      className="mb-2 block text-sm font-medium"
                    >
                      Job description
                    </label>

                    <textarea
                      id="job-description"
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the job description here for ATS and requirement matching..."
                      rows={8}
                      className="w-full resize-y rounded-xl border border-(--border) bg-(--bg)/80 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    <div className="mt-2 flex items-center justify-between text-xs opacity-70">
                      <span>Optional: enables JD requirement matching.</span>

                      <span>{jobDescription.length} characters</span>
                    </div>
                  </div>

                  {/* Target role */}
                  <div className="rounded-2xl border border-(--border) bg-white/65 p-4 text-left shadow-sm dark:bg-black/20">
                    <label
                      htmlFor="target-role"
                      className="mb-2 block text-sm font-medium"
                    >
                      Target role
                    </label>
                    <input
                      id="target-role"
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. Senior Backend Engineer"
                      className="w-full rounded-xl border border-(--border) bg-(--bg)/80 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="mt-2 text-xs opacity-70">
                      Optional: add the role to receive role-fit insights and
                      recommended roles.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-(--border) bg-white/65 p-4 shadow-sm dark:bg-black/20">
                    <h3 className="mb-2 font-semibold">Retention & privacy</h3>
                    <p className="text-sm opacity-80">
                      We keep uploaded files only as long as needed for review.
                      You can delete them from storage at any time.
                    </p>
                  </div>
                </div>

                {/* RIGHT SIDE */}
                <UploadBox
                  onFileSelect={handleFileSelect}
                  consent={consent}
                  onConsentChange={(checked) => {
                    setConsent(checked);

                    /*
                     * Remove consent-related error once the user
                     * checks the box.
                     */
                    if (checked) {
                      setError("");
                    }
                  }}
                />
              </div>
            )}

            {/* LOADING */}
            {loading && <Loader />}

            {/* GLOBAL ERROR */}
            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <ScoreCard
                    score={result.score}
                    atsRating={result.atsRating}
                    candidateName={result.candidateName}
                    confidenceLevel={result.confidenceLevel}
                    recruiterApproval={result.recruiterApproval}
                  />
                  <ResultsPanel analysis={result} onReset={reset} />
                </div>

                {extraction?.weakQuality && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                    Warning: extracted text quality is low. Analysis may be less
                    accurate. Upload a searchable PDF for best results.
                  </div>
                )}

                {/* <div className="rounded-2xl border border-(--border) bg-white/55 p-4 text-sm text-(--text)/75 dark:bg-black/15">
                  <div className="font-medium text-(--text-h)">Extraction diagnostics</div>
                  <div className="mt-1">
                    Method: {extraction?.method || "unknown"} • Digital PDF detected: {extraction?.digitalPdfDetected ? "yes" : "no"} • Quality score: {Math.round((extraction?.qualityScore || 0) * 100)}%
                  </div>
                  {!!extraction?.warnings?.length && (
                    <div className="mt-2">{extraction.warnings[0]}</div>
                  )}
                </div> */}

                <div className="rounded-2xl border border-(--border) bg-white/45 p-4 text-xs text-(--text)/70 dark:bg-black/10">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-(--text-h)">
                        Delete Analysis
                      </div>
                      <div>
                        This control removes your uploaded file from storage.
                        Use only if needed.
                      </div>
                    </div>
                    {uploadedFileUrl && (
                      <button
                        type="button"
                        onClick={handleDeleteFile}
                        className="rounded-full border border-rose-400/35 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-500/15 dark:text-rose-300"
                      >
                        Delete uploaded file
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
          <footer className="mt-5 text-center text-xs text-(--text)/60 sm:mt-8">
            <p>© 2026 All Rights Reserved.</p>
            <p className="mt-1">Built with ❤️ by Harsh Agria</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
