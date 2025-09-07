"""Simple Bayesian Knowledge Tracing (BKT) helper.

Exposes a rule-based update to estimate the next-step knowledge probability.
"""

def predict(p_know: float, p_learn: float, p_slip: float, p_guess: float, correct: bool) -> float:
    """Update knowledge belief given the latest response using BKT.

    Args:
        p_know: Prior probability the learner knows the skill (0..1).
        p_learn: Learning probability between steps (0..1).
        p_slip: Probability of an incorrect response despite knowing (0..1).
        p_guess: Probability of a correct response despite not knowing (0..1).
        correct: Whether the latest response was correct.

    Returns:
        The posterior probability the learner knows the skill at the next step.
    """
    if correct:
        p_know_given = (p_know * (1 - p_slip)) / (p_know * (1 - p_slip) + (1 - p_know) * p_guess + 1e-9)
    else:
        p_know_given = (p_know * p_slip) / (p_know * p_slip + (1 - p_know) * (1 - p_guess) + 1e-9)
    p_next = p_know_given + (1 - p_know_given) * p_learn
    return float(p_next)
