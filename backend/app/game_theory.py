import math

# Illustrative competitive-positioning assumptions for MariTide's two named
# incumbents in the GLP-1/dual-agonist weight-loss category. These are NOT
# sourced from Novo Nordisk or Eli Lilly's real financials or strategy --
# they're modeled placeholders (quality/cost) chosen to be directionally
# plausible (Novo = trusted incumbent, Lilly = aggressive value entrant) so
# the equilibrium solver has something concrete to react to. Replace with
# real market data before using this for an actual pricing decision.
NOVO = {"name": "Novo Nordisk", "quality": 4.2, "cost": 500}
LILLY = {"name": "Eli Lilly", "quality": 4.0, "cost": 450}

PRICE_SENSITIVITY = 0.002
PRICE_LO, PRICE_HI = 400, 3000


def logit_shares(utilities: dict) -> dict:
    m = max(utilities.values())
    exps = {k: math.exp(v - m) for k, v in utilities.items()}
    total = sum(exps.values())
    return {k: v / total for k, v in exps.items()}


def _utility(price: float, quality: float) -> float:
    return quality - PRICE_SENSITIVITY * price


def _profit(price: float, quality: float, cost: float, other_utilities: dict) -> float:
    utilities = dict(other_utilities)
    utilities["self"] = _utility(price, quality)
    share = logit_shares(utilities)["self"]
    return (price - cost) * share


def best_response_price(quality: float, cost: float, other_utilities: dict, iters: int = 18) -> float:
    lo, hi = PRICE_LO, PRICE_HI
    for _ in range(iters):
        m1 = lo + (hi - lo) / 3
        m2 = hi - (hi - lo) / 3
        if _profit(m1, quality, cost, other_utilities) < _profit(m2, quality, cost, other_utilities):
            lo = m1
        else:
            hi = m2
    return (lo + hi) / 2


def solve_competitor_reaction(amgen_price: float, amgen_quality: float, novo_cost: float, lilly_cost: float, rounds: int = 5):
    """Two-follower Bertrand-Nash reaction: Amgen's price is held fixed (the
    user's chosen configuration); Novo and Lilly best-respond to it and to
    each other until prices stabilize."""
    amgen_utility = _utility(amgen_price, amgen_quality)
    p_novo, p_lilly = 1300.0, 1000.0
    for _ in range(rounds):
        p_novo = best_response_price(NOVO["quality"], novo_cost, {"amgen": amgen_utility, "lilly": _utility(p_lilly, LILLY["quality"])})
        p_lilly = best_response_price(LILLY["quality"], lilly_cost, {"amgen": amgen_utility, "novo": _utility(p_novo, NOVO["quality"])})

    utilities = {
        "amgen": amgen_utility,
        "novo": _utility(p_novo, NOVO["quality"]),
        "lilly": _utility(p_lilly, LILLY["quality"]),
    }
    shares = logit_shares(utilities)
    return p_novo, p_lilly, shares["amgen"]


def solve_joint_equilibrium(amgen_quality: float, amgen_cost: float, novo_cost: float, lilly_cost: float, rounds: int = 5):
    """Full 3-way Bertrand-Nash equilibrium -- Amgen's price also floats and
    best-responds, giving a theoretical benchmark price independent of what
    the user actually chose."""
    p_amgen, p_novo, p_lilly = 1300.0, 1300.0, 1000.0
    for _ in range(rounds):
        p_amgen = best_response_price(amgen_quality, amgen_cost, {"novo": _utility(p_novo, NOVO["quality"]), "lilly": _utility(p_lilly, LILLY["quality"])})
        p_novo = best_response_price(NOVO["quality"], novo_cost, {"amgen": _utility(p_amgen, amgen_quality), "lilly": _utility(p_lilly, LILLY["quality"])})
        p_lilly = best_response_price(LILLY["quality"], lilly_cost, {"amgen": _utility(p_amgen, amgen_quality), "novo": _utility(p_novo, NOVO["quality"])})
    return p_amgen
