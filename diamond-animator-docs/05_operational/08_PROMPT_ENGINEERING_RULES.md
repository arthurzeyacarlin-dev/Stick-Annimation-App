> **Reference only — non-authoritative.** This legacy operational note is superseded. Use the canonical control plane at [docs/README.md](../../docs/README.md).

Prompt Engineering Rules define how instructions should be written when communicating with Codex.

Prompts should be written clearly and should describe the task that needs to be performed. Whenever possible, prompts should reference the relevant documentation files so that Codex understands the context of the request.

Prompts should avoid vague instructions. Instead, they should specify the system that is being modified, the files that may be affected, and the expected outcome of the change.

Large tasks should be broken into smaller steps whenever possible. This reduces the likelihood of errors and makes it easier to review the results of each implementation.

After Codex completes a task, the results should be reviewed before moving on to additional changes.

Following these rules helps ensure that Codex produces reliable and consistent implementation results.
