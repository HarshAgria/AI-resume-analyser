// import { useEffect, useState } from "react";

// const ScoreCard = ({ score = 0, atsRating }) => {
//   const [display, setDisplay] = useState(0);
//   const [particles, setParticles] = useState([]);

//   const percent = (score / 10) * 100;
//   const r = 50;
//   const c = 2 * Math.PI * r;
//   const offset = c - (percent / 100) * c;

//   // number animation
//   useEffect(() => {
//     let start = 0;
//     const step = score / 30;

//     const interval = setInterval(() => {
//       start += step;
//       if (start >= score) {
//         start = score;
//         clearInterval(interval);

//         // 💥 particle burst
//         if (score >= 8) {
//           const p = Array.from({ length: 12 }).map(() => ({
//             x: 60 + Math.random() * 40,
//             y: 60 + Math.random() * 40,
//           }));
//           setParticles(p);
//         }
//       }
//       setDisplay(start.toFixed(1));
//     }, 30);

//     return () => clearInterval(interval);
//   }, [score]);

//   return (
//     <div className="glass p-6 text-center relative glow">

//       {/* PARTICLES */}
//       {particles.map((p, i) => (
//         <div
//           key={i}
//           className="particle"
//           style={{ left: p.x, top: p.y }}
//         />
//       ))}

//       {/* SVG RING */}
//       <svg className="mx-auto w-36 h-36">
//         <circle cx="72" cy="72" r={r} stroke="#2e303a" strokeWidth="10" fill="none" />
//         <circle
//           cx="72"
//           cy="72"
//           r={r}
//           stroke="#22c55e"
//           strokeWidth="10"
//           fill="none"
//           strokeDasharray={c}
//           strokeDashoffset={offset}
//           strokeLinecap="round"
//           transform="rotate(-90 72 72)"
//           style={{
//             transition: "stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1)"
//           }}
//         />
//       </svg>

//       {/* CENTER TEXT */}
//       <div className="absolute inset-0 flex flex-col items-center justify-center">
//         <div className="text-4xl font-bold">{display}</div>
//         <div className="text-xs opacity-60">ATS Score</div>
//       </div>

//       <div className="mt-3 text-sm opacity-70">{atsRating}</div>
//     </div>
//   );
// };

// export default ScoreCard;

import { useEffect, useMemo, useState } from "react";

const qualitySummary = (score) => {
  if (score >= 8.5) return "Outstanding resume quality with strong ATS alignment and recruiter readiness.";
  if (score >= 7) return "Strong profile with solid ATS compatibility and a few refinements needed.";
  if (score >= 5.5) return "Moderate quality resume. Improvements can materially increase interview chances.";
  return "Resume needs major optimization to improve readability, impact, and ATS ranking.";
};

const Star = ({ filled }) => (
  <svg viewBox="0 0 24 24" className={`h-5 w-5 ${filled ? "text-amber-400" : "text-slate-400/45"}`} fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l2.98 6.03 6.66.97-4.82 4.7 1.14 6.63L12 17.7 6.04 20.83l1.14-6.63-4.82-4.7 6.66-.97L12 2.5z" />
  </svg>
);

const ScoreCard = ({ score = 0, atsRating, candidateName = "", confidenceLevel = 0, recruiterApproval = 0 }) => {
  const [display, setDisplay] = useState(0);

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.max(0, Math.min(10, Number(score) || 0));
  const progress = normalizedScore / 10;
  const offset = circumference - progress * circumference;
  const stars = Math.max(1, Math.min(5, Math.round((normalizedScore / 10) * 5)));

  const confidence = useMemo(() => {
    const value = typeof confidenceLevel === "number" ? confidenceLevel : normalizedScore / 10;
    return Math.round(Math.max(0, Math.min(1, value)) * 100);
  }, [confidenceLevel, normalizedScore]);

  useEffect(() => {
    let start = 0;
    const step = normalizedScore / 40;

    const interval = setInterval(() => {
      start += step;
      if (start >= normalizedScore) {
        start = normalizedScore;
        clearInterval(interval);
      }
      setDisplay(start.toFixed(1));
    }, 24);

    return () => clearInterval(interval);
  }, [normalizedScore]);

  return (
    <div className="glass rounded-3xl p-6 sm:p-7">
      <div className="relative mx-auto h-44 w-44">
        <svg viewBox="0 0 120 120" className="h-full w-full">
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0ea5a5" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          <circle cx="60" cy="60" r={radius} stroke="rgba(148,163,184,0.25)" strokeWidth="10" fill="none" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="url(#scoreGradient)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-5xl font-bold leading-none text-(--text-h)">{display}</div>
          <div className="mt-1 text-xs tracking-[0.25em] text-(--text)/70">ATS SCORE</div>
        </div>
      </div>

      <div className="mt-5 text-center">
        <div className="font-display text-lg font-semibold text-(--text-h)">{candidateName || "Resume Analysis"}</div>
        <div className="text-sm text-(--text)/80">{atsRating}</div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1" aria-label={`Star rating ${stars} of 5`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} filled={index < stars} />
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-(--border) bg-white/60 p-3 dark:bg-black/20">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-(--text)/65">
            <span>Recruiter approval</span>
            <span>{Math.max(0, Math.min(100, Math.round(recruiterApproval || normalizedScore * 10)))}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-300/35 dark:bg-slate-700/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-400 transition-all duration-700"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(recruiterApproval || normalizedScore * 10)))}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl border border-(--border) bg-white/60 p-3 dark:bg-black/20">
            <div className="text-xs uppercase tracking-[0.16em] text-(--text)/65">Confidence</div>
            <div className="mt-1 font-display text-2xl font-semibold text-(--text-h)">{confidence}%</div>
          </div>
          <div className="rounded-2xl border border-(--border) bg-white/60 p-3 dark:bg-black/20">
            <div className="text-xs uppercase tracking-[0.16em] text-(--text)/65">Star rating</div>
            <div className="mt-1 font-display text-2xl font-semibold text-(--text-h)">{stars}/5</div>
          </div>
        </div>

        <div className="rounded-2xl border border-(--border) bg-white/60 p-4 text-sm leading-relaxed text-(--text)/85 dark:bg-black/20">
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-(--text)/65">Resume quality summary</div>
          {qualitySummary(normalizedScore)}
        </div>
      </div>
    </div>
  );
};

export default ScoreCard;