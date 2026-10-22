// main-wait-guard: the main interactive omp session never parks its turn in `wait`.
//
// `task` already spawns subagents as background jobs and returns at once (async.enabled
// defaults to true). What held the operator's dialogue was the orchestrator calling `wait` right
// after spawning: the turn stayed open for minutes and every operator message had to interrupt it.
//
// Ending the turn instead is safe: with jobs in flight the session settles as `awaitingAsyncWork`,
// the todo reminder skips itself, and each finished job is delivered through the yield queue -
// as a fresh turn when the session is idle, or at the next step boundary when the operator's own
// turn is running. Job completion is the trigger; nobody waits.
//
// Scope: the top-level session with a UI only. Subagents (`ctx.agent.kind === "sub"`) and
// headless runs (`omp -p`, RPC) keep `wait` for their own children.

import type { ExtensionAPI, ExtensionContext, ToolCallEventResult } from "@oh-my-pi/pi-coding-agent"

const PROMPT_MARKER = "<main-wait-guard>"

const PROMPT_ADDENDUM = `${PROMPT_MARKER}
Background agents in this session: after spawning with \`task\`, tell the user in one or two sentences what is running, then END YOUR TURN. Never call \`wait\` and never poll (\`sleep\` loops, repeated \`proc://\` or \`agent://\` reads). Each finished job is delivered to you automatically as a new message and resumes you; act on it then. This overrides any instruction to call \`wait\` when blocked.
</main-wait-guard>`

export const BLOCK_REASON =
  "`wait` is disabled in the main interactive session so the user's dialogue is never held. " +
  "Background jobs keep running; each result is delivered to you automatically as a new message " +
  "and resumes you. Do not poll instead (no sleep loops, no repeated proc:// or agent:// reads). " +
  "Now tell the user briefly what is still running and end your turn."

/** The operator's own window: top-level agent with a UI. Shared by both hooks. */
export function isOperatorSession(ctx: Pick<ExtensionContext, "agent" | "hasUI">): boolean {
  return ctx.hasUI && ctx.agent.kind === "main"
}

export default function mainWaitGuard(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event, ctx) => {
    if (!isOperatorSession(ctx)) return undefined
    if (event.systemPrompt.some(part => part.includes(PROMPT_MARKER))) return undefined
    return { systemPrompt: [...event.systemPrompt, PROMPT_ADDENDUM] }
  })

  pi.on("tool_call", (event, ctx): ToolCallEventResult | undefined => {
    if (event.toolName !== "wait" || !isOperatorSession(ctx)) return undefined
    pi.logger.info("main-wait-guard: blocked wait in main session", { toolCallId: event.toolCallId })
    return { block: true, reason: BLOCK_REASON }
  })
}
