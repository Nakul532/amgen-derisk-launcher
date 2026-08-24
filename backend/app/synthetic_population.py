import random

# Featurely's core product simulates a population of individually modeled
# synthetic people, each with explicit behavioral traits, each making their
# own explainable decision, aggregated to a population-level result. This
# module applies that same architecture to a drug launch: instead of one
# aggregate "formulary exclusion risk" probability, we generate a population
# of synthetic payer/formulary reviewers, each with their own traits, and
# let each one individually decide whether to grant favorable coverage.
#
# Trait distributions are built from public information about how GLP-1
# launches (Wegovy, Zepbound) have played out in the market, plus reasonable
# assumptions where public information runs out. They are not sourced from
# Amgen's real internal data or any payer's real internal criteria.

POPULATION_SIZE_DEFAULT = 1000


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def generate_agent(price, dosing_convenience_bonus, evidence_weight, hostility_idx):
    # Each synthetic reviewer has their own price tolerance, their own
    # weighting of cardiovascular outcomes data vs headline weight-loss
    # numbers, their own current budget pressure, and their own existing
    # bias toward the entrenched incumbents.
    price_threshold = max(300, random.gauss(2100, 350))
    evidence_trust = clamp(random.gauss(0.5, 0.2), 0, 1)
    budget_pressure = clamp(random.gauss(0.5, 0.25), 0, 1)
    incumbent_bias = clamp(random.gauss(0.5, 0.2), 0, 1)

    price_over = (price - price_threshold) / price_threshold
    evidence_mismatch = abs(evidence_weight - evidence_trust)
    # Budget pressure and incumbent bias are tiebreakers, not independent
    # penalties -- a genuinely good price should be able to overcome them.
    # They only bite once price stops being a clear win on its own.
    price_strain = clamp(0.3 + price_over, 0, 1)

    drivers = {
        "price": -price_over * 1.1,
        "evidence": -evidence_mismatch * 0.5,
        "budget": -budget_pressure * 0.6 * price_strain,
        "incumbent": -incumbent_bias * 0.3 * price_strain,
    }
    score = sum(drivers.values()) + dosing_convenience_bonus * 0.5 - hostility_idx * 0.05

    if score >= 0.05:
        decision = "favorable"
        primary_driver = None
    elif score >= -0.25:
        decision = "rebate_required"
        primary_driver = min(drivers, key=drivers.get)
    else:
        decision = "exclude"
        primary_driver = min(drivers, key=drivers.get)

    return {
        "decision": decision,
        "primary_driver": primary_driver,
        "traits": {
            "price_threshold": round(price_threshold),
            "evidence_trust": round(evidence_trust, 2),
            "budget_pressure": round(budget_pressure, 2),
            "incumbent_bias": round(incumbent_bias, 2),
        },
    }


def run_population(price, dosing_convenience_bonus, evidence_weight, hostility_idx, population_size=POPULATION_SIZE_DEFAULT):
    agents = [generate_agent(price, dosing_convenience_bonus, evidence_weight, hostility_idx) for _ in range(population_size)]

    favorable = sum(1 for a in agents if a["decision"] == "favorable")
    rebate = sum(1 for a in agents if a["decision"] == "rebate_required")
    exclude = sum(1 for a in agents if a["decision"] == "exclude")

    rejecting = [a for a in agents if a["decision"] != "favorable"]
    driver_counts = {"price": 0, "evidence": 0, "budget": 0, "incumbent": 0}
    for a in rejecting:
        if a["primary_driver"]:
            driver_counts[a["primary_driver"]] += 1
    total_rejecting = len(rejecting) or 1
    rejection_drivers = {k: round(v / total_rejecting * 100, 1) for k, v in driver_counts.items()}

    driver_labels = {
        "price": "Price exceeds their formulary threshold",
        "evidence": "Clinical evidence strategy doesn't match what they weigh most",
        "budget": "Current budget pressure limits new favorable-tier approvals",
        "incumbent": "Existing bias toward incumbent options",
    }

    samples = []
    for target in ["favorable", "rebate_required", "exclude"]:
        candidates = [a for a in agents if a["decision"] == target]
        if candidates:
            a = candidates[0]
            explanation = "Grants favorable coverage." if a["decision"] == "favorable" else driver_labels.get(a["primary_driver"], "")
            samples.append({
                "decision": a["decision"],
                "traits": a["traits"],
                "explanation": explanation,
            })

    return {
        "population_size": population_size,
        "coverage_rate": round(favorable / population_size * 100, 1),
        "favorable_pct": round(favorable / population_size * 100, 1),
        "rebate_required_pct": round(rebate / population_size * 100, 1),
        "exclude_pct": round(exclude / population_size * 100, 1),
        "rejection_drivers": rejection_drivers,
        "sample_agents": samples,
    }
