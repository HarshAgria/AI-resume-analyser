// import { motion } from "framer-motion";

// const container = {
//   hidden: { opacity: 0 },
//   show: {
//     opacity: 1,
//     transition: { staggerChildren: 0.15 }
//   }
// };

// const item = {
//   hidden: { opacity: 0, y: 15 },
//   show: { opacity: 1, y: 0 }
// };

// // keyword color map
// const getColor = (kw) => {
//   if (kw.toLowerCase().includes("docker")) return "border-blue-400 text-blue-300";
//   if (kw.toLowerCase().includes("terraform")) return "border-purple-400 text-purple-300";
//   return "border-emerald-400 text-emerald-300";
// };

// const ResultsPanel = ({ analysis, onReset }) => {
//   const { summary, strengths, improvements, missingKeywords } = analysis;

//   return (
//     <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">

//       {/* SUMMARY */}
//       <motion.div variants={item} className="glass p-4">
//         <h3>📝 Summary</h3>
//         <p className="opacity-70">{summary}</p>
//       </motion.div>

//       {/* STRENGTHS */}
//       <motion.div variants={item} className="glass p-4">
//         <h3 className="text-green-400">Strengths</h3>
//         {strengths?.map((s, i) => <p key={i}>• {s}</p>)}
//       </motion.div>

//       {/* IMPROVEMENTS */}
//       <motion.div variants={item} className="glass p-4">
//         <h3 className="text-orange-400">Improvements</h3>
//         {improvements?.map((i, idx) => <p key={idx}>• {i}</p>)}
//       </motion.div>

//       {/* KEYWORDS */}
//       <motion.div variants={item} className="glass p-4">
//         <h3 className="text-blue-400 mb-2">Missing Keywords</h3>

//         <div className="flex flex-wrap gap-2">
//           {missingKeywords?.map((k, i) => (
//             <span
//               key={i}
//               className={`px-3 py-1 rounded-full text-xs border ${getColor(k)}`}
//             >
//               {k}
//             </span>
//           ))}
//         </div>
//       </motion.div>

//       {/* CTA */}
//       <motion.button
//         variants={item}
//         onClick={onReset}
//         className="w-full py-3 bg-emerald-600 rounded-xl hover:scale-[1.02] transition"
//       >
//         Analyze Another Resume
//       </motion.button>

//     </motion.div>
//   );
// };

// export default ResultsPanel;

import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const Bullet = ({ type }) => (
  <span
    className={`inline-block w-2 h-2 rounded-full mr-2 mt-2 ${
      type === "good" ? "bg-emerald-400" : "bg-orange-400"
    }`}
  />
);

export default function ResultsPanel({ analysis, onReset }) {
  const {
    summary,
    strengths,
    improvements,
    missingKeywords,
    candidateName,
    alignment,
    recommendedRoles,
    jdMatchScore,
    matchedRequirements,
    missingRequirements,
    hasJDAnalysis,
  } = analysis;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      <motion.div variants={item} className="glass rounded-3xl p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold text-(--text-h)">
          Summary
        </h3>
        {candidateName && (
          <p className="mt-1 text-sm font-medium text-(--text)/80">
            Prepared for {candidateName}
          </p>
        )}
        <p className="mt-3 leading-relaxed text-(--text)/85">{summary}</p>
      </motion.div>

      <motion.div variants={item} className="glass rounded-3xl p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold text-teal-500">
          Strengths
        </h3>
        {strengths?.map((s, i) => (
          <div key={i} className="mt-2 flex">
            <Bullet type="good" />
            <p className="text-(--text)/85">{s}</p>
          </div>
        ))}
      </motion.div>

      <motion.div variants={item} className="glass rounded-3xl p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold text-amber-500">
          Improvements
        </h3>
        {improvements?.map((i, idx) => (
          <div key={idx} className="mt-2 flex">
            <Bullet type="bad" />
            <p className="text-(--text)/85">{i}</p>
          </div>
        ))}
      </motion.div>

      <motion.div variants={item} className="glass rounded-3xl p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold text-sky-500">
          Missing Keywords
        </h3>

        <div className="mt-3 flex flex-wrap gap-2">
          {missingKeywords?.map((k, i) => (
            <span
              key={i}
              className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-700 dark:text-sky-200"
            >
              {k}
            </span>
          ))}
        </div>
      </motion.div>

      {hasJDAnalysis && (
        <motion.div variants={item} className="glass rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-(--text-h)">
                Job Description Match
              </h3>

              <p className="mt-1 text-sm text-(--text)/70">
                How closely the resume matches the supplied job description.
              </p>
            </div>
            <div className="text-3xl font-bold text-teal-500">
              {typeof jdMatchScore === "number"
                ? `${Math.round(jdMatchScore)}%`
                : "—"}
            </div>
          </div>
          {matchedRequirements?.length > 0 && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold text-emerald-500">
                Matched requirements
              </h4>

              <div className="mt-3 flex flex-wrap gap-2">
                {matchedRequirements.map((requirement, index) => (
                  <span
                    key={index}
                    className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-200"
                  >
                    {requirement}
                  </span>
                ))}
              </div>
            </div>
          )}
          {missingRequirements?.length > 0 && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold text-rose-500">
                Missing requirements
              </h4>

              <div className="mt-3 flex flex-wrap gap-2">
                {missingRequirements.map((requirement, index) => (
                  <span
                    key={index}
                    className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-700 dark:text-rose-200"
                  >
                    {requirement}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {(alignment || (recommendedRoles && recommendedRoles.length)) && (
        <motion.div variants={item} className="glass rounded-3xl p-5 sm:p-6">
          <h3 className="font-display text-lg font-semibold text-(--text-h)">
            Role Alignment
          </h3>
          {alignment && (
            <p className="mt-2 text-(--text)/85">
              Matches target role:
              <strong className="ml-2 text-(--text-h)">
                {alignment.matches ? "Yes" : "No"}
              </strong>
              <span className="ml-1">
                ({Math.round((alignment.confidence || 0) * 100)}% confidence)
              </span>
            </p>
          )}

          {recommendedRoles && recommendedRoles.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-2 text-sm text-(--text)/80">
                Recommended roles
              </h4>
              <div className="flex flex-wrap gap-2">
                {recommendedRoles.map((r, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-1 text-xs text-teal-700 dark:text-teal-200"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      <motion.button
        variants={item}
        onClick={onReset}
        className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-500 py-3 font-medium text-white shadow-lg transition hover:scale-[1.01]"
      >
        Analyze Another Resume
      </motion.button>
    </motion.div>
  );
}
