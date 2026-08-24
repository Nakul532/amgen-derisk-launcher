import os

import requests

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"


def generate_narrative(price: float, dosing: str, evidence_weight: float, hostility: str, result: dict) -> str:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not configured")

    risks = [r for r in result.get("risks", []) if r.get("severity") != "clear"]
    risks_summary = "; ".join(f"{r['title']} ({r['frequency']}% of simulated runs)" for r in risks) or "no risk crossed the reporting threshold"

    competitive = result.get("competitive", {})
    gap = competitive.get("price_gap_pct")
    nash_price = competitive.get("nash_equilibrium_price", {}).get("median")
    amgen_share = competitive.get("amgen_share_pct", {}).get("median")
    direction = "above" if isinstance(gap, (int, float)) and gap > 0 else "below"

    prompt = f"""You are a commercial launch strategy analyst. Write a concise executive narrative (3-4 sentences, plain prose, no headers, no bullet points, no markdown) summarizing this pricing simulation for a pharma launch decision.

Configuration: price ${price:,.0f}/month, {dosing} dosing, clinical evidence weighting {evidence_weight}, competitor hostility posture {hostility}.

Monte Carlo results: robustness {result.get('robustness')}% (range {result.get('robustness_p10')}-{result.get('robustness_p90')}%) across {result.get('iterations'):,} simulated market conditions.
Risk flags: {risks_summary}.
Competitive equilibrium: the Nash benchmark price both named rivals would settle around is ${nash_price:,.0f}; the chosen price is {abs(gap) if gap is not None else 0}% {direction} that equilibrium. Amgen's modeled equilibrium market share is {amgen_share}%.

Write the narrative now, addressed to the decision-maker. Be direct and cite the specific numbers above rather than restating them generically."""

    response = requests.post(
        GROQ_API_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
            "max_tokens": 400,
            "reasoning_effort": "low",
        },
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"].strip()
