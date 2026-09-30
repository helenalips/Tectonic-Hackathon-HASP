import type { TrustFactor } from "../api/types";
import { FACTOR_LABEL, pct } from "../lib/format";
import { ProgressBar } from "./ProgressBar";

/** Factor table: name (with reason underneath), weight, value bar. Fits narrow columns. */
export function TrustFactors({ factors }: { factors: TrustFactor[] }) {
  return (
    <div className="rounded-md border border-borderSubtle">
      <table className="w-full table-fixed text-left text-body-xs">
        <caption className="sr-only">Trust factors</caption>
        <thead className="bg-backgroundAlt text-textMuted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Factor and why</th>
            <th scope="col" className="w-16 px-2 py-2 font-semibold">Weight</th>
            <th scope="col" className="w-20 px-3 py-2 font-semibold sm:w-28">Value</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((f) => {
            const name = FACTOR_LABEL[f.name] ?? f.name;
            return (
              <tr key={f.name} className="border-t border-borderSubtle align-top">
                <th scope="row" className="px-3 py-2 font-normal">
                  <span className="block font-semibold text-textStrong">{name}</span>
                  <span className="block text-text">{f.reason}</span>
                </th>
                <td className="px-2 py-2 tabular-nums text-textMuted">{pct(f.weight)}</td>
                <td className="px-3 py-2">
                  <span className="mb-1 block tabular-nums text-textMuted">{pct(f.value)}</span>
                  <ProgressBar value={f.value} label={`${name} value`} tone={f.value >= 0.5 ? "good" : "brand"} compact />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
