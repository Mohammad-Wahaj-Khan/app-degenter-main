const emailBenefits = [
  "Upgrade to Pro (fees applied)",
  "Setup and receive Alerts",
  "Receive Rewards from Birdeye and our partners",
];

export default function ProfileEmail() {
  return (
    <section className="pt-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-600 text-[10px] font-semibold text-neutral-400">
          -
        </span>
        <div>
          <p className="text-sm font-semibold text-white">EMAIL</p>
          <p className="text-xs text-neutral-500">
            Add a verified email address to unlock.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-neutral-400">
        {emailBenefits.map((item) => (
          <div key={item} className="flex items-center gap-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 text-[10px] text-neutral-500">
              L
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-neutral-600">
        Please note that an additional email verification step is required.
      </p>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex items-center gap-2 rounded-sm border border-neutral-700 px-4 py-2 text-xs font-semibold uppercase text-neutral-500"
      >
        Add Email (Locked)
      </button>
    </section>
  );
}
