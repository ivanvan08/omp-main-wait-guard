import { describe, expect, test } from "bun:test"
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent"
import mainWaitGuard, { BLOCK_REASON } from "../extensions/main-wait-guard"

type HandlerResult = { block?: boolean; reason?: string; systemPrompt?: string[] } | undefined
type Handler = (event: object, ctx: object) => HandlerResult

function activate(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  const pi = { on: (name: string, fn: Handler) => (handlers[name] = fn), logger: { info() {} } }
  // The factory only calls `on` and `logger.info`; a full ExtensionAPI is not constructible here.
  mainWaitGuard(pi as unknown as ExtensionAPI)
  return handlers
}

const operator = { hasUI: true, agent: { kind: "main" } }
const subagent = { hasUI: false, agent: { kind: "sub" } }
const tanClone = { hasUI: true, agent: { kind: "sub" } }
const headless = { hasUI: false, agent: { kind: "main" } }

describe("tool_call", () => {
  const { tool_call } = activate()
  const wait = { toolName: "wait", toolCallId: "t1", input: {} }

  test("blocks wait in the operator session with the end-your-turn reason", () => {
    expect(tool_call(wait, operator)).toEqual({ block: true, reason: BLOCK_REASON })
  })

  test("leaves wait to subagents, /tan clones and headless runs", () => {
    for (const ctx of [subagent, tanClone, headless]) expect(tool_call(wait, ctx)).toBeUndefined()
  })

  test("does not touch other tools in the operator session", () => {
    expect(tool_call({ toolName: "task", toolCallId: "t2", input: {} }, operator)).toBeUndefined()
  })
})

describe("before_agent_start", () => {
  const { before_agent_start } = activate()

  test("appends the guidance once to the operator prompt", () => {
    const prompt = before_agent_start({ systemPrompt: ["base"] }, operator)?.systemPrompt ?? []
    expect(prompt[0]).toBe("base")
    expect(prompt).toHaveLength(2)
    expect(before_agent_start({ systemPrompt: prompt }, operator)).toBeUndefined()
  })

  test("leaves subagent and headless prompts unchanged", () => {
    for (const ctx of [subagent, tanClone, headless]) {
      expect(before_agent_start({ systemPrompt: ["base"] }, ctx)).toBeUndefined()
    }
  })
})
