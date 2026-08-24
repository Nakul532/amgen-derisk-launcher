import math
import random

from app.game_theory import LILLY, NOVO, solve_competitor_reaction, solve_joint_equilibrium

DOSING_OPTIONS = ["Weekly", "Bi-Weekly", "Monthly"]
HOSTILITY_OPTIONS = ["Low", "Medium", "High"]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def mean(xs):
    return sum(xs) / len(xs)


def percentile(xs, p):
    s = sorted(xs)
    k = clamp(round(p * (len(s) - 1)), 0, len(s) - 1)
    return s[k]


def run_simulation(price: float, dosing: str, evidence_weight: float, hostility: str, iterations: int = 4000):
    iterations = int(clamp(iterations, 200, 10000))
    hostility_idx = HOSTILITY_OPTIONS.index(hostility)
    dosing_convenience_bonus = 0.14 if dosing == "Monthly" else 0.06 if dosing == "Bi-Weekly" else 0

    weight_samples = {"ceo": [], "cfo": [], "cmo": []}
    robustness_samples = []
    trajectory_samples = [[] for _ in range(12)]
    risk_triggers = {"formulary": 0, "margin": 0, "retaliation": 0, "differentiation": 0}

    for _ in range(iterations):
        # Each iteration is a plausible "world": competitor pricing, rival
        # hostility, and how the market actually weighs evidence all carry
        # real uncertainty, so we resample them instead of using one fixed
        # guess.
        competitor_mid = clamp(random.gauss(1150, 90), 850, 1500)
        price_delta = (price - competitor_mid) / competitor_mid

        hostility_sample = clamp(hostility_idx + random.gauss(0, 0.4), 0, 2)
        evidence_sample = clamp(evidence_weight + random.gauss(0, 0.06), 0, 1)
        dosing_bonus_sample = max(0, dosing_convenience_bonus + random.gauss(0, 0.015))

        ceo_w = clamp(0.5 - price_delta * 0.35 + dosing_bonus_sample * 0.6, 0.05, 0.95)
        cfo_w = clamp(0.5 + price_delta * 0.45 - evidence_sample * 0.05, 0.05, 0.95)
        cmo_w = clamp(0.35 + evidence_sample * 0.5 - hostility_sample * 0.05, 0.05, 0.95)
        total = ceo_w + cfo_w + cmo_w
        weight_samples["ceo"].append(ceo_w / total)
        weight_samples["cfo"].append(cfo_w / total)
        weight_samples["cmo"].append(cmo_w / total)

        robustness = 88 - abs(price_delta) * 38 - hostility_sample * 6 + dosing_bonus_sample * 40
        robustness += random.gauss(0, 4)
        robustness_samples.append(clamp(robustness, 2, 99))

        base_capture = 6 + dosing_bonus_sample * 60 - abs(price_delta) * 10 + random.gauss(0, 1.2)
        decay = 0.35 + hostility_sample * 0.55 - evidence_sample * 0.15 + random.gauss(0, 0.05)
        for m in range(1, 13):
            growth = base_capture * (1 - math.exp(-m / 4.2))
            erosion = max(0, m - 5) * decay * 0.9
            trajectory_samples[m - 1].append(clamp(growth - erosion, 0, 45))

        # Risks aren't hard cutoffs in the real world -- they're more likely
        # the closer/further you are from a threshold, not certain either
        # side of it. Sampling a Bernoulli draw from a smooth probability
        # curve captures that instead of a brittle if/else.
        formulary_p = sigmoid((price - 2100) / 160)
        if random.random() < formulary_p:
            risk_triggers["formulary"] += 1

        margin_p = sigmoid((750 - price) / 110)
        if random.random() < margin_p:
            risk_triggers["margin"] += 1

        proximity = math.exp(-(price_delta**2) / (2 * 0.12**2))
        retaliation_p = proximity * (hostility_sample / 2) * 0.85
        if random.random() < retaliation_p:
            risk_triggers["retaliation"] += 1

        if dosing == "Monthly" and evidence_sample < 0.4:
            differentiation_p = clamp((0.4 - evidence_sample) / 0.4, 0, 1) * 0.8
            if random.random() < differentiation_p:
                risk_triggers["differentiation"] += 1

    norm = {
        "ceo": mean(weight_samples["ceo"]),
        "cfo": mean(weight_samples["cfo"]),
        "cmo": mean(weight_samples["cmo"]),
    }

    robustness_mean = round(mean(robustness_samples))
    robustness_p10 = round(percentile(robustness_samples, 0.1))
    robustness_p90 = round(percentile(robustness_samples, 0.9))

    trajectory = []
    for i, samples in enumerate(trajectory_samples):
        trajectory.append({
            "month": f"M{i + 1}",
            "p10": round(percentile(samples, 0.1), 1),
            "median": round(percentile(samples, 0.5), 1),
            "p90": round(percentile(samples, 0.9), 1),
        })

    freq = {k: v / iterations for k, v in risk_triggers.items()}

    risks = []
    if freq["formulary"] >= 0.05:
        risks.append({
            "title": "Formulary exclusion risk",
            "detail": f"Triggered in {round(freq['formulary'] * 100)}% of simulated market conditions — payers are likely to reject coverage without a supplemental rebate structure at this price.",
            "severity": "high" if freq["formulary"] >= 0.5 else "medium",
            "frequency": round(freq["formulary"] * 100, 1),
        })
    if freq["margin"] >= 0.05:
        risks.append({
            "title": "Margin erosion risk",
            "detail": f"Triggered in {round(freq['margin'] * 100)}% of simulated conditions — the contribution margin turns negative within 8 months at this price.",
            "severity": "high" if freq["margin"] >= 0.5 else "medium",
            "frequency": round(freq["margin"] * 100, 1),
        })
    if freq["retaliation"] >= 0.05:
        risks.append({
            "title": "Rival retaliation predicted",
            "detail": f"Triggered in {round(freq['retaliation'] * 100)}% of simulated conditions — pricing near parity with incumbents raises the odds of a matching price cut within 60 days.",
            "severity": "high" if freq["retaliation"] >= 0.5 else "medium",
            "frequency": round(freq["retaliation"] * 100, 1),
        })
    if freq["differentiation"] >= 0.05:
        risks.append({
            "title": "Differentiation gap",
            "detail": f"Triggered in {round(freq['differentiation'] * 100)}% of simulated conditions — monthly dosing is a real convenience edge over weekly rivals, but the messaging mix under-leverages it.",
            "severity": "medium" if freq["differentiation"] >= 0.3 else "low",
            "frequency": round(freq["differentiation"] * 100, 1),
        })
    risks.sort(key=lambda r: -r["frequency"])

    if not risks:
        risks.append({
            "title": "No critical blind spots detected",
            "detail": f"This configuration held stable across {iterations:,} simulated market conditions. Minor sensitivity remains at the pricing edges.",
            "severity": "clear",
            "frequency": 0,
        })

    playbook = []
    if freq["formulary"] >= 0.3:
        playbook.append("Lower list price toward $1,400–$1,800 or pre-negotiate a payer rebate before launch.")
    if freq["margin"] >= 0.3:
        playbook.append("Raise price toward $950+ to protect margin, or confirm volume assumptions can absorb thinner unit economics.")
    if freq["retaliation"] >= 0.3:
        playbook.append("Widen price separation from incumbents or prepare a pre-committed response playbook for a rival price cut.")
    if freq["differentiation"] >= 0.3:
        playbook.append("Shift clinical messaging weight toward convenience and adherence data, not just headline weight-loss percentage.")
    if not playbook:
        playbook.append("Lock current parameters as the launch baseline and proceed to payer contracting.")
    playbook.append(f"Re-run with Competitor Hostility set to High to stress-test worst-case retaliation across {iterations:,} simulated conditions.")

    # Nash equilibrium competitor model. This is a real best-response
    # solve (Bertrand-Nash tatonnement over a logit demand model), not a
    # label on the Monte Carlo above -- it answers a different question:
    # given Amgen's chosen price, what would two named rational
    # competitors actually do, and separately, what price would a fully
    # rational Amgen have chosen. Capped at a smaller sample count than
    # the main loop since each solve is far more expensive than one
    # Monte Carlo draw.
    game_iterations = min(iterations, 600)
    novo_price_samples = []
    lilly_price_samples = []
    amgen_share_samples = []
    nash_price_samples = []

    for _ in range(game_iterations):
        hostility_sample = clamp(hostility_idx + random.gauss(0, 0.4), 0, 2)
        evidence_sample = clamp(evidence_weight + random.gauss(0, 0.06), 0, 1)
        dosing_bonus_sample = max(0, dosing_convenience_bonus + random.gauss(0, 0.015))

        amgen_quality = 3.6 + dosing_bonus_sample * 1.4 + evidence_sample * 1.0 + random.gauss(0, 0.08)
        amgen_cost = clamp(480 + random.gauss(0, 15), 400, 600)

        # Higher hostility = competitors defend share more aggressively,
        # i.e. they're willing to accept thinner margin (lower effective
        # cost floor) to win the equilibrium.
        hostility_factor = 1 - 0.15 * hostility_sample
        novo_cost = clamp(NOVO["cost"] * hostility_factor + random.gauss(0, 10), 300, 600)
        lilly_cost = clamp(LILLY["cost"] * hostility_factor + random.gauss(0, 10), 300, 600)

        p_novo, p_lilly, amgen_share = solve_competitor_reaction(price, amgen_quality, novo_cost, lilly_cost)
        p_amgen_star = solve_joint_equilibrium(amgen_quality, amgen_cost, novo_cost, lilly_cost)

        novo_price_samples.append(p_novo)
        lilly_price_samples.append(p_lilly)
        amgen_share_samples.append(amgen_share * 100)
        nash_price_samples.append(p_amgen_star)

    def band(samples, digits=0):
        return {
            "p10": round(percentile(samples, 0.1), digits),
            "median": round(percentile(samples, 0.5), digits),
            "p90": round(percentile(samples, 0.9), digits),
        }

    nash_median = percentile(nash_price_samples, 0.5)
    price_gap_pct = round((price - nash_median) / nash_median * 100, 1)

    competitive = {
        "novo_nordisk": band(novo_price_samples),
        "eli_lilly": band(lilly_price_samples),
        "amgen_share_pct": band(amgen_share_samples, 1),
        "nash_equilibrium_price": band(nash_price_samples),
        "price_gap_pct": price_gap_pct,
        "game_iterations": game_iterations,
    }

    return {
        "norm": norm,
        "robustness": robustness_mean,
        "robustness_p10": robustness_p10,
        "robustness_p90": robustness_p90,
        "trajectory": trajectory,
        "risks": risks,
        "playbook": playbook,
        "iterations": iterations,
        "competitive": competitive,
    }
