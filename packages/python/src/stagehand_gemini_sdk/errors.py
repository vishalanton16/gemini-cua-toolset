class SafetyDecisionError(RuntimeError):
    pass


class InteractionError(RuntimeError):
    pass


class MaxTurnsError(InteractionError):
    pass
