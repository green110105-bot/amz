from dataclasses import dataclass


@dataclass(frozen=True)
class BoundaryStatus:
    service: str = "python-ai-service"
    runtime_truth: str = "node-mock-gated"
    write_policy: str = "audit-draft-only"


def health() -> BoundaryStatus:
    return BoundaryStatus()
