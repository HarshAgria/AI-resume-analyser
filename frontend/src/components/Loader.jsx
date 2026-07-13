const Loader = () => (
  <div className="text-center py-10">
    <div className="w-14 h-14 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto" />
    <p className="mt-4 opacity-70">Analyzing resume...</p>
    <p className="text-[var(--muted)] text-sm mt-1">
      This takes 10–15 seconds
    </p>
  </div>
);

export default Loader;