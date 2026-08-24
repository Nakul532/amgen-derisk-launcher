import React, { useState, useMemo, useCallback } from "react";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Play, AlertTriangle, ShieldCheck, ChevronRight, Loader2, Sparkles } from "lucide-react";

const FONT_IMPORT_ID = "amgen-derisk-fonts";
if (typeof document !== "undefined" && !document.getElementById(FONT_IMPORT_ID)) {
  const link = document.createElement("link");
  link.id = FONT_IMPORT_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
  document.head.appendChild(link);
}

const COLORS = {
  bg: "#0B1220",
  panel: "#111A2C",
  panelAlt: "#0E1526",
  border: "#233047",
  borderSoft: "#1A2338",
  amber: "#E8A33D",
  amberDim: "#5C4620",
  teal: "#4FA490",
  tealDim: "#1F3D37",
  red: "#D6553F",
  redDim: "#3D2420",
  text: "#F1F4F9",
  textDim: "#8A93AB",
  textFaint: "#5A6478",
};

const display = { fontFamily: "'Space Grotesk', sans-serif" };
const body = { fontFamily: "'Inter', sans-serif" };
const mono = { fontFamily: "'IBM Plex Mono', monospace" };

const DOSING_OPTIONS = ["Weekly", "Bi-Weekly", "Monthly"];
const HOSTILITY_OPTIONS = ["Low", "Medium", "High"];

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// --- Local equilibrium preview -------------------------------------------
// Cheap client-side approximation used only to move the boardroom marker
// live as sliders change, without round-tripping to the API on every drag.
// The authoritative result (trajectory/risks/playbook) always comes from
// the backend's /api/simulate call triggered by "Run simulation".
function previewWeights({ price, dosing, evidenceWeight, hostility }) {
  const hostilityIdx = HOSTILITY_OPTIONS.indexOf(hostility);
  const dosingConvenienceBonus = dosing === "Monthly" ? 0.14 : dosing === "Bi-Weekly" ? 0.06 : 0;
  const competitorMid = 1150;
  const priceDelta = (price - competitorMid) / competitorMid;

  const ceoWeight = clamp(0.5 - priceDelta * 0.35 + dosingConvenienceBonus * 0.6, 0.05, 0.95);
  const cfoWeight = clamp(0.5 + priceDelta * 0.45 - evidenceWeight * 0.05, 0.05, 0.95);
  const cmoWeight = clamp(0.35 + evidenceWeight * 0.5 - hostilityIdx * 0.05, 0.05, 0.95);
  const total = ceoWeight + cfoWeight + cmoWeight;
  return { ceo: ceoWeight / total, cfo: cfoWeight / total, cmo: cmoWeight / total };
}

async function fetchSimulation({ price, dosing, evidenceWeight, hostility, iterations }) {
  const res = await fetch(`${API_BASE_URL}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      price,
      dosing,
      evidence_weight: evidenceWeight,
      hostility,
      iterations,
    }),
  });
  if (!res.ok) throw new Error(`Simulation request failed: ${res.status}`);
  return res.json();
}

async function fetchNarrative({ price, dosing, evidenceWeight, hostility, result }) {
  const res = await fetch(`${API_BASE_URL}/api/narrative`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      price,
      dosing,
      evidence_weight: evidenceWeight,
      hostility,
      result,
    }),
  });
  if (!res.ok) throw new Error(`Narrative request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.narrative;
}

// --- Boardroom Tension Triangle -----------------------------------------
function BoardroomTriangle({ weights, running }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2 - 6;
  const r = 96;

  const ceo = { x: cx, y: cy - r, label: "CEO", sub: "Capital speed", color: COLORS.amber };
  const cfo = { x: cx - r * 0.87, y: cy + r * 0.5, label: "CFO", sub: "Margin gate", color: COLORS.teal };
  const cmo = { x: cx + r * 0.87, y: cy + r * 0.5, label: "CMO", sub: "Safety signal", color: "#7C9CD6" };

  const markerX = ceo.x * weights.ceo + cfo.x * weights.cfo + cmo.x * weights.cmo;
  const markerY = ceo.y * weights.ceo + cfo.y * weights.cfo + cmo.y * weights.cmo;

  return (
    <svg viewBox={`0 0 ${size} ${size - 10}`} className="w-full h-full">
      <line x1={ceo.x} y1={ceo.y} x2={cfo.x} y2={cfo.y} stroke={COLORS.borderSoft} strokeWidth="1" />
      <line x1={cfo.x} y1={cfo.y} x2={cmo.x} y2={cmo.y} stroke={COLORS.borderSoft} strokeWidth="1" />
      <line x1={cmo.x} y1={cmo.y} x2={ceo.x} y2={ceo.y} stroke={COLORS.borderSoft} strokeWidth="1" />

      {[ceo, cfo, cmo].map((seat) => (
        <g key={seat.label} style={{ transition: "opacity 300ms" }}>
          <circle cx={seat.x} cy={seat.y} r={running ? 5.5 : 5} fill={COLORS.panel} stroke={seat.color} strokeWidth="2" />
          <text x={seat.x} y={seat.y + (seat.label === "CEO" ? -16 : 24)} textAnchor="middle" fontSize="12" fontWeight="600" fill={COLORS.text} style={display}>
            {seat.label}
          </text>
          <text x={seat.x} y={seat.y + (seat.label === "CEO" ? -3 : 38)} textAnchor="middle" fontSize="8.5" fill={COLORS.textDim} style={body}>
            {seat.sub}
          </text>
        </g>
      ))}

      <line x1={cx} y1={cy} x2={markerX} y2={markerY} stroke={COLORS.amber} strokeWidth="1" strokeDasharray="2 3" opacity={0.5} />
      <circle
        cx={markerX}
        cy={markerY}
        r={running ? 9 : 7}
        fill={running ? "none" : COLORS.amber}
        stroke={COLORS.amber}
        strokeWidth={running ? 2 : 0}
        style={{ transition: "cx 500ms ease, cy 500ms ease, r 400ms ease" }}
      >
        {running && <animate attributeName="r" values="6;11;6" dur="1s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}

// --- Small UI atoms -------------------------------------------------
function SectionLabel({ eyebrow, title }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ ...mono, color: COLORS.amber }}>
        {eyebrow}
      </div>
      <div className="text-base font-semibold" style={{ ...display, color: COLORS.text }}>
        {title}
      </div>
    </div>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div className="flex rounded-md overflow-hidden border" style={{ borderColor: COLORS.border }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              ...body,
              background: active ? COLORS.amberDim : "transparent",
              color: active ? COLORS.amber : COLORS.textDim,
              borderLeft: opt !== options[0] ? `1px solid ${COLORS.border}` : "none",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SliderControl({ label, value, min, max, step, format, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs" style={{ ...body, color: COLORS.textDim }}>{label}</span>
        <span className="text-sm font-medium" style={{ ...mono, color: COLORS.amber }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${COLORS.amber} ${pct}%, ${COLORS.borderSoft} ${pct}%)`,
          accentColor: COLORS.amber,
        }}
      />
    </div>
  );
}

function RiskCard({ risk }) {
  const isHigh = risk.severity === "high";
  const isClear = risk.severity === "clear";
  const color = isClear ? COLORS.teal : isHigh ? COLORS.red : COLORS.amber;
  const bg = isClear ? COLORS.tealDim : isHigh ? COLORS.redDim : COLORS.amberDim;
  const Icon = isClear ? ShieldCheck : AlertTriangle;
  return (
    <div className="flex gap-3 p-3 rounded-lg border" style={{ background: bg, borderColor: color + "40" }}>
      <Icon size={16} color={color} className="shrink-0 mt-0.5" />
      <div>
        <div className="text-xs font-semibold mb-0.5" style={{ ...body, color: COLORS.text }}>{risk.title}</div>
        <div className="text-xs leading-relaxed" style={{ ...body, color: COLORS.textDim }}>{risk.detail}</div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="px-3 py-2 rounded-md border text-xs" style={{ ...mono, background: COLORS.panel, borderColor: COLORS.border, color: COLORS.text }}>
      <div style={{ color: COLORS.textDim }}>{label}</div>
      <div style={{ color: COLORS.amber }}>{point.median}% median</div>
      <div style={{ color: COLORS.textFaint }}>{point.p10}%–{point.p90}% (p10–p90)</div>
    </div>
  );
}

// --- Main component -------------------------------------------------
export default function AmgenDeriskLauncher() {
  const [price, setPrice] = useState(1300);
  const [dosing, setDosing] = useState("Monthly");
  const [evidenceWeight, setEvidenceWeight] = useState(0.5);
  const [hostility, setHostility] = useState("Medium");
  const [iterations, setIterations] = useState(4000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState(null);

  const currentWeights = useMemo(() => {
    if (result) return result.norm;
    return previewWeights({ price, dosing, evidenceWeight, hostility });
  }, [price, dosing, evidenceWeight, hostility, result]);

  const trajectoryWithBand = useMemo(() => {
    if (!result) return [];
    return result.trajectory.map((d) => ({ ...d, bandWidth: Number((d.p90 - d.p10).toFixed(1)) }));
  }, [result]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setNarrative(null);
    setNarrativeError(null);
    try {
      const sim = await fetchSimulation({ price, dosing, evidenceWeight, hostility, iterations });
      setResult(sim);
      setHasRun(true);
      setNarrativeLoading(true);
      fetchNarrative({ price, dosing, evidenceWeight, hostility, result: sim })
        .then((text) => setNarrative(text))
        .catch((err) => setNarrativeError(err.message || "AI insight failed"))
        .finally(() => setNarrativeLoading(false));
    } catch (err) {
      setError(err.message || "Simulation failed");
    } finally {
      setRunning(false);
    }
  }, [price, dosing, evidenceWeight, hostility, iterations]);

  return (
    <div className="w-full min-h-screen" style={{ background: COLORS.bg, ...body }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderColor: COLORS.borderSoft }}>
        <div>
          <div className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ ...mono, color: COLORS.textFaint }}>
            Featurely &middot; Launch De-Risk Simulator
          </div>
          <h1 className="text-xl font-semibold" style={{ ...display, color: COLORS.text }}>
            MariTide Commercial Launch &mdash; Amgen
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ ...mono, color: COLORS.textDim }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS.teal }} />
          Single-tenant sandbox &middot; SOC 2 Type II
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 p-6 max-w-[1400px] mx-auto">
        {/* Left: Configuration Cockpit */}
        <div className="rounded-xl border p-5 h-fit" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
          <SectionLabel eyebrow="Panel 1" title="Configuration Cockpit" />

          <div className="space-y-6">
            <SliderControl
              label="Commercial price / month"
              value={price}
              min={500}
              max={3000}
              step={50}
              format={(v) => `$${v.toLocaleString()}`}
              onChange={setPrice}
            />

            <div>
              <div className="text-xs mb-2" style={{ ...body, color: COLORS.textDim }}>Dosing frequency</div>
              <Toggle options={DOSING_OPTIONS} value={dosing} onChange={setDosing} />
            </div>

            <SliderControl
              label="Clinical evidence weighting"
              value={evidenceWeight}
              min={0}
              max={1}
              step={0.05}
              format={(v) => (v < 0.4 ? "Weight-loss %" : v > 0.6 ? "CVOT outcomes" : "Balanced")}
              onChange={setEvidenceWeight}
            />

            <div>
              <div className="text-xs mb-2" style={{ ...body, color: COLORS.textDim }}>Competitor hostility</div>
              <Toggle options={HOSTILITY_OPTIONS} value={hostility} onChange={setHostility} />
            </div>

            <SliderControl
              label="Monte Carlo iterations"
              value={iterations}
              min={500}
              max={10000}
              step={500}
              format={(v) => v.toLocaleString()}
              onChange={setIterations}
            />
          </div>

          <button
            onClick={handleRun}
            disabled={running}
            className="w-full mt-7 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition-opacity disabled:opacity-70"
            style={{ ...display, background: COLORS.amber, color: "#1A1206" }}
          >
            {running ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Solving {iterations.toLocaleString()} iterations&hellip;
              </>
            ) : (
              <>
                <Play size={15} /> Run simulation
              </>
            )}
          </button>
          <div className="text-[10px] text-center mt-2" style={{ ...mono, color: COLORS.textFaint }}>
            Target compute budget: &le;15s
          </div>
          {error && (
            <div className="text-[11px] text-center mt-2" style={{ ...mono, color: COLORS.red }}>
              {error}
            </div>
          )}
        </div>

        {/* Right: Boardroom + Scoreboard */}
        <div className="space-y-6">
          {/* Boardroom Triangle */}
          <div className="rounded-xl border p-5" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
            <SectionLabel eyebrow="Panel 2 &middot; Layer 1" title="Institutional Decision Room" />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 items-center">
              <div>
                <p className="text-sm leading-relaxed mb-4" style={{ ...body, color: COLORS.textDim }}>
                  The marker shows where the current configuration lands among the three executive positions.
                  Adjust the levers on the left and watch the equilibrium shift before you commit to a run.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "CEO pull", value: currentWeights.ceo, color: COLORS.amber },
                    { label: "CFO pull", value: currentWeights.cfo, color: COLORS.teal },
                    { label: "CMO pull", value: currentWeights.cmo, color: "#7C9CD6" },
                  ].map((w) => (
                    <div key={w.label} className="rounded-lg border px-3 py-2" style={{ borderColor: COLORS.borderSoft }}>
                      <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>{w.label}</div>
                      <div className="text-sm font-semibold" style={{ ...mono, color: w.color }}>{Math.round(w.value * 100)}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-center">
                <BoardroomTriangle weights={currentWeights} running={running} />
              </div>
            </div>
          </div>

          {/* AI Analyst */}
          {hasRun && (
            <div className="rounded-xl border p-5" style={{ background: COLORS.panel, borderColor: COLORS.amber + "40" }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} color={COLORS.amber} />
                <div className="text-[10px] tracking-[0.18em] uppercase font-medium" style={{ ...mono, color: COLORS.amber }}>
                  Featurely AI &middot; Run Analysis
                </div>
              </div>
              {narrativeLoading ? (
                <div className="flex items-center gap-2 text-sm" style={{ ...body, color: COLORS.textFaint }}>
                  <Loader2 size={14} className="animate-spin" /> Synthesizing insight&hellip;
                </div>
              ) : narrativeError ? (
                <div className="text-xs" style={{ ...body, color: COLORS.textFaint }}>
                  AI insight unavailable ({narrativeError}).
                </div>
              ) : narrative ? (
                <p className="text-sm leading-relaxed" style={{ ...body, color: COLORS.text }}>{narrative}</p>
              ) : null}
            </div>
          )}

          {/* Strategic Scoreboard */}
          <div className="rounded-xl border p-5" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
            <div className="flex items-center justify-between mb-1">
              <SectionLabel eyebrow="Panel 3" title="Strategic Scoreboard" />
              {hasRun && result && (
                <div className="text-right mb-4">
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>Robustness</div>
                  <div
                    className="text-2xl font-bold"
                    style={{ ...mono, color: result.robustness >= 60 ? COLORS.teal : result.robustness >= 35 ? COLORS.amber : COLORS.red }}
                  >
                    {result.robustness}%
                  </div>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>
                    {result.robustness_p10}%&ndash;{result.robustness_p90}% range &middot; {result.iterations.toLocaleString()} runs
                  </div>
                </div>
              )}
            </div>

            {!hasRun ? (
              <div className="py-16 text-center">
                <ChevronRight size={20} className="mx-auto mb-2" color={COLORS.textFaint} />
                <p className="text-sm" style={{ ...body, color: COLORS.textFaint }}>
                  Set your levers and run the simulation to see the 12-month trajectory, risk flags, and playbook.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Chart */}
                <div>
                  <div className="text-xs mb-2" style={{ ...body, color: COLORS.textDim }}>
                    12-month market share trajectory <span style={{ color: COLORS.textFaint }}>(p10&ndash;p90 band across {result.iterations.toLocaleString()} runs)</span>
                  </div>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trajectoryWithBand} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderSoft} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: COLORS.textFaint, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: COLORS.borderSoft }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: COLORS.textFaint, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} unit="%" />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={0} stroke={COLORS.borderSoft} />
                        <Area type="monotone" dataKey="p10" stackId="band" stroke="none" fill="transparent" />
                        <Area type="monotone" dataKey="bandWidth" stackId="band" stroke="none" fill={COLORS.amber} fillOpacity={0.15} />
                        <Line type="monotone" dataKey="median" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 2.5, fill: COLORS.amber }} activeDot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Risk alerts */}
                <div>
                  <div className="text-xs mb-2" style={{ ...body, color: COLORS.textDim }}>Critical risk alerts</div>
                  <div className="space-y-2">
                    {result.risks.map((r, i) => <RiskCard key={i} risk={r} />)}
                  </div>
                </div>

                {/* Playbook */}
                <div>
                  <div className="text-xs mb-2" style={{ ...body, color: COLORS.textDim }}>De-risked action playbook</div>
                  <div className="space-y-1.5">
                    {result.playbook.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm" style={{ ...body, color: COLORS.text }}>
                        <span className="text-xs mt-0.5 shrink-0" style={{ ...mono, color: COLORS.amber }}>{String(i + 1).padStart(2, "0")}</span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Competitive Equilibrium */}
          {hasRun && result?.competitive && (
            <div className="rounded-xl border p-5" style={{ background: COLORS.panel, borderColor: COLORS.border }}>
              <SectionLabel eyebrow="Panel 4" title="Competitive Equilibrium" />
              <p className="text-xs leading-relaxed mb-4" style={{ ...body, color: COLORS.textFaint }}>
                A real Bertrand-Nash best-response solve, not a labeled Monte Carlo run: Novo Nordisk and Eli Lilly
                are modeled as rational agents that re-price to maximize their own profit against your configuration.
                Their quality/cost inputs are illustrative demo assumptions, not sourced from either company's real data.
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: COLORS.borderSoft }}>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>Novo Nordisk reacts to</div>
                  <div className="text-sm font-semibold" style={{ ...mono, color: COLORS.text }}>${result.competitive.novo_nordisk.median.toLocaleString()}</div>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>${result.competitive.novo_nordisk.p10.toLocaleString()}&ndash;${result.competitive.novo_nordisk.p90.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: COLORS.borderSoft }}>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>Eli Lilly reacts to</div>
                  <div className="text-sm font-semibold" style={{ ...mono, color: COLORS.text }}>${result.competitive.eli_lilly.median.toLocaleString()}</div>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>${result.competitive.eli_lilly.p10.toLocaleString()}&ndash;${result.competitive.eli_lilly.p90.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: COLORS.borderSoft }}>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>Amgen equilibrium share</div>
                  <div className="text-sm font-semibold" style={{ ...mono, color: COLORS.amber }}>{result.competitive.amgen_share_pct.median}%</div>
                  <div className="text-[10px]" style={{ ...mono, color: COLORS.textFaint }}>{result.competitive.amgen_share_pct.p10}%&ndash;{result.competitive.amgen_share_pct.p90}%</div>
                </div>
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: COLORS.borderSoft, background: COLORS.panelAlt }}>
                <div className="text-[10px] mb-1" style={{ ...mono, color: COLORS.textFaint }}>Full 3-way Nash equilibrium benchmark</div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="text-lg font-semibold" style={{ ...mono, color: COLORS.text }}>
                    ${result.competitive.nash_equilibrium_price.median.toLocaleString()}
                  </div>
                  <div className="text-xs" style={{ ...body, color: COLORS.textDim }}>
                    theoretical optimal price if Amgen also best-responds, vs your chosen ${price.toLocaleString()}
                  </div>
                </div>
                <div className="text-xs mt-1" style={{ ...mono, color: Math.abs(result.competitive.price_gap_pct) <= 10 ? COLORS.teal : COLORS.amber }}>
                  {result.competitive.price_gap_pct > 0 ? "+" : ""}{result.competitive.price_gap_pct}% vs equilibrium
                  {Math.abs(result.competitive.price_gap_pct) <= 10 ? " — close to equilibrium" : result.competitive.price_gap_pct > 0 ? " — priced above what the model would set" : " — priced below what the model would set"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
